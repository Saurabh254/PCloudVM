package qemu

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/saurabh254/PCloudVM/backend/internal/model"
)

type ProcessConfig struct {
	QemuBinary    string
	InstanceID    string
	VCPU          int
	MemoryMB      int
	DiskPath      string
	SeedISOPath   string
	AllowedPorts  []model.PortRule
	QMPSocketPath string
	PIDFilePath   string
	SerialLogPath string
	EnableKVM     bool
}

// BuildQemuArgs prepares the command line arguments for headless QEMU
func BuildQemuArgs(cfg ProcessConfig) []string {
	args := []string{
		"-name", cfg.InstanceID,
		"-m", fmt.Sprintf("%dM", cfg.MemoryMB),
		"-smp", strconv.Itoa(cfg.VCPU),
	}

	if cfg.EnableKVM {
		args = append(args, "-enable-kvm", "-cpu", "host")
	} else {
		args = append(args, "-cpu", "qemu64")
	}

	// Headless display & serial log capture
	args = append(args,
		"-display", "none",
		"-serial", fmt.Sprintf("file:%s", cfg.SerialLogPath),
	)

	// Primary disk drive
	args = append(args,
		"-drive", fmt.Sprintf("file=%s,if=virtio,format=qcow2,cache=writeback", cfg.DiskPath),
	)

	// Seed ISO for cloud-init (if present)
	if cfg.SeedISOPath != "" {
		if _, err := os.Stat(cfg.SeedISOPath); err == nil {
			args = append(args,
				"-drive", fmt.Sprintf("file=%s,media=cdrom,readonly=on", cfg.SeedISOPath),
			)
		}
	}

	// Network: user mode netdev with dynamic port forwards
	var netdevParts []string
	netdevParts = append(netdevParts, "user", "id=net0")
	for _, port := range cfg.AllowedPorts {
		proto := strings.ToLower(port.Protocol)
		if proto == "" {
			proto = "tcp"
		}
		netdevParts = append(netdevParts, fmt.Sprintf("hostfwd=%s::%d-:%d", proto, port.HostPort, port.GuestPort))
	}

	args = append(args,
		"-netdev", strings.Join(netdevParts, ","),
		"-device", "virtio-net-pci,netdev=net0",
	)

	// QMP control socket
	args = append(args,
		"-device", "virtio-balloon-pci,id=balloon0",
		"-qmp", fmt.Sprintf("unix:%s,server,nowait", cfg.QMPSocketPath),
	)

	// PID file & daemonization
	args = append(args,
		"-pidfile", cfg.PIDFilePath,
		"-daemonize",
	)

	return args
}

// LaunchProcess executes QEMU in headless daemon mode and returns its PID
func LaunchProcess(cfg ProcessConfig) (int, error) {
	if cfg.QemuBinary == "" {
		cfg.QemuBinary = "qemu-system-x86_64"
	}

	// Clean up stale socket & pidfile if any
	_ = os.Remove(cfg.QMPSocketPath)
	_ = os.Remove(cfg.PIDFilePath)

	// Ensure directories exist
	_ = os.MkdirAll(filepath.Dir(cfg.QMPSocketPath), 0755)
	_ = os.MkdirAll(filepath.Dir(cfg.PIDFilePath), 0755)
	_ = os.MkdirAll(filepath.Dir(cfg.SerialLogPath), 0755)

	args := BuildQemuArgs(cfg)

	cmd := exec.Command(cfg.QemuBinary, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return 0, fmt.Errorf("qemu failed to launch: %w, output: %s", err, string(out))
	}

	// Wait up to 3 seconds for PID file to be written
	var pid int
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		pidBytes, err := os.ReadFile(cfg.PIDFilePath)
		if err == nil {
			pidStr := strings.TrimSpace(string(pidBytes))
			if p, err := strconv.Atoi(pidStr); err == nil && p > 0 {
				pid = p
				break
			}
		}
		time.Sleep(100 * time.Millisecond)
	}

	if pid == 0 {
		return 0, errors.New("qemu started but failed to record pid")
	}

	if !IsProcessAlive(pid) {
		return 0, fmt.Errorf("qemu process %d exited immediately", pid)
	}

	return pid, nil
}

// IsProcessAlive checks whether a process is still running
func IsProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

// ForceKillProcess terminates a process using SIGTERM followed by SIGKILL
func ForceKillProcess(pid int) error {
	if pid <= 0 || !IsProcessAlive(pid) {
		return nil
	}

	proc, err := os.FindProcess(pid)
	if err != nil {
		return nil
	}

	_ = proc.Signal(syscall.SIGTERM)

	// Wait up to 2 seconds for graceful exit
	for i := 0; i < 20; i++ {
		if !IsProcessAlive(pid) {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}

	// Force kill with SIGKILL
	_ = proc.Signal(syscall.SIGKILL)
	return nil
}

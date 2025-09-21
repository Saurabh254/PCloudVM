package service

import (
	"fmt"
	"os/exec"
	"strings"

	"github.com/saurabh254/PCloudVM/backend/internal/config"
	"go.uber.org/zap"
)

func BootVM(id string, ram string, cpu int, max_cpu int) error {
	qemuPath := "qemu-system-x86_64"

	args := []string{
		"-enable-kvm",
		"-cpu", "host",
		"-m", ram,
		"-smp", fmt.Sprintf("%d,maxcpus=%d", cpu, max_cpu),
		"-hda", "/home/saurabh254/codes/PCloudVM/backend/images/debian-amd64.qcow2",
		"-boot", "d",
		"-name", id,
		"-nic", "user,id=net0,hostfwd=tcp::2222-:22",
		"-qmp", "unix:/tmp/qmp-sock,server,nowait",
		"-serial", "file:/dev/null",
		"-vga", "virtio",
		"-display", "vnc=:1",
		"-daemonize",
	}

	cmd := exec.Command(qemuPath, args...)
	config.Logger.Debug("trying to booting qemu", zap.String("args", strings.Join(args, " ")))
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("error starting QEMU: %w", err)
	}
	return nil
}

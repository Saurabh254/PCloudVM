package qemu

import (
	"strings"
	"testing"

	"github.com/saurabh254/PCloudVM/backend/internal/model"
)

func TestBuildQemuArgs(t *testing.T) {
	cfg := ProcessConfig{
		QemuBinary:    "qemu-system-x86_64",
		InstanceID:    "i-abc12345",
		VCPU:          2,
		MemoryMB:      2048,
		DiskPath:      "/tmp/test.qcow2",
		SeedISOPath:   "/tmp/seed.iso",
		AllowedPorts:  []model.PortRule{
			{GuestPort: 22, HostPort: 10022, Protocol: "tcp"},
			{GuestPort: 80, HostPort: 10080, Protocol: "tcp"},
		},
		QMPSocketPath: "/tmp/qmp.sock",
		PIDFilePath:   "/tmp/qemu.pid",
		SerialLogPath: "/tmp/serial.log",
		EnableKVM:     true,
	}

	args := BuildQemuArgs(cfg)
	cmdLine := strings.Join(args, " ")

	expectedFragments := []string{
		"-name i-abc12345",
		"-m 2048M",
		"-smp 2",
		"-enable-kvm -cpu host",
		"-display none",
		"-serial file:/tmp/serial.log",
		"-drive file=/tmp/test.qcow2,if=virtio,format=qcow2,cache=writeback",
		"hostfwd=tcp::10022-:22",
		"hostfwd=tcp::10080-:80",
		"-qmp unix:/tmp/qmp.sock,server,nowait",
		"-pidfile /tmp/qemu.pid",
		"-daemonize",
	}

	for _, frag := range expectedFragments {
		if !strings.Contains(cmdLine, frag) {
			t.Errorf("expected cmdline to contain '%s', got: %s", frag, cmdLine)
		}
	}
}

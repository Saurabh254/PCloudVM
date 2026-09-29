package model

import (
	"testing"
)

func TestGetInstanceType(t *testing.T) {
	tests := []struct {
		name      string
		wantVCPU  int
		wantMem   int
		shouldErr bool
	}{
		{"t2.nano", 1, 512, false},
		{"t2.micro", 1, 1024, false},
		{"t2.small", 1, 2048, false},
		{"t2.medium", 2, 4096, false},
		{"c5.large", 2, 4096, false},
		{"m5.large", 2, 8192, false},
		{"nonexistent.type", 0, 0, true},
	}

	for _, tt := range tests {
		cfg, err := GetInstanceType(tt.name)
		if tt.shouldErr {
			if err == nil {
				t.Errorf("expected error for %s, got nil", tt.name)
			}
		} else {
			if err != nil {
				t.Errorf("unexpected error for %s: %v", tt.name, err)
			}
			if cfg.VCPU != tt.wantVCPU {
				t.Errorf("got VCPU %d, want %d", cfg.VCPU, tt.wantVCPU)
			}
			if cfg.MemoryMB != tt.wantMem {
				t.Errorf("got MemoryMB %d, want %d", cfg.MemoryMB, tt.wantMem)
			}
		}
	}
}

func TestListInstanceTypes(t *testing.T) {
	list := ListInstanceTypes()
	if len(list) < 5 {
		t.Errorf("expected at least 5 instance types, got %d", len(list))
	}
}

func TestSSHCommand(t *testing.T) {
	inst := &Instance{
		AllowedPorts: []PortRule{
			{GuestPort: 80, HostPort: 10080, Protocol: "tcp"},
			{GuestPort: 22, HostPort: 10022, Protocol: "tcp"},
		},
	}

	cmd := inst.SSHCommand()
	if cmd != "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 10022 cloud-user@localhost (or cirros/debian/root)" {
		t.Errorf("unexpected SSH command output: %s", cmd)
	}

	noSSHInst := &Instance{
		AllowedPorts: []PortRule{
			{GuestPort: 80, HostPort: 10080, Protocol: "tcp"},
		},
	}
	if noSSHInst.SSHCommand() != "Port 22 not exposed" {
		t.Errorf("expected 'Port 22 not exposed', got %s", noSSHInst.SSHCommand())
	}
}

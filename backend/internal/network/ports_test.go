package network

import (
	"testing"

	"github.com/saurabh254/PCloudVM/backend/internal/model"
)

func TestPortManagerAllocation(t *testing.T) {
	pm := NewPortManager(10000, 10005)

	reqs := []model.PortRuleRequest{
		{GuestPort: 22, Protocol: "tcp"},
		{GuestPort: 80, Protocol: "tcp"},
	}

	allocated, err := pm.AllocatePorts("inst-1", reqs)
	if err != nil {
		t.Fatalf("failed to allocate ports: %v", err)
	}

	if len(allocated) != 2 {
		t.Fatalf("expected 2 allocated ports, got %d", len(allocated))
	}

	for _, rule := range allocated {
		if rule.HostPort < 10000 || rule.HostPort > 10005 {
			t.Errorf("host port %d out of range", rule.HostPort)
		}
	}

	// Release inst-1
	pm.ReleasePorts("inst-1")

	// Allocate again
	allocated2, err := pm.AllocatePorts("inst-2", reqs)
	if err != nil {
		t.Fatalf("failed to re-allocate after release: %v", err)
	}
	if len(allocated2) != 2 {
		t.Fatalf("expected 2 allocated ports, got %d", len(allocated2))
	}
}

func TestExplicitHostPortAllocation(t *testing.T) {
	pm := NewPortManager(10000, 10010)

	reqs := []model.PortRuleRequest{
		{GuestPort: 22, HostPort: 10050, Protocol: "tcp"},
	}

	rules, err := pm.AllocatePorts("inst-1", reqs)
	if err != nil {
		t.Fatalf("failed to allocate explicit host port: %v", err)
	}
	if rules[0].HostPort != 10050 {
		t.Errorf("expected host port 10050, got %d", rules[0].HostPort)
	}

	// Try allocating the same host port to another instance
	_, err = pm.AllocatePorts("inst-2", reqs)
	if err == nil {
		t.Error("expected conflict error when assigning already reserved host port, got nil")
	}
}

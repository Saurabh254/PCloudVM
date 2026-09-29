package orchestrator

import (
	"os"
	"path/filepath"
	"testing"

	"go.uber.org/zap"

	"github.com/saurabh254/PCloudVM/backend/internal/config"
	"github.com/saurabh254/PCloudVM/backend/internal/model"
	"github.com/saurabh254/PCloudVM/backend/internal/network"
	"github.com/saurabh254/PCloudVM/backend/internal/storage"
	"github.com/saurabh254/PCloudVM/backend/internal/store"
)

func TestOrchestratorOperations(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "orch-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	cfg := &config.Config{
		AppName:       "Test Orchestrator",
		DataDir:       tempDir,
		ImagesDir:     filepath.Join(tempDir, "images"),
		InstancesDir:  filepath.Join(tempDir, "instances"),
		QemuBinary:    "qemu-system-x86_64",
		QemuImgBinary: "qemu-img",
		XorrisoBinary: "xorriso",
		EnableKVM:     false,
		MinHostPort:   11000,
		MaxHostPort:   12000,
	}

	_ = os.MkdirAll(cfg.ImagesDir, 0755)
	_ = os.MkdirAll(cfg.InstancesDir, 0755)

	logger := zap.NewNop()
	sm, err := storage.NewStorageManager(cfg.ImagesDir, cfg.QemuImgBinary)
	if err != nil {
		t.Fatal(err)
	}
	st, err := store.NewFileStore(cfg.DataDir)
	if err != nil {
		t.Fatal(err)
	}
	pm := network.NewPortManager(cfg.MinHostPort, cfg.MaxHostPort)

	orch := NewOrchestrator(cfg, st, sm, pm, logger)

	// 1. Create Instance
	createReq := model.CreateInstanceRequest{
		Name:         "test-instance-1",
		InstanceType: "t2.micro",
		AllowedPorts: []model.PortRuleRequest{
			{GuestPort: 22, Protocol: "tcp"},
			{GuestPort: 8080, Protocol: "tcp"},
		},
		SSHKeys: []string{
			"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI123456789 user@host",
		},
		AutoStart: false,
	}

	inst, err := orch.CreateInstance(createReq)
	if err != nil {
		t.Fatalf("failed to create instance: %v", err)
	}

	if inst.ID == "" {
		t.Error("expected non-empty instance ID")
	}
	if inst.VCPU != 1 || inst.MemoryMB != 1024 {
		t.Errorf("expected 1 vCPU and 1024MB RAM for t2.micro, got %d vCPU, %dMB", inst.VCPU, inst.MemoryMB)
	}
	if len(inst.AllowedPorts) != 2 {
		t.Errorf("expected 2 port mappings, got %d", len(inst.AllowedPorts))
	}
	if inst.SeedISOPath == "" {
		t.Error("expected seed ISO to be created for instance with SSH keys")
	}

	// 2. Edit Instance (Edit name, change instance type, grow disk, update ports)
	newName := "renamed-instance-1"
	newType := "t2.medium"
	newDisk := 35
	newPorts := []model.PortRuleRequest{
		{GuestPort: 22, Protocol: "tcp"},
		{GuestPort: 443, Protocol: "tcp"},
	}

	editReq := model.EditInstanceRequest{
		Name:         &newName,
		InstanceType: &newType,
		DiskSizeGB:   &newDisk,
		AllowedPorts: &newPorts,
	}

	edited, err := orch.EditInstance(inst.ID, editReq)
	if err != nil {
		t.Fatalf("failed to edit instance: %v", err)
	}

	if edited.Name != newName {
		t.Errorf("expected name %s, got %s", newName, edited.Name)
	}
	if edited.InstanceType != "t2.medium" || edited.VCPU != 2 || edited.MemoryMB != 4096 {
		t.Errorf("expected t2.medium specs (2 vCPU, 4096MB), got %d vCPU, %dMB", edited.VCPU, edited.MemoryMB)
	}
	if edited.DiskSizeGB != 35 {
		t.Errorf("expected disk size 35GB, got %d", edited.DiskSizeGB)
	}

	// 3. Get Live Status
	status, err := orch.GetLiveStatus(inst.ID)
	if err != nil {
		t.Fatalf("failed to get live status: %v", err)
	}
	if status.Status != model.StatusStopped {
		t.Errorf("expected status STOPPED, got %s", status.Status)
	}

	// 4. Terminate Instance
	if err := orch.TerminateInstance(inst.ID); err != nil {
		t.Fatalf("failed to terminate instance: %v", err)
	}

	// Verify instance directory is removed
	if _, err := os.Stat(inst.WorkDir); !os.IsNotExist(err) {
		t.Errorf("expected instance directory to be deleted, but still exists")
	}

	// Verify deleted from store
	_, err = orch.GetInstance(inst.ID)
	if err != store.ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

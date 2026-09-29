package orchestrator

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"go.uber.org/zap"

	"github.com/saurabh254/PCloudVM/backend/internal/config"
	"github.com/saurabh254/PCloudVM/backend/internal/model"
	"github.com/saurabh254/PCloudVM/backend/internal/network"
	"github.com/saurabh254/PCloudVM/backend/internal/storage"
	"github.com/saurabh254/PCloudVM/backend/internal/store"
)

func TestE2EVMLifecycle(t *testing.T) {
	// Look for cirros image
	cirrosPath := filepath.Join("..", "..", "data", "images", "cirros.qcow2")
	absPath, err := filepath.Abs(cirrosPath)
	if err != nil {
		t.Skip("Could not resolve cirros path")
	}
	if _, err := os.Stat(absPath); os.IsNotExist(err) {
		t.Skip("cirros.qcow2 not found, skipping real VM test")
	}

	tempDir, err := os.MkdirTemp("", "e2e-vm-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	cfg := &config.Config{
		AppName:       "E2E Orchestrator",
		DataDir:       tempDir,
		ImagesDir:     filepath.Dir(absPath),
		InstancesDir:  filepath.Join(tempDir, "instances"),
		QemuBinary:    "qemu-system-x86_64",
		QemuImgBinary: "qemu-img",
		XorrisoBinary: "xorriso",
		EnableKVM:     true,
		MinHostPort:   18000,
		MaxHostPort:   19000,
	}

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
		Name:         "e2e-test-vm",
		InstanceType: "t2.nano",
		BaseImage:    "cirros.qcow2",
		AllowedPorts: []model.PortRuleRequest{
			{GuestPort: 22, Protocol: "tcp"},
			{GuestPort: 80, Protocol: "tcp"},
		},
		SSHKeys: []string{
			"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBvA5o8gWz5Kx9X0e4V1f2a3B4c5D6e7F8g9H0i1J2k3 test@local",
		},
		AutoStart: false,
	}

	inst, err := orch.CreateInstance(createReq)
	if err != nil {
		t.Fatalf("failed to create instance: %v", err)
	}
	t.Logf("Created instance %s with ports: %+v", inst.ID, inst.AllowedPorts)

	// 2. Start VM
	inst, err = orch.StartInstance(inst.ID)
	if err != nil {
		t.Fatalf("failed to start VM: %v", err)
	}
	t.Logf("Started VM PID: %d", inst.PID)

	// Wait 1 second for QEMU initialization
	time.Sleep(1 * time.Second)

	// 3. Query Live Status
	liveStatus, err := orch.GetLiveStatus(inst.ID)
	if err != nil {
		t.Fatalf("failed to get live status: %v", err)
	}
	if liveStatus.Status != model.StatusRunning {
		t.Errorf("expected running status, got: %s", liveStatus.Status)
	}
	t.Logf("Live Status: status=%s, qemu_state=%s, pid=%d", liveStatus.Status, liveStatus.QemuState, liveStatus.PID)

	// 4. Pause VM
	inst, err = orch.PauseInstance(inst.ID)
	if err != nil {
		t.Fatalf("failed to pause VM: %v", err)
	}
	liveStatus, _ = orch.GetLiveStatus(inst.ID)
	if liveStatus.Status != model.StatusPaused {
		t.Errorf("expected paused status, got: %s", liveStatus.Status)
	}
	t.Logf("VM paused successfully: %s", liveStatus.Status)

	// 5. Resume VM
	inst, err = orch.ResumeInstance(inst.ID)
	if err != nil {
		t.Fatalf("failed to resume VM: %v", err)
	}
	liveStatus, _ = orch.GetLiveStatus(inst.ID)
	if liveStatus.Status != model.StatusRunning {
		t.Errorf("expected running status after resume, got: %s", liveStatus.Status)
	}
	t.Logf("VM resumed successfully: %s", liveStatus.Status)

	// 6. Live Edit Allowed Ports
	newPorts := []model.PortRuleRequest{
		{GuestPort: 22, Protocol: "tcp"},
		{GuestPort: 80, Protocol: "tcp"},
		{GuestPort: 8080, Protocol: "tcp"},
	}
	editReq := model.EditInstanceRequest{
		AllowedPorts: &newPorts,
	}
	inst, err = orch.EditInstance(inst.ID, editReq)
	if err != nil {
		t.Fatalf("failed to edit allowed ports live: %v", err)
	}
	if len(inst.AllowedPorts) != 3 {
		t.Errorf("expected 3 allowed ports, got %d", len(inst.AllowedPorts))
	}
	t.Logf("Live edit applied! New ports: %+v", inst.AllowedPorts)

	// 7. Stop VM
	inst, err = orch.StopInstance(inst.ID, model.StopInstanceRequest{Force: true})
	if err != nil {
		t.Fatalf("failed to stop VM: %v", err)
	}
	if inst.Status != model.StatusStopped {
		t.Errorf("expected stopped status, got: %s", inst.Status)
	}
	t.Logf("VM stopped successfully")

	// 8. Terminate VM
	if err := orch.TerminateInstance(inst.ID); err != nil {
		t.Fatalf("failed to terminate VM: %v", err)
	}
	t.Logf("VM terminated and purged successfully")
}

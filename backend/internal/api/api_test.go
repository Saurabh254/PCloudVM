package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"go.uber.org/zap"

	"github.com/saurabh254/PCloudVM/backend/internal/config"
	"github.com/saurabh254/PCloudVM/backend/internal/model"
	"github.com/saurabh254/PCloudVM/backend/internal/network"
	"github.com/saurabh254/PCloudVM/backend/internal/orchestrator"
	"github.com/saurabh254/PCloudVM/backend/internal/storage"
	"github.com/saurabh254/PCloudVM/backend/internal/store"
)

func setupTestServer(t *testing.T) (*httptest.Server, func()) {
	tempDir, err := os.MkdirTemp("", "api-test-*")
	if err != nil {
		t.Fatal(err)
	}

	cfg := &config.Config{
		AppName:       "Test Orchestrator",
		DataDir:       tempDir,
		ImagesDir:     filepath.Join(tempDir, "images"),
		InstancesDir:  filepath.Join(tempDir, "instances"),
		QemuBinary:    "qemu-system-x86_64",
		QemuImgBinary: "qemu-img",
		XorrisoBinary: "xorriso",
		EnableKVM:     false,
		MinHostPort:   15000,
		MaxHostPort:   16000,
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
	orch := orchestrator.NewOrchestrator(cfg, st, sm, pm, logger)

	apiHandler := NewAPI(orch, sm, cfg, logger)
	ts := httptest.NewServer(apiHandler.SetupRouter())

	cleanup := func() {
		ts.Close()
		_ = os.RemoveAll(tempDir)
	}

	return ts, cleanup
}

func TestAPILifecycle(t *testing.T) {
	ts, cleanup := setupTestServer(t)
	defer cleanup()

	// 1. Healthcheck
	resp, err := http.Get(ts.URL + "/healthz")
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("healthcheck failed: %v, status: %d", err, resp.StatusCode)
	}

	// 2. Instance Types
	resp, err = http.Get(ts.URL + "/api/v1/instance-types")
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("instance types failed: %v", err)
	}
	var types []model.InstanceTypeConfig
	_ = json.NewDecoder(resp.Body).Decode(&types)
	if len(types) == 0 {
		t.Error("expected non-empty instance types")
	}

	// 3. Create Instance (without auto_start to test state machine without spawning real process in CI test)
	createPayload := model.CreateInstanceRequest{
		Name:         "test-web-instance",
		InstanceType: "t2.micro",
		AllowedPorts: []model.PortRuleRequest{
			{GuestPort: 22, Protocol: "tcp"},
			{GuestPort: 80, Protocol: "tcp"},
		},
		SSHKeys: []string{
			"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI123456789 test@local",
		},
		AutoStart: false,
	}

	bodyBytes, _ := json.Marshal(createPayload)
	resp, err = http.Post(ts.URL+"/api/v1/instances", "application/json", bytes.NewReader(bodyBytes))
	if err != nil || resp.StatusCode != http.StatusCreated {
		t.Fatalf("create instance failed: %v, status: %d", err, resp.StatusCode)
	}

	var created model.Instance
	_ = json.NewDecoder(resp.Body).Decode(&created)
	if created.ID == "" {
		t.Fatal("expected instance ID to be populated")
	}
	if len(created.AllowedPorts) != 2 {
		t.Fatalf("expected 2 port mappings, got %d", len(created.AllowedPorts))
	}
	if created.Status != model.StatusStopped {
		t.Errorf("expected initial status STOPPED, got %s", created.Status)
	}

	// 4. Get Instance
	resp, err = http.Get(ts.URL + "/api/v1/instances/" + created.ID)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("get instance failed: %v", err)
	}

	// 5. List Instances
	resp, err = http.Get(ts.URL + "/api/v1/instances")
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("list instances failed: %v", err)
	}
	var list []model.Instance
	_ = json.NewDecoder(resp.Body).Decode(&list)
	if len(list) != 1 {
		t.Errorf("expected 1 instance in list, got %d", len(list))
	}

	// 6. Edit Instance (Change name, instance type, grow disk, update ports)
	newName := "renamed-instance"
	newType := "t2.small"
	newDisk := 25
	newPorts := []model.PortRuleRequest{
		{GuestPort: 22, Protocol: "tcp"},
		{GuestPort: 443, Protocol: "tcp"},
	}

	editPayload := model.EditInstanceRequest{
		Name:         &newName,
		InstanceType: &newType,
		DiskSizeGB:   &newDisk,
		AllowedPorts: &newPorts,
	}

	editBytes, _ := json.Marshal(editPayload)
	req, _ := http.NewRequest("PATCH", ts.URL+"/api/v1/instances/"+created.ID, bytes.NewReader(editBytes))
	req.Header.Set("Content-Type", "application/json")
	resp, err = http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("edit instance failed: %v, status: %d", err, resp.StatusCode)
	}

	var updated model.Instance
	_ = json.NewDecoder(resp.Body).Decode(&updated)
	if updated.Name != newName {
		t.Errorf("expected updated name %s, got %s", newName, updated.Name)
	}
	if updated.InstanceType != newType {
		t.Errorf("expected updated type %s, got %s", newType, updated.InstanceType)
	}
	if updated.DiskSizeGB != newDisk {
		t.Errorf("expected updated disk size %d, got %d", newDisk, updated.DiskSizeGB)
	}

	// 7. System Info
	resp, err = http.Get(ts.URL + "/api/v1/system/info")
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("system info failed: %v", err)
	}

	// 8. Terminate Instance
	req, _ = http.NewRequest("DELETE", ts.URL+"/api/v1/instances/"+created.ID, nil)
	resp, err = http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("terminate instance failed: %v, status: %d", err, resp.StatusCode)
	}

	// Verify it's deleted
	resp, err = http.Get(ts.URL + "/api/v1/instances/" + created.ID)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 after termination, got %d", resp.StatusCode)
	}
}

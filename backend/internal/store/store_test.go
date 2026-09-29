package store

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/saurabh254/PCloudVM/backend/internal/model"
)

func TestFileStoreLifecycle(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "store-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	st, err := NewFileStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	inst1 := &model.Instance{
		ID:           "i-test1",
		Name:         "test-vm-1",
		Status:       model.StatusStopped,
		InstanceType: "t2.micro",
		VCPU:         1,
		MemoryMB:     1024,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	// 1. Save
	if err := st.Save(inst1); err != nil {
		t.Fatalf("failed to save: %v", err)
	}

	// 2. Get
	fetched, err := st.Get("i-test1")
	if err != nil {
		t.Fatalf("failed to get: %v", err)
	}
	if fetched.Name != "test-vm-1" {
		t.Errorf("expected name 'test-vm-1', got '%s'", fetched.Name)
	}

	// 3. List
	list := st.List()
	if len(list) != 1 {
		t.Fatalf("expected 1 item in list, got %d", len(list))
	}

	// 4. Reload from disk to verify persistence
	st2, err := NewFileStore(tempDir)
	if err != nil {
		t.Fatalf("failed to reload store: %v", err)
	}
	fetched2, err := st2.Get("i-test1")
	if err != nil {
		t.Fatalf("failed to get from reloaded store: %v", err)
	}
	if fetched2.ID != "i-test1" {
		t.Errorf("expected ID 'i-test1', got '%s'", fetched2.ID)
	}

	// 5. Delete
	if err := st.Delete("i-test1"); err != nil {
		t.Fatalf("failed to delete: %v", err)
	}
	_, err = st.Get("i-test1")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound after deletion, got %v", err)
	}
}

func TestConcurrentStoreAccess(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "store-concur-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	st, err := NewFileStore(tempDir)
	if err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	workers := 10

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			inst := &model.Instance{
				ID:        filepath.Join("i-concur-", string(rune('a'+id))),
				Name:      "concurrent-vm",
				Status:    model.StatusRunning,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}
			_ = st.Save(inst)
			_, _ = st.Get(inst.ID)
			_ = st.List()
		}(i)
	}

	wg.Wait()
}

package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStorageManager(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "storage-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	sm, err := NewStorageManager(tempDir, "qemu-img")
	if err != nil {
		t.Fatalf("failed to create storage manager: %v", err)
	}

	diskPath := filepath.Join(tempDir, "test-disk.qcow2")

	// 1. Create Standalone Disk
	if err := sm.CreateStandaloneDisk(diskPath, 2); err != nil {
		t.Fatalf("failed to create standalone disk: %v", err)
	}

	if _, err := os.Stat(diskPath); err != nil {
		t.Fatalf("disk file not created: %v", err)
	}

	// 2. Resize Disk
	if err := sm.ResizeDisk(diskPath, 4); err != nil {
		t.Fatalf("failed to resize disk: %v", err)
	}

	// 3. Create Overlay Disk
	overlayPath := filepath.Join(tempDir, "overlay-disk.qcow2")
	if err := sm.CreateInstanceOverlay(diskPath, overlayPath, 5); err != nil {
		t.Fatalf("failed to create overlay disk: %v", err)
	}

	if _, err := os.Stat(overlayPath); err != nil {
		t.Fatalf("overlay disk file not created: %v", err)
	}
}

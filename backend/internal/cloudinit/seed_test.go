package cloudinit

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildUserData(t *testing.T) {
	keys := []string{
		"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKey user@local",
	}

	ud := buildDefaultUserData("cloud-user", keys)
	if !strings.Contains(ud, "#cloud-config") {
		t.Error("missing #cloud-config header")
	}
	if !strings.Contains(ud, "name: cloud-user") {
		t.Error("missing user definition")
	}
	if !strings.Contains(ud, "ssh_authorized_keys") {
		t.Error("missing ssh_authorized_keys")
	}
	if !strings.Contains(ud, "AAAAC3NzaC1lZDI1NTE5AAAAIExampleKey") {
		t.Error("missing provided ssh key")
	}
}

func TestGenerateSeedISO(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "cloudinit-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	outISO := filepath.Join(tempDir, "seed.iso")
	cfg := SeedConfig{
		InstanceID: "i-testiso123",
		Hostname:   "test-host",
		SSHKeys:    []string{"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."},
		Username:   "cloud-user",
	}

	err = GenerateSeedISO("xorriso", outISO, cfg)
	if err != nil {
		t.Fatalf("GenerateSeedISO failed: %v", err)
	}

	fi, err := os.Stat(outISO)
	if err != nil {
		t.Fatalf("seed ISO was not generated: %v", err)
	}
	if fi.Size() == 0 {
		t.Error("seed ISO is empty")
	}
}

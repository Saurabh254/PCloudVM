package cloudinit

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// SeedConfig holds the parameters for cloud-init ISO generation
type SeedConfig struct {
	InstanceID string
	Hostname   string
	SSHKeys    []string
	Username   string // Default: "cloud-user"
	UserData   string // Optional custom user-data script
}

type MetaData struct {
	InstanceID    string            `json:"instance-id"`
	LocalHostname string            `json:"local-hostname"`
	PublicKeys    map[string]string `json:"public-keys,omitempty"`
}

// GenerateSeedISO creates a cloud-init NoCloud ISO (labeled 'cidata')
func GenerateSeedISO(xorrisoBin string, outputPath string, cfg SeedConfig) error {
	if cfg.Username == "" {
		cfg.Username = "cloud-user"
	}
	if cfg.Hostname == "" {
		cfg.Hostname = cfg.InstanceID
	}

	tempDir, err := os.MkdirTemp("", "cidata-*")
	if err != nil {
		return fmt.Errorf("failed to create temp dir for cloud-init: %w", err)
	}
	defer os.RemoveAll(tempDir)

	// Build user-data
	var userDataContent string
	if cfg.UserData != "" {
		userDataContent = cfg.UserData
	} else {
		userDataContent = buildDefaultUserData(cfg.Username, cfg.SSHKeys)
	}

	metaDataContent := buildMetaData(cfg.InstanceID, cfg.Hostname, cfg.SSHKeys)

	// Write user-data
	userDataFile := filepath.Join(tempDir, "user-data")
	if err := os.WriteFile(userDataFile, []byte(userDataContent), 0644); err != nil {
		return fmt.Errorf("failed to write user-data: %w", err)
	}

	// Write meta-data
	metaDataFile := filepath.Join(tempDir, "meta-data")
	if err := os.WriteFile(metaDataFile, []byte(metaDataContent), 0644); err != nil {
		return fmt.Errorf("failed to write meta-data: %w", err)
	}

	// Ensure destination directory exists
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("failed to create target dir for seed iso: %w", err)
	}

	// Remove old seed ISO if exists
	_ = os.Remove(outputPath)

	// Run xorriso to create the ISO with volume ID 'cidata'
	if xorrisoBin == "" {
		xorrisoBin = "xorriso"
	}

	args := []string{
		"-as", "mkisofs",
		"-R",
		"-V", "cidata",
		"-o", outputPath,
		tempDir,
	}

	cmd := exec.Command(xorrisoBin, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("xorriso failed to generate seed ISO: %w, output: %s", err, string(output))
	}

	return nil
}

func buildDefaultUserData(username string, sshKeys []string) string {
	var sb strings.Builder
	sb.WriteString("#cloud-config\n")
	sb.WriteString("users:\n")
	sb.WriteString("  - default\n")
	sb.WriteString(fmt.Sprintf("  - name: %s\n", username))
	sb.WriteString("    gecos: Cloud Administrator\n")
	sb.WriteString("    sudo: ALL=(ALL) NOPASSWD:ALL\n")
	sb.WriteString("    groups: sudo, wheel, adm\n")
	sb.WriteString("    shell: /bin/bash\n")

	if len(sshKeys) > 0 {
		sb.WriteString("    ssh_authorized_keys:\n")
		for _, key := range sshKeys {
			trimmed := strings.TrimSpace(key)
			if trimmed != "" {
				sb.WriteString(fmt.Sprintf("      - %s\n", trimmed))
			}
		}

		// Also configure root's authorized keys for convenience
		sb.WriteString("  - name: root\n")
		sb.WriteString("    ssh_authorized_keys:\n")
		for _, key := range sshKeys {
			trimmed := strings.TrimSpace(key)
			if trimmed != "" {
				sb.WriteString(fmt.Sprintf("      - %s\n", trimmed))
			}
		}
	}

	sb.WriteString("\nssh_pwauth: false\n")
	sb.WriteString("package_update: true\n")
	sb.WriteString("packages:\n")
	sb.WriteString("  - htop\n")
	sb.WriteString("  - curl\n")
	sb.WriteString("  - wget\n")
	sb.WriteString("\nruncmd:\n")
	sb.WriteString("  - |\n")
	sb.WriteString("    # Initial setup: update packages and ensure htop & fastfetch are installed\n")
	sb.WriteString("    if command -v apt-get >/dev/null 2>&1; then\n")
	sb.WriteString("      export DEBIAN_FRONTEND=noninteractive\n")
	sb.WriteString("      apt-get update -y\n")
	sb.WriteString("      apt-get install -y htop curl wget ca-certificates\n")
	sb.WriteString("      if ! apt-get install -y fastfetch; then\n")
	sb.WriteString("        ARCH=$(dpkg --print-architecture 2>/dev/null || echo \"amd64\")\n")
	sb.WriteString("        if [ \"$ARCH\" = \"amd64\" ]; then\n")
	sb.WriteString("          curl -sL https://github.com/fastfetch-cli/fastfetch/releases/latest/download/fastfetch-linux-amd64.deb -o /tmp/fastfetch.deb && dpkg -i /tmp/fastfetch.deb || true\n")
	sb.WriteString("          rm -f /tmp/fastfetch.deb\n")
	sb.WriteString("        fi\n")
	sb.WriteString("      fi\n")
	sb.WriteString("    elif command -v pacman >/dev/null 2>&1; then\n")
	sb.WriteString("      pacman -Sy --noconfirm htop fastfetch || true\n")
	sb.WriteString("    elif command -v apk >/dev/null 2>&1; then\n")
	sb.WriteString("      apk update && apk add htop fastfetch curl || true\n")
	sb.WriteString("    elif command -v dnf >/dev/null 2>&1; then\n")
	sb.WriteString("      dnf install -y htop fastfetch || true\n")
	sb.WriteString("    fi\n")

	return sb.String()
}

func buildMetaData(instanceID, hostname string, sshKeys []string) string {
	meta := MetaData{
		InstanceID:    instanceID,
		LocalHostname: hostname,
	}

	if len(sshKeys) > 0 {
		meta.PublicKeys = make(map[string]string)
		for idx, key := range sshKeys {
			trimmed := strings.TrimSpace(key)
			if trimmed != "" {
				meta.PublicKeys[fmt.Sprintf("key%d", idx)] = trimmed
			}
		}
	}

	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return fmt.Sprintf("{\"instance-id\": %q, \"local-hostname\": %q}\n", instanceID, hostname)
	}
	return string(data) + "\n"
}

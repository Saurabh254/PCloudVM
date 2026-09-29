package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

var (
	ErrImageNotFound = errors.New("base image not found")
)

type ImageInfo struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	SizeMB      int64  `json:"size_mb"`
	Format      string `json:"format"`
	Description string `json:"description"`
}

type CatalogImage struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Filename     string `json:"filename"`
	URL          string `json:"url"`
	SizeEstimate string `json:"size_estimate"`
	OS           string `json:"os"`
	Description  string `json:"description"`
	DefaultUser  string `json:"default_user"`
	Installed    bool   `json:"installed"`
	Path         string `json:"path,omitempty"`
	SizeMB       int64  `json:"size_mb,omitempty"`
}

var DefaultCloudCatalog = []CatalogImage{
	{
		ID:           "cirros",
		Name:         "CirrOS 0.6.2",
		Filename:     "cirros.qcow2",
		URL:          "https://github.com/cirros-dev/cirros/releases/download/0.6.2/cirros-0.6.2-x86_64-disk.img",
		SizeEstimate: "20 MB",
		OS:           "cirros",
		Description:  "Fast, ultra-minimal testing Linux environment",
		DefaultUser:  "cirros",
	},
	{
		ID:           "debian-12",
		Name:         "Debian 12 (Bookworm)",
		Filename:     "debian-12.qcow2",
		URL:          "https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2",
		SizeEstimate: "350 MB",
		OS:           "debian",
		Description:  "Official Debian stable cloud image",
		DefaultUser:  "cloud-user / debian",
	},
	{
		ID:           "ubuntu-24-04",
		Name:         "Ubuntu 24.04 LTS (Noble)",
		Filename:     "ubuntu-24.04.img",
		URL:          "https://cloud-images.ubuntu.com/minimal/releases/noble/release/ubuntu-24.04-minimal-cloudimg-amd64.img",
		SizeEstimate: "380 MB",
		OS:           "ubuntu",
		Description:  "Ubuntu minimal LTS server image",
		DefaultUser:  "cloud-user / ubuntu",
	},
	{
		ID:           "alpine-3-20",
		Name:         "Alpine Linux 3.20",
		Filename:     "alpine-3.20.qcow2",
		URL:          "https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/cloud/generic_alpine-3.20.0-x86_64-bios-cloudinit-r0.qcow2",
		SizeEstimate: "150 MB",
		OS:           "alpine",
		Description:  "Secure, lightweight container-oriented OS",
		DefaultUser:  "cloud-user / alpine",
	},
}

type StorageManager struct {
	imagesDir    string
	qemuImgBin   string
	mu           sync.Mutex
	downloadLock sync.Mutex
}

func NewStorageManager(imagesDir, qemuImgBin string) (*StorageManager, error) {
	if qemuImgBin == "" {
		qemuImgBin = "qemu-img"
	}
	if err := os.MkdirAll(imagesDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create images dir: %w", err)
	}

	return &StorageManager{
		imagesDir:  imagesDir,
		qemuImgBin: qemuImgBin,
	}, nil
}

// ListBaseImages scans the images directory and returns detected disk images
func (sm *StorageManager) ListBaseImages() ([]ImageInfo, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	entries, err := os.ReadDir(sm.imagesDir)
	if err != nil {
		return nil, err
	}

	var list []ImageInfo
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if ext == ".qcow2" || ext == ".img" || ext == ".raw" {
			filePath := filepath.Join(sm.imagesDir, entry.Name())
			info, err := entry.Info()
			if err != nil {
				continue
			}

			format := "qcow2"
			if ext == ".raw" {
				format = "raw"
			}

			list = append(list, ImageInfo{
				Name:        entry.Name(),
				Path:        filePath,
				SizeMB:      info.Size() / (1024 * 1024),
				Format:      format,
				Description: fmt.Sprintf("Base image (%s)", entry.Name()),
			})
		}
	}

	return list, nil
}

// ListCatalogAndLocalImages merges default catalog with any locally downloaded/custom images
func (sm *StorageManager) ListCatalogAndLocalImages() ([]CatalogImage, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	entries, err := os.ReadDir(sm.imagesDir)
	if err != nil {
		entries = []os.DirEntry{}
	}

	localFiles := make(map[string]os.FileInfo)
	for _, e := range entries {
		if !e.IsDir() {
			ext := strings.ToLower(filepath.Ext(e.Name()))
			if ext == ".qcow2" || ext == ".img" || ext == ".raw" {
				if fi, err := e.Info(); err == nil {
					localFiles[e.Name()] = fi
				}
			}
		}
	}

	result := make([]CatalogImage, 0, len(DefaultCloudCatalog)+len(localFiles))
	handledFiles := make(map[string]bool)

	for _, cat := range DefaultCloudCatalog {
		item := cat
		if fi, exists := localFiles[cat.Filename]; exists {
			item.Installed = true
			item.Path = filepath.Join(sm.imagesDir, cat.Filename)
			item.SizeMB = fi.Size() / (1024 * 1024)
			handledFiles[cat.Filename] = true
		}
		result = append(result, item)
	}

	// Add any extra custom images found in imagesDir
	for name, fi := range localFiles {
		if !handledFiles[name] {
			result = append(result, CatalogImage{
				ID:           name,
				Name:         name,
				Filename:     name,
				SizeEstimate: fmt.Sprintf("%d MB", fi.Size()/(1024*1024)),
				SizeMB:       fi.Size() / (1024 * 1024),
				OS:           "custom",
				Description:  "Custom local base image",
				DefaultUser:  "root / cloud-user",
				Installed:    true,
				Path:         filepath.Join(sm.imagesDir, name),
			})
		}
	}

	return result, nil
}

// ResolveBaseImagePath checks if an image exists by exact name, filename in imagesDir, catalog ID, or direct path
func (sm *StorageManager) ResolveBaseImagePath(nameOrPath string) (string, string, error) {
	if nameOrPath == "" {
		// Pick first available installed image in imagesDir
		images, err := sm.ListBaseImages()
		if err == nil && len(images) > 0 {
			return images[0].Path, images[0].Format, nil
		}
		return "", "", ErrImageNotFound
	}

	// Check if nameOrPath matches a catalog ID or filename
	for _, cat := range DefaultCloudCatalog {
		if nameOrPath == cat.ID || nameOrPath == cat.Filename {
			targetPath := filepath.Join(sm.imagesDir, cat.Filename)
			if _, err := os.Stat(targetPath); err == nil {
				return targetPath, sm.detectFormat(targetPath), nil
			}
			// Auto download if not installed
			if cat.URL != "" {
				path, err := sm.DownloadImage(cat.URL, cat.Filename)
				if err == nil {
					return path, sm.detectFormat(path), nil
				}
			}
		}
	}

	// Direct path check
	if fi, err := os.Stat(nameOrPath); err == nil && !fi.IsDir() {
		fmtStr := sm.detectFormat(nameOrPath)
		return nameOrPath, fmtStr, nil
	}

	// Check inside imagesDir
	inDir := filepath.Join(sm.imagesDir, nameOrPath)
	if fi, err := os.Stat(inDir); err == nil && !fi.IsDir() {
		return inDir, sm.detectFormat(inDir), nil
	}

	// Try appending standard extensions
	for _, ext := range []string{".qcow2", ".img", ".raw"} {
		withExt := inDir + ext
		if fi, err := os.Stat(withExt); err == nil && !fi.IsDir() {
			return withExt, sm.detectFormat(withExt), nil
		}
	}

	return "", "", fmt.Errorf("%w: %s", ErrImageNotFound, nameOrPath)
}

func (sm *StorageManager) detectFormat(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	if ext == ".raw" {
		return "raw"
	}
	// Run qemu-img info to be precise
	cmd := exec.Command(sm.qemuImgBin, "info", "--output=json", path)
	out, err := cmd.Output()
	if err == nil {
		var res struct {
			Format string `json:"format"`
		}
		if json.Unmarshal(out, &res) == nil && res.Format != "" {
			return res.Format
		}
	}
	return "qcow2"
}

// CreateInstanceOverlay creates a copy-on-write QCOW2 overlay backing onto baseImage
func (sm *StorageManager) CreateInstanceOverlay(baseImagePath, targetOverlayPath string, sizeGB int) error {
	if err := os.MkdirAll(filepath.Dir(targetOverlayPath), 0755); err != nil {
		return fmt.Errorf("failed to create overlay directory: %w", err)
	}

	baseFormat := sm.detectFormat(baseImagePath)

	// Build qemu-img create command:
	// qemu-img create -f qcow2 -b <baseImagePath> -F <baseFormat> <targetOverlayPath> <sizeGB>G
	args := []string{
		"create",
		"-f", "qcow2",
		"-b", baseImagePath,
		"-F", baseFormat,
		targetOverlayPath,
	}

	if sizeGB > 0 {
		args = append(args, fmt.Sprintf("%dG", sizeGB))
	}

	cmd := exec.Command(sm.qemuImgBin, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("qemu-img create failed: %w, output: %s", err, string(out))
	}

	return nil
}

// CreateStandaloneDisk creates a blank QCOW2 disk
func (sm *StorageManager) CreateStandaloneDisk(targetPath string, sizeGB int) error {
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("failed to create disk directory: %w", err)
	}

	if sizeGB <= 0 {
		sizeGB = 10
	}

	args := []string{
		"create",
		"-f", "qcow2",
		targetPath,
		fmt.Sprintf("%dG", sizeGB),
	}

	cmd := exec.Command(sm.qemuImgBin, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("qemu-img create standalone failed: %w, output: %s", err, string(out))
	}

	return nil
}

// ResizeDisk resizes an existing QCOW2 disk image
func (sm *StorageManager) ResizeDisk(diskPath string, newSizeGB int) error {
	args := []string{
		"resize",
		diskPath,
		fmt.Sprintf("%dG", newSizeGB),
	}

	cmd := exec.Command(sm.qemuImgBin, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("qemu-img resize failed: %w, output: %s", err, string(out))
	}

	return nil
}

// DownloadImage downloads a remote disk image to the images directory
func (sm *StorageManager) DownloadImage(url, filename string) (string, error) {
	sm.downloadLock.Lock()
	defer sm.downloadLock.Unlock()

	targetPath := filepath.Join(sm.imagesDir, filename)
	if _, err := os.Stat(targetPath); err == nil {
		return targetPath, nil // already downloaded
	}

	resp, err := http.Get(url)
	if err != nil {
		return "", fmt.Errorf("failed to initiate download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download failed with HTTP %d", resp.StatusCode)
	}

	tmpFile := targetPath + ".download"
	out, err := os.Create(tmpFile)
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}

	_, err = io.Copy(out, resp.Body)
	out.Close()
	if err != nil {
		_ = os.Remove(tmpFile)
		return "", fmt.Errorf("failed to write image content: %w", err)
	}

	if err := os.Rename(tmpFile, targetPath); err != nil {
		return "", fmt.Errorf("failed to finalize downloaded file: %w", err)
	}

	return targetPath, nil
}

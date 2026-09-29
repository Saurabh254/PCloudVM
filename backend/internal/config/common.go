package config

import (
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	AppName       string `json:"app_name"`
	Port          int    `json:"port"`
	Debug         bool   `json:"debug"`
	DataDir       string `json:"data_dir"`
	ImagesDir     string `json:"images_dir"`
	InstancesDir  string `json:"instances_dir"`
	QemuBinary    string `json:"qemu_binary"`
	QemuImgBinary string `json:"qemu_img_binary"`
	XorrisoBinary string `json:"xorriso_binary"`
	EnableKVM     bool   `json:"enable_kvm"`
	MinHostPort   int    `json:"min_host_port"`
	MaxHostPort   int    `json:"max_host_port"`
}

func checkKVMAvailable() bool {
	info, err := os.Stat("/dev/kvm")
	if err != nil {
		return false
	}
	// Check read/write permission
	f, err := os.OpenFile("/dev/kvm", os.O_RDWR, 0)
	if err != nil {
		return false
	}
	f.Close()
	return info.Mode()&os.ModeDevice != 0
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return defaultVal
}

// LoadConfig loads configuration from environment or sane defaults
func Load() *Config {
	cwd, err := os.Getwd()
	if err != nil {
		cwd = "."
	}

	dataDir := getEnv("PCLOUDVM_DATA_DIR", filepath.Join(cwd, "data"))
	imagesDir := filepath.Join(dataDir, "images")
	instancesDir := filepath.Join(dataDir, "instances")

	// Ensure directories exist
	_ = os.MkdirAll(imagesDir, 0755)
	_ = os.MkdirAll(instancesDir, 0755)

	enableKVM := checkKVMAvailable()
	if envKVM := os.Getenv("PCLOUDVM_ENABLE_KVM"); envKVM != "" {
		enableKVM = envKVM == "true" || envKVM == "1"
	}

	return &Config{
		AppName:       getEnv("PCLOUDVM_APP_NAME", "PCloudVM Orchestrator"),
		Port:          getEnvInt("PORT", 5050),
		Debug:         getEnv("DEBUG", "true") == "true",
		DataDir:       dataDir,
		ImagesDir:     imagesDir,
		InstancesDir:  instancesDir,
		QemuBinary:    getEnv("PCLOUDVM_QEMU_BIN", "qemu-system-x86_64"),
		QemuImgBinary: getEnv("PCLOUDVM_QEMU_IMG_BIN", "qemu-img"),
		XorrisoBinary: getEnv("PCLOUDVM_XORRISO_BIN", "xorriso"),
		EnableKVM:     enableKVM,
		MinHostPort:   getEnvInt("PCLOUDVM_MIN_PORT", 10000),
		MaxHostPort:   getEnvInt("PCLOUDVM_MAX_PORT", 20000),
	}
}

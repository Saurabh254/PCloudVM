package model

import "fmt"

// InstanceTypeConfig defines the hardware specifications of an instance type
type InstanceTypeConfig struct {
	Name        string `json:"name"`
	VCPU        int    `json:"vcpu"`
	MemoryMB    int    `json:"memory_mb"`
	DiskSizeGB  int    `json:"disk_size_gb"`
	Description string `json:"description"`
}

// Predefined AWS-like instance types
var StandardInstanceTypes = map[string]InstanceTypeConfig{
	"t2.nano": {
		Name:        "t2.nano",
		VCPU:        1,
		MemoryMB:    512,
		DiskSizeGB:  10,
		Description: "1 vCPU, 512 MB RAM, 10 GB Disk (burstable, lightweight)",
	},
	"t2.micro": {
		Name:        "t2.micro",
		VCPU:        1,
		MemoryMB:    1024,
		DiskSizeGB:  15,
		Description: "1 vCPU, 1 GB RAM, 15 GB Disk (general purpose)",
	},
	"t2.small": {
		Name:        "t2.small",
		VCPU:        1,
		MemoryMB:    2048,
		DiskSizeGB:  20,
		Description: "1 vCPU, 2 GB RAM, 20 GB Disk (general purpose)",
	},
	"t2.medium": {
		Name:        "t2.medium",
		VCPU:        2,
		MemoryMB:    4096,
		DiskSizeGB:  30,
		Description: "2 vCPU, 4 GB RAM, 30 GB Disk (compute/memory balance)",
	},
	"c5.large": {
		Name:        "c5.large",
		VCPU:        2,
		MemoryMB:    4096,
		DiskSizeGB:  40,
		Description: "2 vCPU, 4 GB RAM, 40 GB Disk (compute optimized)",
	},
	"m5.large": {
		Name:        "m5.large",
		VCPU:        2,
		MemoryMB:    8192,
		DiskSizeGB:  50,
		Description: "2 vCPU, 8 GB RAM, 50 GB Disk (memory optimized)",
	},
}

// GetInstanceType retrieves an instance type configuration by name
func GetInstanceType(name string) (InstanceTypeConfig, error) {
	if cfg, exists := StandardInstanceTypes[name]; exists {
		return cfg, nil
	}
	return InstanceTypeConfig{}, fmt.Errorf("unknown instance type: %s", name)
}

// ListInstanceTypes returns a slice of all available standard instance types
func ListInstanceTypes() []InstanceTypeConfig {
	list := make([]InstanceTypeConfig, 0, len(StandardInstanceTypes))
	// Ordered by size for consistent listing
	keys := []string{"t2.nano", "t2.micro", "t2.small", "t2.medium", "c5.large", "m5.large"}
	for _, k := range keys {
		if cfg, ok := StandardInstanceTypes[k]; ok {
			list = append(list, cfg)
		}
	}
	return list
}

package qemu

import "github.com/saurabh254/PCloudVM/backend/internal/core/service"

func NewQemuInstance(id, vmType, memory string, cpu, maxCPU int) *QemuInstance {
	return &QemuInstance{
		ID:       id,
		TYPE:     vmType,
		Memory:   memory,
		CPU:      cpu,
		MaxCPU:   maxCPU,
		Instance: service.VMResource{},
	}
}

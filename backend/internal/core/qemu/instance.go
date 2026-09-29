package qemu

// QemuInstance represents a single VM instance
type QemuInstance struct {
	ID       string
	TYPE     string
	Memory   string
	CPU      int
	MaxCPU   int
	Instance VMResource
}

func NewQemuInstance(id, vmType, memory string, cpu, maxCPU int) *QemuInstance {
	return &QemuInstance{
		ID:       id,
		TYPE:     vmType,
		Memory:   memory,
		CPU:      cpu,
		MaxCPU:   maxCPU,
		Instance: VMResource{},
	}
}

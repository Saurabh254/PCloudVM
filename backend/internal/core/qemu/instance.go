package qemu

import "github.com/saurabh254/PCloudVM/backend/internal/core/service"

// QemuInstance represents a single VM instance
type QemuInstance struct {
	ID       string             // Instance ID
	TYPE     string             // VM type, e.g., micro-t1
	Memory   string             // RAM amount, e.g., "512M"
	CPU      int                // Number of CPUs to boot with
	MaxCPU   int                // Maximum CPUs if you plan hotplug
	Instance service.VMResource // Underlying VM resources (QMP connection etc.)
}

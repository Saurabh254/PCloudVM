package model

import (
	"fmt"
	"time"
)

type InstanceStatus string

const (
	StatusProvisioning InstanceStatus = "PROVISIONING"
	StatusBooting      InstanceStatus = "BOOTING"
	StatusRunning      InstanceStatus = "RUNNING"
	StatusPaused       InstanceStatus = "PAUSED"
	StatusStopped      InstanceStatus = "STOPPED"
	StatusError        InstanceStatus = "ERROR"
	StatusTerminated   InstanceStatus = "TERMINATED"
)

// PortRule defines a host-to-guest port mapping
type PortRule struct {
	GuestPort int    `json:"guest_port"`
	HostPort  int    `json:"host_port"`
	Protocol  string `json:"protocol"` // "tcp" or "udp"
}

// Instance represents a virtual machine managed by the orchestrator
type Instance struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Status       InstanceStatus `json:"status"`
	InstanceType string         `json:"instance_type"`
	VCPU         int            `json:"vcpu"`
	MemoryMB     int            `json:"memory_mb"`
	DiskSizeGB   int            `json:"disk_size_gb"`
	BaseImage    string         `json:"base_image"`
	SSHKeys      []string       `json:"ssh_keys"`
	AllowedPorts []PortRule     `json:"allowed_ports"`
	PID          int            `json:"pid,omitempty"`
	WorkDir      string         `json:"work_dir"`
	DiskPath     string         `json:"disk_path"`
	SeedISOPath  string         `json:"seed_iso_path,omitempty"`
	QMPSocket    string         `json:"qmp_socket"`
	SerialLog    string         `json:"serial_log"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	ErrorMessage string         `json:"error_message,omitempty"`
}

// PortRuleRequest is used in input payloads
type PortRuleRequest struct {
	GuestPort int    `json:"guest_port"`
	HostPort  int    `json:"host_port,omitempty"` // Optional: 0 means auto-assign
	Protocol  string `json:"protocol,omitempty"`  // Default: tcp
}

// CreateInstanceRequest defines payload to create/launch a VM
type CreateInstanceRequest struct {
	Name         string            `json:"name"`
	InstanceType string            `json:"instance_type"` // e.g. "t2.micro"
	VCPU         int               `json:"vcpu,omitempty"`
	MemoryMB     int               `json:"memory_mb,omitempty"`
	DiskSizeGB   int               `json:"disk_size_gb,omitempty"`
	BaseImage    string            `json:"base_image,omitempty"`
	ImageID      string            `json:"image_id,omitempty"`
	SSHKeys      []string          `json:"ssh_keys,omitempty"`
	AllowedPorts []PortRuleRequest `json:"allowed_ports,omitempty"`
	AutoStart    bool              `json:"auto_start"`
}

// EditInstanceRequest defines payload to modify VM specs or configuration
type EditInstanceRequest struct {
	Name         *string            `json:"name,omitempty"`
	InstanceType *string            `json:"instance_type,omitempty"`
	VCPU         *int               `json:"vcpu,omitempty"`
	MemoryMB     *int               `json:"memory_mb,omitempty"`
	DiskSizeGB   *int               `json:"disk_size_gb,omitempty"` // For growing disk
	AllowedPorts *[]PortRuleRequest `json:"allowed_ports,omitempty"`
	SSHKeys      *[]string          `json:"ssh_keys,omitempty"`
}

// StopInstanceRequest defines payload for stopping an instance
type StopInstanceRequest struct {
	Force   bool `json:"force"`
	Timeout int  `json:"timeout_seconds,omitempty"` // ACPI shutdown wait timeout
}

// InstanceLiveStatus returns live stats queried from QMP
type InstanceLiveStatus struct {
	ID        string         `json:"id"`
	Status    InstanceStatus `json:"status"`
	QemuState string         `json:"qemu_state"`
	PID       int            `json:"pid"`
	UptimeSec int64          `json:"uptime_seconds,omitempty"`
	VCPUs     int            `json:"vcpus"`
	MemoryMB  int            `json:"memory_mb"`
	Ports     []PortRule     `json:"ports"`
}

// InstanceMetrics holds live resource utilization
type InstanceMetrics struct {
	ID                 string         `json:"id"`
	Status             InstanceStatus `json:"status"`
	PID                int            `json:"pid"`
	ProcessAlive       bool           `json:"process_alive"`
	VCPU               int            `json:"vcpu"`
	CPUUsagePercent    float64        `json:"cpu_usage_percent"`
	GuestCPUPercent    float64        `json:"guest_cpu_percent,omitempty"`
	MemoryUsedMB       int            `json:"memory_used_mb"`
	MemoryTotalMB      int            `json:"memory_total_mb"`
	MemoryPercent      float64        `json:"memory_percent"`
	HostMemoryUsedMB   int            `json:"host_memory_used_mb,omitempty"`
	GuestMemoryUsedMB  int            `json:"guest_memory_used_mb,omitempty"`
	GuestMemoryTotalMB int            `json:"guest_memory_total_mb,omitempty"`
	DiskSizeGB         int            `json:"disk_size_gb"`
	DiskUsedMB         int            `json:"disk_used_mb"`
	UptimeSeconds      int64          `json:"uptime_seconds"`
}

func (i *Instance) SSHCommand() string {
	for _, p := range i.AllowedPorts {
		if p.GuestPort == 22 {
			return fmt.Sprintf("ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p %d cloud-user@localhost (or cirros/debian/root)", p.HostPort)
		}
	}
	return "Port 22 not exposed"
}

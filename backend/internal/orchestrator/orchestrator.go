package orchestrator

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"

	"github.com/saurabh254/PCloudVM/backend/internal/cloudinit"
	"github.com/saurabh254/PCloudVM/backend/internal/config"
	"github.com/saurabh254/PCloudVM/backend/internal/model"
	"github.com/saurabh254/PCloudVM/backend/internal/network"
	"github.com/saurabh254/PCloudVM/backend/internal/qemu"
	"github.com/saurabh254/PCloudVM/backend/internal/storage"
	"github.com/saurabh254/PCloudVM/backend/internal/store"
)

var (
	ErrInstanceRunning = errors.New("instance is running")
	ErrInstanceStopped = errors.New("instance is stopped")
	ErrInvalidState    = errors.New("invalid instance state for operation")
)

type cpuSample struct {
	timestamp    time.Time
	totalJiffies int64
	lastPercent  float64
}

type guestMetricsSample struct {
	timestamp  time.Time
	memUsedMB  int
	memTotalMB int
	memPercent float64
	cpuActive  int64
	cpuTotal   int64
	cpuPercent float64
}

type Orchestrator struct {
	cfg            *config.Config
	store          store.Store
	storage        *storage.StorageManager
	ports          *network.PortManager
	logger         *zap.Logger
	mu             sync.Mutex
	recentLaunches map[string]time.Time
	cpuSamples     map[string]cpuSample
	guestMetrics   map[string]guestMetricsSample
	metricsMu      sync.Mutex
}

func NewOrchestrator(
	cfg *config.Config,
	st store.Store,
	sm *storage.StorageManager,
	pm *network.PortManager,
	logger *zap.Logger,
) *Orchestrator {
	orch := &Orchestrator{
		cfg:            cfg,
		store:          st,
		storage:        sm,
		ports:          pm,
		logger:         logger,
		recentLaunches: make(map[string]time.Time),
		cpuSamples:     make(map[string]cpuSample),
		guestMetrics:   make(map[string]guestMetricsSample),
	}

	orch.ReconcileInstances()
	return orch
}

// GenerateInstanceID generates an AWS EC2 style ID: i-0123456789abcdef
func GenerateInstanceID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return fmt.Sprintf("i-%s", hex.EncodeToString(b))
}

// ReconcileInstances verifies running processes and restores port reservations
func (o *Orchestrator) ReconcileInstances() {
	instances := o.store.List()
	o.ports.RestoreReservations(instances)

	for _, inst := range instances {
		if inst.Status == model.StatusRunning || inst.Status == model.StatusPaused {
			if !qemu.IsProcessAlive(inst.PID) {
				o.logger.Warn("detected orphaned instance recorded as running, updating to stopped",
					zap.String("id", inst.ID),
					zap.Int("last_pid", inst.PID),
				)
				inst.Status = model.StatusStopped
				inst.PID = 0
				inst.UpdatedAt = time.Now()
				_ = o.store.Save(inst)
			}
		}
	}
}

// CreateInstance provisions a new VM instance with storage, ports, and cloud-init
func (o *Orchestrator) CreateInstance(req model.CreateInstanceRequest) (*model.Instance, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	id := GenerateInstanceID()
	name := req.Name
	if name == "" {
		name = id
	}

	imageReq := req.BaseImage
	if imageReq == "" {
		imageReq = req.ImageID
	}

	// Prevent rapid double-click duplicate creation (within 2.5s)
	launchKey := fmt.Sprintf("%s:%s:%s", name, imageReq, req.InstanceType)
	if lastTime, exists := o.recentLaunches[launchKey]; exists && time.Since(lastTime) < 2500*time.Millisecond {
		return nil, fmt.Errorf("duplicate launch request detected for %q; please wait", name)
	}
	o.recentLaunches[launchKey] = time.Now()

	// 1. Resolve instance type & hardware specs
	instanceType := req.InstanceType
	if instanceType == "" {
		instanceType = "t2.micro"
	}

	typeCfg, err := model.GetInstanceType(instanceType)
	var vcpu, memoryMB, diskSizeGB int
	if err == nil {
		vcpu = typeCfg.VCPU
		memoryMB = typeCfg.MemoryMB
		diskSizeGB = typeCfg.DiskSizeGB
	} else {
		// Custom specs
		instanceType = "custom"
		vcpu = 1
		memoryMB = 1024
		diskSizeGB = 10
	}

	// Allow overrides if explicitly provided
	if req.VCPU > 0 {
		vcpu = req.VCPU
	}
	if req.MemoryMB > 0 {
		memoryMB = req.MemoryMB
	}
	if req.DiskSizeGB > 0 {
		diskSizeGB = req.DiskSizeGB
	}

	// 2. Setup Instance Directories
	workDir := filepath.Join(o.cfg.InstancesDir, id)
	if err := os.MkdirAll(workDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create instance dir: %w", err)
	}

	diskPath := filepath.Join(workDir, "disk.qcow2")
	seedISOPath := filepath.Join(workDir, "seed.iso")
	qmpSocket := filepath.Join(workDir, "qmp.sock")
	serialLog := filepath.Join(workDir, "serial.log")

	// 3. Resolve Base Image and create disk
	baseImagePath, _, err := o.storage.ResolveBaseImagePath(imageReq)
	if err == nil {
		o.logger.Info("creating copy-on-write overlay",
			zap.String("instance_id", id),
			zap.String("base_image", baseImagePath),
			zap.Int("size_gb", diskSizeGB),
		)
		if err := o.storage.CreateInstanceOverlay(baseImagePath, diskPath, diskSizeGB); err != nil {
			_ = os.RemoveAll(workDir)
			return nil, fmt.Errorf("failed to create disk overlay: %w", err)
		}
	} else {
		// If no base image found, create blank disk
		o.logger.Warn("no base image found, creating standalone disk",
			zap.String("instance_id", id),
			zap.Int("size_gb", diskSizeGB),
		)
		if err := o.storage.CreateStandaloneDisk(diskPath, diskSizeGB); err != nil {
			_ = os.RemoveAll(workDir)
			return nil, fmt.Errorf("failed to create blank disk: %w", err)
		}
	}

	// 4. Setup Allowed Ports (Security Groups)
	portRequests := req.AllowedPorts
	if len(portRequests) == 0 {
		// Default to allowing SSH port 22
		portRequests = []model.PortRuleRequest{
			{GuestPort: 22, Protocol: "tcp"},
		}
	}

	allocatedPorts, err := o.ports.AllocatePorts(id, portRequests)
	if err != nil {
		_ = os.RemoveAll(workDir)
		return nil, fmt.Errorf("failed to allocate network ports: %w", err)
	}

	// 5. Generate Cloud-Init Seed ISO (SSH Keys)
	hasSeedISO := false
	if len(req.SSHKeys) > 0 {
		seedCfg := cloudinit.SeedConfig{
			InstanceID: id,
			Hostname:   name,
			SSHKeys:    req.SSHKeys,
			Username:   "cloud-user",
		}
		if err := cloudinit.GenerateSeedISO(o.cfg.XorrisoBinary, seedISOPath, seedCfg); err != nil {
			o.logger.Warn("cloud-init generation failed, proceeding without seed ISO",
				zap.String("instance_id", id),
				zap.Error(err),
			)
		} else {
			hasSeedISO = true
		}
	}

	actualSeedPath := ""
	if hasSeedISO {
		actualSeedPath = seedISOPath
	}

	now := time.Now()
	inst := &model.Instance{
		ID:           id,
		Name:         name,
		Status:       model.StatusStopped,
		InstanceType: instanceType,
		VCPU:         vcpu,
		MemoryMB:     memoryMB,
		DiskSizeGB:   diskSizeGB,
		BaseImage:    baseImagePath,
		SSHKeys:      req.SSHKeys,
		AllowedPorts: allocatedPorts,
		WorkDir:      workDir,
		DiskPath:     diskPath,
		SeedISOPath:  actualSeedPath,
		QMPSocket:    qmpSocket,
		SerialLog:    serialLog,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := o.store.Save(inst); err != nil {
		o.ports.ReleasePorts(id)
		_ = os.RemoveAll(workDir)
		return nil, fmt.Errorf("failed to save instance to store: %w", err)
	}

	o.logger.Info("instance created successfully",
		zap.String("instance_id", id),
		zap.String("name", name),
		zap.String("type", instanceType),
	)

	// 6. Auto-start if requested
	if req.AutoStart {
		if started, err := o.startLocked(inst); err != nil {
			o.logger.Error("auto-start failed", zap.String("instance_id", id), zap.Error(err))
		} else {
			inst = started
		}
	}

	return inst, nil
}

// StartInstance starts a stopped VM
func (o *Orchestrator) StartInstance(id string) (*model.Instance, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	inst, err := o.store.Get(id)
	if err != nil {
		return nil, err
	}

	return o.startLocked(inst)
}

func (o *Orchestrator) startLocked(inst *model.Instance) (*model.Instance, error) {
	id := inst.ID
	if inst.Status == model.StatusRunning {
		return inst, nil
	}

	if inst.Status == model.StatusPaused {
		// If paused, unpause/resume
		return o.resumeLocked(inst)
	}

	pidFile := filepath.Join(inst.WorkDir, "qemu.pid")

	pCfg := qemu.ProcessConfig{
		QemuBinary:    o.cfg.QemuBinary,
		InstanceID:    inst.ID,
		VCPU:          inst.VCPU,
		MemoryMB:      inst.MemoryMB,
		DiskPath:      inst.DiskPath,
		SeedISOPath:   inst.SeedISOPath,
		AllowedPorts:  inst.AllowedPorts,
		QMPSocketPath: inst.QMPSocket,
		PIDFilePath:   pidFile,
		SerialLogPath: inst.SerialLog,
		EnableKVM:     o.cfg.EnableKVM,
	}

	pid, err := qemu.LaunchProcess(pCfg)
	if err != nil {
		// If failed with KVM, attempt fallback without KVM
		if o.cfg.EnableKVM {
			o.logger.Warn("launch with KVM failed, attempting without KVM (TCG)", zap.Error(err))
			pCfg.EnableKVM = false
			pid, err = qemu.LaunchProcess(pCfg)
		}
		if err != nil {
			inst.Status = model.StatusError
			inst.ErrorMessage = err.Error()
			inst.UpdatedAt = time.Now()
			_ = o.store.Save(inst)
			return nil, fmt.Errorf("failed to launch QEMU process: %w", err)
		}
	}

	// Connect QMP to verify and negotiate capabilities
	client, err := qemu.ConnectQMP(inst.QMPSocket, 5*time.Second)
	if err != nil {
		o.logger.Warn("could not connect to QMP immediately, process is still running",
			zap.String("id", id),
			zap.Error(err),
		)
	} else {
		_ = client.Close()
	}

	inst.PID = pid
	inst.Status = model.StatusBooting
	inst.ErrorMessage = ""
	inst.UpdatedAt = time.Now()

	if err := o.store.Save(inst); err != nil {
		return nil, err
	}

	o.logger.Info("instance started, booting OS", zap.String("id", id), zap.Int("pid", pid))
	go o.monitorBooting(inst.ID, inst.AllowedPorts)
	return inst, nil
}

func (o *Orchestrator) monitorBooting(id string, ports []model.PortRule) {
	var sshHostPort int
	for _, p := range ports {
		if p.GuestPort == 22 {
			sshHostPort = p.HostPort
			break
		}
	}

	// Check periodically for up to 60 seconds
	deadline := time.Now().Add(60 * time.Second)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	// Initial delay for early kernel load
	time.Sleep(2 * time.Second)

	for time.Now().Before(deadline) {
		<-ticker.C

		inst, err := o.store.Get(id)
		if err != nil || inst.Status != model.StatusBooting {
			return
		}

		if !qemu.IsProcessAlive(inst.PID) {
			o.mu.Lock()
			inst.Status = model.StatusStopped
			inst.PID = 0
			_ = o.store.Save(inst)
			o.mu.Unlock()
			return
		}

		isReady := false
		if sshHostPort > 0 {
			conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", sshHostPort), 500*time.Millisecond)
			if err == nil {
				_ = conn.Close()
				isReady = true
			}
		} else {
			isReady = true
		}

		if isReady {
			o.mu.Lock()
			current, err := o.store.Get(id)
			if err == nil && current.Status == model.StatusBooting {
				current.Status = model.StatusRunning
				current.UpdatedAt = time.Now()
				_ = o.store.Save(current)
				o.logger.Info("instance finished booting, now RUNNING", zap.String("id", id))
			}
			o.mu.Unlock()
			return
		}
	}

	// Timeout fallback to Running
	o.mu.Lock()
	current, err := o.store.Get(id)
	if err == nil && current.Status == model.StatusBooting {
		current.Status = model.StatusRunning
		current.UpdatedAt = time.Now()
		_ = o.store.Save(current)
	}
	o.mu.Unlock()
}

// StopInstance stops a running VM gracefully or forcefully
func (o *Orchestrator) StopInstance(id string, req model.StopInstanceRequest) (*model.Instance, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	inst, err := o.store.Get(id)
	if err != nil {
		return nil, err
	}

	if inst.Status == model.StatusStopped || inst.Status == model.StatusTerminated {
		return inst, nil
	}

	pid := inst.PID

	if req.Force {
		o.logger.Info("force stopping instance", zap.String("id", id), zap.Int("pid", pid))
		// Try QMP quit
		if client, err := qemu.ConnectQMP(inst.QMPSocket, 1*time.Second); err == nil {
			_ = client.Quit()
			_ = client.Close()
		}
		_ = qemu.ForceKillProcess(pid)
	} else {
		o.logger.Info("gracefully stopping instance via ACPI", zap.String("id", id), zap.Int("pid", pid))
		stopped := false
		if client, err := qemu.ConnectQMP(inst.QMPSocket, 2*time.Second); err == nil {
			if err := client.SystemPowerdown(); err == nil {
				_ = client.Close()

				timeout := req.Timeout
				if timeout <= 0 {
					timeout = 15
				}

				// Wait for process to exit
				deadline := time.Now().Add(time.Duration(timeout) * time.Second)
				for time.Now().Before(deadline) {
					if !qemu.IsProcessAlive(pid) {
						stopped = true
						break
					}
					time.Sleep(300 * time.Millisecond)
				}
			} else {
				_ = client.Close()
			}
		}

		if !stopped {
			o.logger.Warn("graceful stop timed out or failed, forcing termination", zap.String("id", id))
			_ = qemu.ForceKillProcess(pid)
		}
	}

	// Clean up transient files
	_ = os.Remove(inst.QMPSocket)
	_ = os.Remove(filepath.Join(inst.WorkDir, "qemu.pid"))

	inst.Status = model.StatusStopped
	inst.PID = 0
	inst.UpdatedAt = time.Now()

	o.metricsMu.Lock()
	delete(o.cpuSamples, id)
	o.metricsMu.Unlock()

	if err := o.store.Save(inst); err != nil {
		return nil, err
	}

	o.logger.Info("instance stopped", zap.String("id", id))
	return inst, nil
}

// PauseInstance freezes CPU execution of a running VM
func (o *Orchestrator) PauseInstance(id string) (*model.Instance, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	inst, err := o.store.Get(id)
	if err != nil {
		return nil, err
	}

	if inst.Status != model.StatusRunning && inst.Status != model.StatusBooting {
		return nil, fmt.Errorf("%w: instance must be RUNNING or BOOTING to pause (current: %s)", ErrInvalidState, inst.Status)
	}

	client, err := qemu.ConnectQMP(inst.QMPSocket, 3*time.Second)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to QMP for pause: %w", err)
	}
	defer client.Close()

	if err := client.Pause(); err != nil {
		return nil, fmt.Errorf("QMP pause command failed: %w", err)
	}

	inst.Status = model.StatusPaused
	inst.UpdatedAt = time.Now()

	if err := o.store.Save(inst); err != nil {
		return nil, err
	}

	o.logger.Info("instance paused", zap.String("id", id))
	return inst, nil
}

// ResumeInstance unpauses CPU execution of a paused VM
func (o *Orchestrator) ResumeInstance(id string) (*model.Instance, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	inst, err := o.store.Get(id)
	if err != nil {
		return nil, err
	}

	if inst.Status != model.StatusPaused {
		return nil, fmt.Errorf("%w: instance must be PAUSED to resume (current: %s)", ErrInvalidState, inst.Status)
	}

	return o.resumeLocked(inst)
}

func (o *Orchestrator) resumeLocked(inst *model.Instance) (*model.Instance, error) {
	client, err := qemu.ConnectQMP(inst.QMPSocket, 3*time.Second)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to QMP for resume: %w", err)
	}
	defer client.Close()

	if err := client.Resume(); err != nil {
		return nil, fmt.Errorf("QMP resume command failed: %w", err)
	}

	inst.Status = model.StatusRunning
	inst.UpdatedAt = time.Now()

	if err := o.store.Save(inst); err != nil {
		return nil, err
	}

	o.logger.Info("instance resumed", zap.String("id", inst.ID))
	return inst, nil
}

// EditInstance modifies instance specs, allowed ports, or SSH keys
func (o *Orchestrator) EditInstance(id string, req model.EditInstanceRequest) (*model.Instance, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	inst, err := o.store.Get(id)
	if err != nil {
		return nil, err
	}

	isRunning := inst.Status == model.StatusRunning || inst.Status == model.StatusPaused

	// 1. Edit Name
	if req.Name != nil && *req.Name != "" {
		inst.Name = *req.Name
	}

	// 2. Hardware specs (InstanceType, VCPU, Memory)
	specsChanged := false
	if req.InstanceType != nil && *req.InstanceType != inst.InstanceType {
		if isRunning {
			return nil, errors.New("cannot change instance type while VM is running; please stop the VM first")
		}
		if typeCfg, err := model.GetInstanceType(*req.InstanceType); err == nil {
			inst.InstanceType = typeCfg.Name
			inst.VCPU = typeCfg.VCPU
			inst.MemoryMB = typeCfg.MemoryMB
			specsChanged = true
		} else {
			return nil, err
		}
	}

	if req.VCPU != nil && *req.VCPU > 0 && *req.VCPU != inst.VCPU {
		if isRunning {
			return nil, errors.New("cannot change VCPU count while VM is running; please stop the VM first")
		}
		inst.VCPU = *req.VCPU
		inst.InstanceType = "custom"
		specsChanged = true
	}

	if req.MemoryMB != nil && *req.MemoryMB > 0 && *req.MemoryMB != inst.MemoryMB {
		if isRunning {
			return nil, errors.New("cannot change RAM while VM is running; please stop the VM first")
		}
		inst.MemoryMB = *req.MemoryMB
		inst.InstanceType = "custom"
		specsChanged = true
	}

	// 3. Disk Resizing (Can be expanded)
	if req.DiskSizeGB != nil && *req.DiskSizeGB > inst.DiskSizeGB {
		o.logger.Info("resizing disk image",
			zap.String("id", id),
			zap.Int("old_size", inst.DiskSizeGB),
			zap.Int("new_size", *req.DiskSizeGB),
		)
		if err := o.storage.ResizeDisk(inst.DiskPath, *req.DiskSizeGB); err != nil {
			return nil, fmt.Errorf("failed to resize disk: %w", err)
		}
		inst.DiskSizeGB = *req.DiskSizeGB
		specsChanged = true
	}

	// 4. SSH Keys update
	if req.SSHKeys != nil {
		inst.SSHKeys = *req.SSHKeys
		// Re-generate seed ISO
		seedPath := filepath.Join(inst.WorkDir, "seed.iso")
		seedCfg := cloudinit.SeedConfig{
			InstanceID: inst.ID,
			Hostname:   inst.Name,
			SSHKeys:    inst.SSHKeys,
			Username:   "cloud-user",
		}
		if err := cloudinit.GenerateSeedISO(o.cfg.XorrisoBinary, seedPath, seedCfg); err == nil {
			inst.SeedISOPath = seedPath
		}
	}

	// 5. Allowed Ports (Security Groups)
	if req.AllowedPorts != nil {
		newPortReqs := *req.AllowedPorts
		if isRunning {
			// Live port forwarding editing via QMP monitor commands!
			client, err := qemu.ConnectQMP(inst.QMPSocket, 2*time.Second)
			if err != nil {
				return nil, fmt.Errorf("failed to connect to QMP for live port modification: %w", err)
			}
			defer client.Close()

			// Remove old ports not in new list
			var keptPorts []model.PortRule
			for _, oldRule := range inst.AllowedPorts {
				stillWanted := false
				for _, n := range newPortReqs {
					if n.GuestPort == oldRule.GuestPort {
						stillWanted = true
						break
					}
				}
				if !stillWanted {
					_ = client.RemovePortForward("net0", oldRule.Protocol, oldRule.HostPort)
					o.ports.ReleasePort(oldRule.HostPort)
				} else {
					keptPorts = append(keptPorts, oldRule)
				}
			}

			// Add newly requested ports
			var toAllocate []model.PortRuleRequest
			for _, n := range newPortReqs {
				alreadyExists := false
				for _, k := range keptPorts {
					if k.GuestPort == n.GuestPort {
						alreadyExists = true
						break
					}
				}
				if !alreadyExists {
					toAllocate = append(toAllocate, n)
				}
			}

			if len(toAllocate) > 0 {
				newRules, err := o.ports.AllocatePorts(inst.ID, toAllocate)
				if err != nil {
					return nil, fmt.Errorf("failed allocating new host ports: %w", err)
				}
				for _, r := range newRules {
					if err := client.AddPortForward("net0", r.Protocol, r.HostPort, r.GuestPort); err != nil {
						o.logger.Warn("live hostfwd_add warning", zap.Error(err))
					}
					keptPorts = append(keptPorts, r)
				}
			}
			inst.AllowedPorts = keptPorts
		} else {
			// VM is stopped: preserve existing host ports for kept guest ports!
			var keptPorts []model.PortRule
			var toAllocate []model.PortRuleRequest

			for _, reqPort := range newPortReqs {
				proto := reqPort.Protocol
				if proto == "" {
					proto = "tcp"
				}

				// Check if this guest port already has an allocated host port
				foundOld := false
				for _, old := range inst.AllowedPorts {
					if old.GuestPort == reqPort.GuestPort && strings.EqualFold(old.Protocol, proto) {
						foundOld = true
						keptPorts = append(keptPorts, old)
						break
					}
				}

				if !foundOld {
					toAllocate = append(toAllocate, reqPort)
				}
			}

			// Release any old ports that were REMOVED from the list
			for _, old := range inst.AllowedPorts {
				stillWanted := false
				for _, k := range keptPorts {
					if k.HostPort == old.HostPort {
						stillWanted = true
						break
					}
				}
				if !stillWanted {
					o.ports.ReleasePort(old.HostPort)
				}
			}

			// Allocate only newly added ports
			if len(toAllocate) > 0 {
				newRules, err := o.ports.AllocatePorts(inst.ID, toAllocate)
				if err != nil {
					return nil, fmt.Errorf("failed to allocate new ports: %w", err)
				}
				keptPorts = append(keptPorts, newRules...)
			}

			inst.AllowedPorts = keptPorts
		}
	}

	_ = specsChanged
	inst.UpdatedAt = time.Now()

	if err := o.store.Save(inst); err != nil {
		return nil, err
	}

	o.logger.Info("instance edited successfully", zap.String("id", id))
	return inst, nil
}

// TerminateInstance stops and destroys the VM and its resources
func (o *Orchestrator) TerminateInstance(id string) error {
	o.mu.Lock()
	defer o.mu.Unlock()

	inst, err := o.store.Get(id)
	if err != nil {
		return err
	}

	if inst.Status == model.StatusRunning || inst.Status == model.StatusPaused {
		if client, err := qemu.ConnectQMP(inst.QMPSocket, 1*time.Second); err == nil {
			_ = client.Quit()
			_ = client.Close()
		}
		_ = qemu.ForceKillProcess(inst.PID)
	}

	// Release ports
	o.ports.ReleasePorts(id)

	// Clean up instance directory
	if inst.WorkDir != "" {
		_ = os.RemoveAll(inst.WorkDir)
	}

	o.metricsMu.Lock()
	delete(o.cpuSamples, id)
	o.metricsMu.Unlock()

	// Delete from store
	if err := o.store.Delete(id); err != nil {
		return err
	}

	o.logger.Info("instance terminated and purged", zap.String("id", id))
	return nil
}

// GetInstance returns an instance by ID
func (o *Orchestrator) GetInstance(id string) (*model.Instance, error) {
	return o.store.Get(id)
}

// ListInstances returns all managed instances
func (o *Orchestrator) ListInstances() []*model.Instance {
	return o.store.List()
}

// GetLiveStatus queries QMP directly to return live runtime status
func (o *Orchestrator) GetLiveStatus(id string) (*model.InstanceLiveStatus, error) {
	inst, err := o.store.Get(id)
	if err != nil {
		return nil, err
	}

	status := &model.InstanceLiveStatus{
		ID:        inst.ID,
		Status:    inst.Status,
		PID:       inst.PID,
		VCPUs:     inst.VCPU,
		MemoryMB:  inst.MemoryMB,
		Ports:     inst.AllowedPorts,
		QemuState: string(inst.Status),
	}

	if inst.Status == model.StatusRunning || inst.Status == model.StatusBooting || inst.Status == model.StatusPaused {
		if !qemu.IsProcessAlive(inst.PID) {
			status.Status = model.StatusStopped
			status.QemuState = "stopped"
			return status, nil
		}

		if client, err := qemu.ConnectQMP(inst.QMPSocket, 1*time.Second); err == nil {
			defer client.Close()
			if qmpStatus, err := client.QueryStatus(); err == nil {
				status.QemuState = qmpStatus.Status
				if qmpStatus.Running {
					status.Status = model.StatusRunning
				} else if qmpStatus.Status == "paused" {
					status.Status = model.StatusPaused
				}
			}
		}
	}

	return status, nil
}

// GetConsoleLogs reads recent lines from serial.log
func (o *Orchestrator) GetConsoleLogs(id string, maxLines int) (string, error) {
	inst, err := o.store.Get(id)
	if err != nil {
		return "", err
	}

	if inst.SerialLog == "" {
		return "", errors.New("no serial log configured")
	}

	data, err := os.ReadFile(inst.SerialLog)
	if err != nil {
		if os.IsNotExist(err) {
			return "(no console output yet)", nil
		}
		return "", err
	}

	lines := strings.Split(string(data), "\n")
	if maxLines <= 0 || maxLines > 1000 {
		maxLines = 100
	}

	if len(lines) > maxLines {
		lines = lines[len(lines)-maxLines:]
	}

	return strings.Join(lines, "\n"), nil
}

// GetInstanceMetrics returns live CPU, Memory, Disk, and process stats
func (o *Orchestrator) GetInstanceMetrics(id string) (*model.InstanceMetrics, error) {
	inst, err := o.store.Get(id)
	if err != nil {
		return nil, err
	}

	metrics := &model.InstanceMetrics{
		ID:            inst.ID,
		Status:        inst.Status,
		PID:           inst.PID,
		VCPU:          inst.VCPU,
		MemoryTotalMB: inst.MemoryMB,
		DiskSizeGB:    inst.DiskSizeGB,
		ProcessAlive:  false,
	}

	// Read actual overlay file size on disk
	if stat, err := os.Stat(inst.DiskPath); err == nil {
		metrics.DiskUsedMB = int(stat.Size() / (1024 * 1024))
	}

	if inst.Status == model.StatusRunning || inst.Status == model.StatusBooting || inst.Status == model.StatusPaused {
		if inst.PID > 0 && qemu.IsProcessAlive(inst.PID) {
			metrics.ProcessAlive = true

			// Read true uptime from /proc/<pid> modification time (process start timestamp)
			if procStat, err := os.Stat(fmt.Sprintf("/proc/%d", inst.PID)); err == nil {
				metrics.UptimeSeconds = int64(time.Since(procStat.ModTime()).Seconds())
			} else {
				metrics.UptimeSeconds = int64(time.Since(inst.UpdatedAt).Seconds())
			}
			if metrics.UptimeSeconds < 0 {
				metrics.UptimeSeconds = 0
			}

			// Read /proc/<pid>/statm for RSS memory
			statmPath := fmt.Sprintf("/proc/%d/statm", inst.PID)
			if data, err := os.ReadFile(statmPath); err == nil {
				fields := strings.Fields(string(data))
				if len(fields) >= 2 {
					var residentPages int64
					if _, err := fmt.Sscanf(fields[1], "%d", &residentPages); err == nil {
						pageSize := int64(os.Getpagesize())
						metrics.MemoryUsedMB = int((residentPages * pageSize) / (1024 * 1024))
						if metrics.MemoryTotalMB > 0 {
							metrics.MemoryPercent = math.Round((float64(metrics.MemoryUsedMB)/float64(metrics.MemoryTotalMB))*1000) / 10
						}
					}
				}
			}

			// Read /proc/<pid>/stat for delta CPU calculation
			statPath := fmt.Sprintf("/proc/%d/stat", inst.PID)
			if data, err := os.ReadFile(statPath); err == nil {
				statStr := string(data)
				if lastParen := strings.LastIndex(statStr, ")"); lastParen != -1 && len(statStr) > lastParen+2 {
					fields := strings.Fields(statStr[lastParen+2:])
					if len(fields) >= 13 {
						var utime, stime int64
						_, _ = fmt.Sscanf(fields[11], "%d", &utime)
						_, _ = fmt.Sscanf(fields[12], "%d", &stime)
						totalJiffies := utime + stime
						now := time.Now()

						vcpus := float64(inst.VCPU)
						if vcpus < 1 {
							vcpus = 1
						}

						o.metricsMu.Lock()
						prev, hasPrev := o.cpuSamples[inst.ID]
						var cpuPercent float64

						if hasPrev {
							deltaSec := now.Sub(prev.timestamp).Seconds()
							deltaJiffies := totalJiffies - prev.totalJiffies

							if deltaSec >= 0.5 {
								// 100 clock ticks per second on Linux (CLK_TCK = 100)
								cpuSec := float64(deltaJiffies) / 100.0
								rawPercent := (cpuSec / deltaSec) * 100.0 / vcpus
								if rawPercent < 0 {
									rawPercent = 0
								}
								if rawPercent > 100.0 {
									rawPercent = 100.0
								}
								// Apply exponential smoothing (70% current, 30% previous)
								if prev.lastPercent > 0 {
									cpuPercent = (rawPercent * 0.7) + (prev.lastPercent * 0.3)
								} else {
									cpuPercent = rawPercent
								}
								cpuPercent = math.Round(cpuPercent*10) / 10
								o.cpuSamples[inst.ID] = cpuSample{
									timestamp:    now,
									totalJiffies: totalJiffies,
									lastPercent:  cpuPercent,
								}
							} else {
								// Within minimum sample window, return cached calculation
								cpuPercent = prev.lastPercent
							}
						} else {
							// First observation: compute average load since process birth
							if metrics.UptimeSeconds > 0 {
								cpuSec := float64(totalJiffies) / 100.0
								cpuPercent = (cpuSec / float64(metrics.UptimeSeconds)) * 100.0 / vcpus
								if cpuPercent < 0 {
									cpuPercent = 0
								}
								if cpuPercent > 100.0 {
									cpuPercent = 100.0
								}
								cpuPercent = math.Round(cpuPercent*10) / 10
							}
							o.cpuSamples[inst.ID] = cpuSample{
								timestamp:    now,
								totalJiffies: totalJiffies,
								lastPercent:  cpuPercent,
							}
						}
						o.metricsMu.Unlock()

						metrics.CPUUsagePercent = cpuPercent
					}
				}
			}

			// Record host physical RSS memory
			metrics.HostMemoryUsedMB = metrics.MemoryUsedMB

			// Probe guest OS directly (matching htop and free -m inside the VM)
			if guest := o.sampleGuestMetrics(inst); guest != nil && guest.memUsedMB > 0 {
				metrics.MemoryUsedMB = guest.memUsedMB
				metrics.MemoryPercent = guest.memPercent
				metrics.GuestMemoryUsedMB = guest.memUsedMB
				metrics.GuestMemoryTotalMB = guest.memTotalMB
				metrics.GuestCPUPercent = guest.cpuPercent
				metrics.CPUUsagePercent = guest.cpuPercent
			}
		}
	}

	return metrics, nil
}

// sampleGuestMetrics queries the VM guest OS for real inside-VM memory and CPU stats (matching htop)
func (o *Orchestrator) sampleGuestMetrics(inst *model.Instance) *guestMetricsSample {
	var sshPort int
	for _, p := range inst.AllowedPorts {
		if p.GuestPort == 22 {
			sshPort = p.HostPort
			break
		}
	}
	if sshPort == 0 {
		return nil
	}

	o.metricsMu.Lock()
	prev, exists := o.guestMetrics[inst.ID]
	if exists && time.Since(prev.timestamp) < 3*time.Second {
		o.metricsMu.Unlock()
		return &prev
	}
	o.metricsMu.Unlock()

	user := "cloud-user"
	if strings.Contains(strings.ToLower(inst.BaseImage), "cirros") {
		user = "cirros"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(ctx, "ssh",
		"-o", "BatchMode=yes",
		"-o", "StrictHostKeyChecking=no",
		"-o", "UserKnownHostsFile=/dev/null",
		"-o", "ConnectTimeout=1",
		"-p", strconv.Itoa(sshPort),
		fmt.Sprintf("%s@127.0.0.1", user),
		"cat /proc/meminfo | head -n 5; head -n 1 /proc/stat",
	)

	outBytes, err := cmd.Output()
	if err != nil {
		if exists {
			return &prev
		}
		return nil
	}

	lines := strings.Split(string(outBytes), "\n")
	var memTotalKB, memAvailKB int64

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "MemTotal:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				_, _ = fmt.Sscanf(parts[1], "%d", &memTotalKB)
			}
		} else if strings.HasPrefix(line, "MemAvailable:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				_, _ = fmt.Sscanf(parts[1], "%d", &memAvailKB)
			}
		}
	}

	if memTotalKB <= 0 {
		if exists {
			return &prev
		}
		return nil
	}

	var usedKB int64
	if memAvailKB > 0 {
		usedKB = memTotalKB - memAvailKB
	} else {
		usedKB = memTotalKB / 4
	}

	memUsedMB := int(usedKB / 1024)
	memTotalMB := int(memTotalKB / 1024)
	memPercent := math.Round((float64(usedKB)/float64(memTotalKB))*1000) / 10

	var cpuActive, cpuTotal int64
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "cpu ") {
			fields := strings.Fields(line)
			if len(fields) >= 9 {
				var u, n, s, idl, io, ir, sir, stl int64
				_, _ = fmt.Sscanf(fields[1], "%d", &u)
				_, _ = fmt.Sscanf(fields[2], "%d", &n)
				_, _ = fmt.Sscanf(fields[3], "%d", &s)
				_, _ = fmt.Sscanf(fields[4], "%d", &idl)
				_, _ = fmt.Sscanf(fields[5], "%d", &io)
				_, _ = fmt.Sscanf(fields[6], "%d", &ir)
				_, _ = fmt.Sscanf(fields[7], "%d", &sir)
				_, _ = fmt.Sscanf(fields[8], "%d", &stl)

				cpuActive = u + n + s + ir + sir + stl
				cpuTotal = cpuActive + idl + io
			}
			break
		}
	}

	sample := guestMetricsSample{
		timestamp:  time.Now(),
		memUsedMB:  memUsedMB,
		memTotalMB: memTotalMB,
		memPercent: memPercent,
		cpuActive:  cpuActive,
		cpuTotal:   cpuTotal,
	}

	if exists && prev.cpuTotal > 0 && cpuTotal > prev.cpuTotal {
		deltaActive := cpuActive - prev.cpuActive
		deltaTotal := cpuTotal - prev.cpuTotal
		if deltaTotal > 0 {
			calcPercent := (float64(deltaActive) / float64(deltaTotal)) * 100.0
			if calcPercent < 0 {
				calcPercent = 0
			}
			if calcPercent > 100 {
				calcPercent = 100
			}
			sample.cpuPercent = math.Round(calcPercent*10) / 10
		}
	}

	o.metricsMu.Lock()
	o.guestMetrics[inst.ID] = sample
	o.metricsMu.Unlock()

	return &sample
}

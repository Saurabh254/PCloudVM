package network

import (
	"fmt"
	"net"
	"sync"

	"github.com/saurabh254/PCloudVM/backend/internal/model"
)

type PortManager struct {
	mu           sync.Mutex
	minPort      int
	maxPort      int
	currentPort  int
	reservedHost map[int]string // hostPort -> instanceID
}

func NewPortManager(minPort, maxPort int) *PortManager {
	if minPort <= 0 {
		minPort = 10000
	}
	if maxPort <= minPort {
		maxPort = 20000
	}
	return &PortManager{
		minPort:      minPort,
		maxPort:      maxPort,
		currentPort:  minPort,
		reservedHost: make(map[int]string),
	}
}

// RestoreReservations populates currently allocated ports from existing instances
func (pm *PortManager) RestoreReservations(instances []*model.Instance) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for _, inst := range instances {
		if inst.Status != model.StatusTerminated {
			for _, port := range inst.AllowedPorts {
				pm.reservedHost[port.HostPort] = inst.ID
			}
		}
	}
}

// AllocatePorts reserves host ports for the requested port rules
func (pm *PortManager) AllocatePorts(instanceID string, requests []model.PortRuleRequest) ([]model.PortRule, error) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	rules := make([]model.PortRule, 0, len(requests))
	allocatedInThisCall := make([]int, 0, len(requests))

	for _, req := range requests {
		if req.GuestPort <= 0 || req.GuestPort > 65535 {
			// Rollback allocated ports in this call
			for _, p := range allocatedInThisCall {
				delete(pm.reservedHost, p)
			}
			return nil, fmt.Errorf("invalid guest port %d", req.GuestPort)
		}

		proto := req.Protocol
		if proto == "" {
			proto = "tcp"
		}

		var hostPort int
		if req.HostPort > 0 {
			// Specific host port requested
			if existingID, inUse := pm.reservedHost[req.HostPort]; inUse && existingID != instanceID {
				for _, p := range allocatedInThisCall {
					delete(pm.reservedHost, p)
				}
				return nil, fmt.Errorf("host port %d is already assigned to instance %s", req.HostPort, existingID)
			}
			if !isPortFree(req.HostPort, proto) {
				for _, p := range allocatedInThisCall {
					delete(pm.reservedHost, p)
				}
				return nil, fmt.Errorf("host port %d is currently occupied on host system", req.HostPort)
			}
			hostPort = req.HostPort
		} else {
			// Find next free port
			var err error
			hostPort, err = pm.findFreePortLocked(proto)
			if err != nil {
				for _, p := range allocatedInThisCall {
					delete(pm.reservedHost, p)
				}
				return nil, err
			}
		}

		pm.reservedHost[hostPort] = instanceID
		allocatedInThisCall = append(allocatedInThisCall, hostPort)

		rules = append(rules, model.PortRule{
			GuestPort: req.GuestPort,
			HostPort:  hostPort,
			Protocol:  proto,
		})
	}

	return rules, nil
}

func (pm *PortManager) findFreePortLocked(protocol string) (int, error) {
	totalPorts := pm.maxPort - pm.minPort + 1
	for i := 0; i < totalPorts; i++ {
		candidate := pm.currentPort
		pm.currentPort++
		if pm.currentPort > pm.maxPort {
			pm.currentPort = pm.minPort
		}

		if _, inUse := pm.reservedHost[candidate]; !inUse {
			if isPortFree(candidate, protocol) {
				return candidate, nil
			}
		}
	}
	return 0, fmt.Errorf("no available host ports in range %d-%d", pm.minPort, pm.maxPort)
}

// ReleasePorts frees host ports associated with an instance
func (pm *PortManager) ReleasePorts(instanceID string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for port, id := range pm.reservedHost {
		if id == instanceID {
			delete(pm.reservedHost, port)
		}
	}
}

// ReleasePort frees a specific host port
func (pm *PortManager) ReleasePort(hostPort int) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	delete(pm.reservedHost, hostPort)
}

func isPortFree(port int, protocol string) bool {
	if protocol == "udp" {
		conn, err := net.ListenPacket("udp", fmt.Sprintf(":%d", port))
		if err != nil {
			return false
		}
		conn.Close()
		return true
	}

	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return false
	}
	ln.Close()
	return true
}

package qemu

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"
)

var (
	ErrQMPNotConnected = errors.New("qmp not connected")
)

// QMPClient manages a QMP Unix domain socket connection
type QMPClient struct {
	socketPath string
	conn       net.Conn
	reader     *bufio.Reader
	mu         sync.Mutex
}

type qmpCommand struct {
	Execute   string                 `json:"execute"`
	Arguments map[string]interface{} `json:"arguments,omitempty"`
}

type qmpResponse struct {
	Return json.RawMessage `json:"return,omitempty"`
	Error  *struct {
		Class string `json:"class"`
		Desc  string `json:"desc"`
	} `json:"error,omitempty"`
}

type StatusResponse struct {
	Running    bool   `json:"running"`
	Singlestep bool   `json:"singlestep"`
	Status     string `json:"status"` // e.g. "running", "paused", "shutdown", "prelaunch"
}

// ConnectQMP connects to QEMU's QMP socket with retries (waiting for socket creation)
func ConnectQMP(socketPath string, timeout time.Duration) (*QMPClient, error) {
	deadline := time.Now().Add(timeout)
	var conn net.Conn
	var err error

	for time.Now().Before(deadline) {
		conn, err = net.DialTimeout("unix", socketPath, 500*time.Millisecond)
		if err == nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to dial QMP socket at %s: %w", socketPath, err)
	}

	client := &QMPClient{
		socketPath: socketPath,
		conn:       conn,
		reader:     bufio.NewReader(conn),
	}

	// 1. Read QMP greeting banner
	_ = client.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	greeting, err := client.reader.ReadString('\n')
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed reading QMP greeting: %w", err)
	}
	_ = greeting

	// 2. Negotiate capabilities
	if err := client.executeNoLock("qmp_capabilities", nil, nil); err != nil {
		client.Close()
		return nil, fmt.Errorf("failed qmp_capabilities handshake: %w", err)
	}

	return client, nil
}

func (c *QMPClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil {
		err := c.conn.Close()
		c.conn = nil
		return err
	}
	return nil
}

func (c *QMPClient) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn != nil
}

// Execute runs a QMP command and unmarshals the return field
func (c *QMPClient) Execute(command string, args map[string]interface{}, out interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.executeNoLock(command, args, out)
}

func (c *QMPClient) executeNoLock(command string, args map[string]interface{}, out interface{}) error {
	if c.conn == nil {
		return ErrQMPNotConnected
	}

	cmd := qmpCommand{
		Execute:   command,
		Arguments: args,
	}

	payload, err := json.Marshal(cmd)
	if err != nil {
		return fmt.Errorf("marshal qmp command failed: %w", err)
	}
	payload = append(payload, '\n')

	_ = c.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if _, err := c.conn.Write(payload); err != nil {
		_ = c.conn.Close()
		c.conn = nil
		return fmt.Errorf("write to qmp socket failed: %w", err)
	}

	// Read responses until we get a return or error (ignoring asynchronous event lines)
	for {
		_ = c.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		line, err := c.reader.ReadBytes('\n')
		if err != nil {
			_ = c.conn.Close()
			c.conn = nil
			return fmt.Errorf("read from qmp socket failed: %w", err)
		}

		var resp qmpResponse
		if err := json.Unmarshal(line, &resp); err != nil {
			continue // skip malformed or empty
		}

		if resp.Error != nil {
			return fmt.Errorf("qmp error: %s (%s)", resp.Error.Desc, resp.Error.Class)
		}

		if resp.Return != nil {
			if out != nil {
				return json.Unmarshal(resp.Return, out)
			}
			return nil
		}
		// If line was an event notification (e.g. {"event": "..."}), keep reading for the command return
	}
}

// QueryStatus queries the current running/paused state of the VM
func (c *QMPClient) QueryStatus() (*StatusResponse, error) {
	var res StatusResponse
	if err := c.Execute("query-status", nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// Pause pauses CPU execution (QEMU `stop`)
func (c *QMPClient) Pause() error {
	return c.Execute("stop", nil, nil)
}

// Resume unpauses CPU execution (QEMU `cont`)
func (c *QMPClient) Resume() error {
	return c.Execute("cont", nil, nil)
}

// SystemPowerdown triggers ACPI shutdown
func (c *QMPClient) SystemPowerdown() error {
	return c.Execute("system_powerdown", nil, nil)
}

// SystemReset triggers a warm reboot
func (c *QMPClient) SystemReset() error {
	return c.Execute("system_reset", nil, nil)
}

// Quit instructs QEMU to immediately terminate
func (c *QMPClient) Quit() error {
	return c.Execute("quit", nil, nil)
}

// HumanMonitorCommand executes a monitor CLI command inside QMP
func (c *QMPClient) HumanMonitorCommand(cmdLine string) (string, error) {
	var result string
	args := map[string]interface{}{
		"command-line": cmdLine,
	}
	if err := c.Execute("human-monitor-command", args, &result); err != nil {
		return "", err
	}
	return result, nil
}

// AddPortForward adds a dynamic port forward rule to a running netdev
// Syntax: hostfwd_add <netdev_id> [tcp|udp]:[hostaddr]:hostport-[guestaddr]:guestport
func (c *QMPClient) AddPortForward(netdevID, protocol string, hostPort, guestPort int) error {
	if protocol == "" {
		protocol = "tcp"
	}
	cmd := fmt.Sprintf("hostfwd_add %s %s::%d-:%d", netdevID, strings.ToLower(protocol), hostPort, guestPort)
	out, err := c.HumanMonitorCommand(cmd)
	if err != nil {
		return fmt.Errorf("hostfwd_add failed: %w", err)
	}
	if strings.Contains(strings.ToLower(out), "error") || strings.Contains(strings.ToLower(out), "invalid") {
		return fmt.Errorf("hostfwd_add returned: %s", strings.TrimSpace(out))
	}
	return nil
}

// RemovePortForward removes a port forward rule from a running netdev
// Syntax: hostfwd_remove <netdev_id> [tcp|udp]:[hostaddr]:hostport
func (c *QMPClient) RemovePortForward(netdevID, protocol string, hostPort int) error {
	if protocol == "" {
		protocol = "tcp"
	}
	cmd := fmt.Sprintf("hostfwd_remove %s %s::%d", netdevID, strings.ToLower(protocol), hostPort)
	out, err := c.HumanMonitorCommand(cmd)
	if err != nil {
		return fmt.Errorf("hostfwd_remove failed: %w", err)
	}
	if strings.Contains(strings.ToLower(out), "error") {
		return fmt.Errorf("hostfwd_remove returned: %s", strings.TrimSpace(out))
	}
	return nil
}

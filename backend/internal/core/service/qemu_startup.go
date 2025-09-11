package service

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os/exec"

	log "github.com/sirupsen/logrus"
)

type VMResource struct {
	Connection net.Conn
	Reader     *bufio.Reader
}

func BootVM(id string, ram string, cpu int, max_cpu int) error {
	qemuPath := "qemu-system-x86_64"

	args := []string{
		"-enable-kvm",
		"-cpu", "host",
		"-m", ram,
		"-smp", fmt.Sprintf("%d,maxcpus=%d", cpu, max_cpu),
		"-hda", "/home/saurabh254/debian.img",
		"-boot", "d",
		"-name", id,
		"-nic", "user,id=net0,hostfwd=tcp::2222-:22",
		"-qmp", "unix:/tmp/qmp-sock,server,nowait",
		"-serial", "file:/dev/null",
		"-vga", "virtio",
		"-display", "vnc=:1",
		"-daemonize",
	}

	cmd := exec.Command(qemuPath, args...)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("error starting QEMU: %w", err)
	}
	return nil
}

// QMPCommand represents a QMP JSON command
type QMPCommand struct {
	Execute   string                 `json:"execute"`
	Arguments map[string]interface{} `json:"arguments,omitempty"`
}

// QMPResponse for decoding QEMU responses
type QMPResponse struct {
	Return interface{} `json:"return,omitempty"`
	Error  *struct {
		Class string `json:"class"`
		Desc  string `json:"desc"`
	} `json:"error,omitempty"`
}

func ConnectWithQemuQmpSocket() (net.Conn, *bufio.Reader, error) {
	socketPath := "/tmp/qmp-sock"

	conn, err := net.Dial("unix", socketPath)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to connect to QMP socket: %w", err)
	}

	reader := bufio.NewReader(conn)

	// Read QMP greeting
	greeting, _ := reader.ReadString('\n')
	log.Debug("QMP greeting: ", greeting)

	// Enable capabilities
	cmd := QMPCommand{Execute: "qmp_capabilities"}
	if _, err := sendCommand(conn, cmd, reader); err != nil {
		return nil, nil, fmt.Errorf("failed to enable capabilities: %w", err)
	}

	return conn, reader, nil
}

func sendCommand(conn net.Conn, cmd QMPCommand, reader *bufio.Reader) ([]byte, error) {
	data, _ := json.Marshal(cmd)
	data = append(data, '\n')

	if _, err := conn.Write(data); err != nil {
		return nil, fmt.Errorf("failed to write command: %w", err)
	}

	resp, err := reader.ReadString('\n')
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	return []byte(resp), nil
}

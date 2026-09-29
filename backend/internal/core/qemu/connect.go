package qemu

import (
	"bufio"
	"fmt"
	"net"

	"github.com/saurabh254/PCloudVM/backend/internal/config"
	"go.uber.org/zap"
)

type VMResource struct {
	Connection net.Conn
	Reader     *bufio.Reader
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
	config.Logger.Debug("QMP greeting: ", zap.String("QmpSocketGreetings", greeting))

	// Enable capabilities
	cmd := QMPCommand{Execute: "qmp_capabilities"}
	if _, err := sendCommand(conn, cmd, reader); err != nil {
		return nil, nil, fmt.Errorf("failed to enable capabilities: %w", err)
	}

	return conn, reader, nil
}

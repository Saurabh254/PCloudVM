package qemu

import (
	"bufio"
	"crypto/rand"
	"encoding/json"
	"fmt"

	"net"

	"github.com/saurabh254/PCloudVM/backend/internal/config"
	"go.uber.org/zap"
)

const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

func GenerateInstanceID(instanceType string) string {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	if err != nil {
		config.Logger.Error("failed to generate instance ID.", zap.Error(err))
	}

	for i := 0; i < 32; i++ {
		b[i] = charset[int(b[i])%len(charset)]
	}

	return fmt.Sprint("instance-" + instanceType + "-" + string(b))
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

package qemu

import (
	"fmt"

	"github.com/saurabh254/PCloudVM/backend/internal/core/service"
)

func (q *QemuInstance) Start() error {
	// Boot VM via service
	if err := service.BootVM(q.ID, q.Memory, q.CPU, q.MaxCPU); err != nil {
		return fmt.Errorf("boot failed: %w", err)
	}

	// Connect QMP
	conn, reader, err := ConnectWithQemuQmpSocket()
	if err != nil {
		return fmt.Errorf("QMP connection failed: %w", err)
	}

	q.Instance = VMResource{
		Connection: conn,
		Reader:     reader,
	}

	return nil
}

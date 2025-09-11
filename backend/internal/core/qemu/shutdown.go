package qemu

import (
	"encoding/json"
	"log"

	"github.com/saurabh254/PCloudVM/backend/internal/core/service"
)

func (q *QemuInstance) ShutdownGracefully() error {
	cmd := service.QMPCommand{Execute: "system_powerdown"}
	data, _ := json.Marshal(cmd)
	if _, err := q.Instance.Connection.Write(data); err != nil {
		return err
	}
	log.Println("Sent system_powerdown signal")
	return nil
}

func (q *QemuInstance) ForceShutdown() error {
	cmd := service.QMPCommand{Execute: "quit"}
	data, _ := json.Marshal(cmd)
	if _, err := q.Instance.Connection.Write(data); err != nil {
		return err
	}
	log.Println("Sent quit signal")
	return nil
}

package qemu

import (
	"encoding/json"

	"github.com/saurabh254/PCloudVM/backend/internal/config"
)

func (q *QemuInstance) ShutdownGracefully() error {
	cmd := QMPCommand{Execute: "system_powerdown"}
	data, _ := json.Marshal(cmd)
	if _, err := q.Instance.Connection.Write(data); err != nil {
		return err
	}
	config.Logger.Debug("sent system_powerdown signal")
	return nil
}

func (q *QemuInstance) ForceShutdown() error {
	cmd := QMPCommand{Execute: "quit"}
	data, _ := json.Marshal(cmd)
	if _, err := q.Instance.Connection.Write(data); err != nil {
		return err
	}
	config.Logger.Debug("sent quit signal")
	return nil
}

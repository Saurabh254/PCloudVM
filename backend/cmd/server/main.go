package main

import (
	"os"
	"os/signal"
	"syscall"

	"go.uber.org/zap"

	"github.com/saurabh254/PCloudVM/backend/internal/config"
	"github.com/saurabh254/PCloudVM/backend/internal/core/qemu"
)

func main() {
	config.InitLogger("dev") // or "prod"
	defer config.Logger.Sync()

	id := qemu.GenerateInstanceID("micro-t1")
	vm := qemu.NewQemuInstance(id, "micro-t1", "1G", 2, 2)

	if err := vm.Start(); err != nil {
		config.Logger.Fatal("failed to start VM",
			zap.String("instance_id", id),
			zap.Error(err),
		)
	}

	config.Logger.Info("VM is running", zap.String("instance_id", id))

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig

	config.Logger.Info("Graceful shutdown requested", zap.String("instance_id", id))
	if err := vm.ShutdownGracefully(); err != nil {
		config.Logger.Warn("graceful shutdown failed",
			zap.String("instance_id", id),
			zap.Error(err),
		)

		config.Logger.Info("Gracefull shutdown success", zap.Error(err))
	}
}

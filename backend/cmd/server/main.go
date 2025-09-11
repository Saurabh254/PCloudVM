package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/saurabh254/PCloudVM/backend/internal/core/qemu"
)

func main() {
	// Generate a stable instance ID
	id := qemu.GenerateInstanceID("micro-t1")

	// Create VM instance
	vmInstance := qemu.NewQemuInstance(id, "micro-t1", "1G", 2, 2)

	// Boot VM and wait until ready
	if err := vmInstance.Start(); err != nil {
		log.Fatalf("failed to start VM: %v", err)
	}

	log.Printf("VM %s is running. Press Ctrl+C to stop...", id)

	// Wait for Ctrl+C / SIGTERM
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig

	log.Println("Sending graceful shutdown...")
	if err := vmInstance.ShutdownGracefully(); err != nil {
		log.Printf("Graceful shutdown failed: %v", err)
	}

	log.Println("Waiting for VM to shutdown. Press Ctrl+C again to force quit...")
	<-sig

	log.Println("Force quitting VM...")
	if err := vmInstance.ForceShutdown(); err != nil {
		log.Printf("Force shutdown failed: %v", err)
	}
}

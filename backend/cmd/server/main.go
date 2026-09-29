package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"

	"github.com/saurabh254/PCloudVM/backend/internal/api"
	"github.com/saurabh254/PCloudVM/backend/internal/config"
	"github.com/saurabh254/PCloudVM/backend/internal/network"
	"github.com/saurabh254/PCloudVM/backend/internal/orchestrator"
	"github.com/saurabh254/PCloudVM/backend/internal/storage"
	"github.com/saurabh254/PCloudVM/backend/internal/store"
)

func main() {
	// 1. Initialize Logger
	env := os.Getenv("ENV")
	if env == "" {
		env = "dev"
	}
	config.InitLogger(env)
	defer config.Logger.Sync()

	config.Logger.Info("Starting PCloudVM Orchestrator Backend")

	// 2. Load Configuration
	cfg := config.Load()
	config.Logger.Info("Configuration loaded",
		zap.Int("port", cfg.Port),
		zap.String("data_dir", cfg.DataDir),
		zap.Bool("kvm_enabled", cfg.EnableKVM),
		zap.Int("min_port", cfg.MinHostPort),
		zap.Int("max_port", cfg.MaxHostPort),
	)

	// 3. Initialize Storage Manager
	sm, err := storage.NewStorageManager(cfg.ImagesDir, cfg.QemuImgBinary)
	if err != nil {
		config.Logger.Fatal("failed to initialize storage manager", zap.Error(err))
	}

	// 4. Initialize Store
	st, err := store.NewFileStore(cfg.DataDir)
	if err != nil {
		config.Logger.Fatal("failed to initialize store", zap.Error(err))
	}

	// 5. Initialize Network Port Manager
	pm := network.NewPortManager(cfg.MinHostPort, cfg.MaxHostPort)

	// 6. Initialize Orchestrator
	orch := orchestrator.NewOrchestrator(cfg, st, sm, pm, config.Logger)

	// 7. Setup REST API and Web UI
	apiServer := api.NewAPI(orch, sm, cfg, config.Logger)
	handler := apiServer.SetupRouter()

	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	// Start server in background
	go func() {
		config.Logger.Info("HTTP Server listening",
			zap.String("addr", fmt.Sprintf("http://localhost:%d", cfg.Port)),
		)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			config.Logger.Fatal("HTTP server failed", zap.Error(err))
		}
	}()

	// Graceful shutdown on signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	config.Logger.Info("Graceful shutdown initiated...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		config.Logger.Error("server shutdown error", zap.Error(err))
	}

	config.Logger.Info("PCloudVM Orchestrator shutdown complete")
}

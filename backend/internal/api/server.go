package api

import (
	"fmt"
	"net/http"
	"time"

	"go.uber.org/zap"
)

func (a *API) SetupRouter() http.Handler {
	mux := http.NewServeMux()

	// Root API endpoint
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"service": a.cfg.AppName,
			"version": "v1",
			"status":  "running",
		})
	})

	// Health check
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusOK, map[string]string{"status": "ok", "app": a.cfg.AppName})
	})

	// Instance lifecycle & management API
	mux.HandleFunc("GET /api/v1/instances", a.HandleListInstances)
	mux.HandleFunc("POST /api/v1/instances", a.HandleCreateInstance)
	mux.HandleFunc("GET /api/v1/instances/{id}", a.HandleGetInstance)
	mux.HandleFunc("GET /api/v1/instances/{id}/status", a.HandleGetLiveStatus)
	mux.HandleFunc("POST /api/v1/instances/{id}/start", a.HandleStartInstance)
	mux.HandleFunc("POST /api/v1/instances/{id}/stop", a.HandleStopInstance)
	mux.HandleFunc("POST /api/v1/instances/{id}/pause", a.HandlePauseInstance)
	mux.HandleFunc("POST /api/v1/instances/{id}/resume", a.HandleResumeInstance)
	mux.HandleFunc("PATCH /api/v1/instances/{id}", a.HandleEditInstance)
	mux.HandleFunc("DELETE /api/v1/instances/{id}", a.HandleTerminateInstance)
	mux.HandleFunc("GET /api/v1/instances/{id}/logs", a.HandleGetConsoleLogs)
	mux.HandleFunc("GET /api/v1/instances/{id}/metrics", a.HandleGetInstanceMetrics)

	// Catalog & Metadata
	mux.HandleFunc("GET /api/v1/instance-types", a.HandleListInstanceTypes)
	mux.HandleFunc("GET /api/v1/images", a.HandleListImages)
	mux.HandleFunc("POST /api/v1/images/download", a.HandleDownloadImage)
	mux.HandleFunc("GET /api/v1/system/info", a.HandleSystemInfo)

	// Middleware chain: Recovery -> CORS -> Logging
	return a.recoveryMiddleware(a.corsMiddleware(a.loggingMiddleware(mux)))
}

func (a *API) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		a.logger.Debug("HTTP Request",
			zap.String("method", r.Method),
			zap.String("path", r.URL.Path),
			zap.Duration("duration", time.Since(start)),
		)
	})
}

func (a *API) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (a *API) recoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				a.logger.Error("panic recovered in HTTP handler", zap.Any("panic", rec))
				respondError(w, http.StatusInternalServerError, fmt.Sprintf("internal server error: %v", rec))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

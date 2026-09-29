package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"runtime"
	"strconv"

	"go.uber.org/zap"

	"github.com/saurabh254/PCloudVM/backend/internal/config"
	"github.com/saurabh254/PCloudVM/backend/internal/model"
	"github.com/saurabh254/PCloudVM/backend/internal/orchestrator"
	"github.com/saurabh254/PCloudVM/backend/internal/storage"
	"github.com/saurabh254/PCloudVM/backend/internal/store"
)

type API struct {
	orch    *orchestrator.Orchestrator
	storage *storage.StorageManager
	cfg     *config.Config
	logger  *zap.Logger
}

func NewAPI(
	orch *orchestrator.Orchestrator,
	storage *storage.StorageManager,
	cfg *config.Config,
	logger *zap.Logger,
) *API {
	return &API{
		orch:    orch,
		storage: storage,
		cfg:     cfg,
		logger:  logger,
	}
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		_ = json.NewEncoder(w).Encode(data)
	}
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// HandleCreateInstance handles POST /api/v1/instances
func (a *API) HandleCreateInstance(w http.ResponseWriter, r *http.Request) {
	var req model.CreateInstanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	inst, err := a.orch.CreateInstance(req)
	if err != nil {
		a.logger.Error("failed to create instance", zap.Error(err))
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, inst)
}

// HandleListInstances handles GET /api/v1/instances
func (a *API) HandleListInstances(w http.ResponseWriter, r *http.Request) {
	list := a.orch.ListInstances()
	respondJSON(w, http.StatusOK, list)
}

// HandleGetInstance handles GET /api/v1/instances/{id}
func (a *API) HandleGetInstance(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	inst, err := a.orch.GetInstance(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			respondError(w, http.StatusNotFound, "instance not found")
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, inst)
}

// HandleGetLiveStatus handles GET /api/v1/instances/{id}/status
func (a *API) HandleGetLiveStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	status, err := a.orch.GetLiveStatus(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			respondError(w, http.StatusNotFound, "instance not found")
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, status)
}

// HandleStartInstance handles POST /api/v1/instances/{id}/start
func (a *API) HandleStartInstance(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	inst, err := a.orch.StartInstance(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			respondError(w, http.StatusNotFound, "instance not found")
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, inst)
}

// HandleStopInstance handles POST /api/v1/instances/{id}/stop
func (a *API) HandleStopInstance(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req model.StopInstanceRequest
	// Body is optional
	_ = json.NewDecoder(r.Body).Decode(&req)

	inst, err := a.orch.StopInstance(id, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			respondError(w, http.StatusNotFound, "instance not found")
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, inst)
}

// HandlePauseInstance handles POST /api/v1/instances/{id}/pause
func (a *API) HandlePauseInstance(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	inst, err := a.orch.PauseInstance(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			respondError(w, http.StatusNotFound, "instance not found")
			return
		}
		if errors.Is(err, orchestrator.ErrInvalidState) {
			respondError(w, http.StatusConflict, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, inst)
}

// HandleResumeInstance handles POST /api/v1/instances/{id}/resume
func (a *API) HandleResumeInstance(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	inst, err := a.orch.ResumeInstance(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			respondError(w, http.StatusNotFound, "instance not found")
			return
		}
		if errors.Is(err, orchestrator.ErrInvalidState) {
			respondError(w, http.StatusConflict, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, inst)
}

// HandleEditInstance handles PATCH /api/v1/instances/{id}
func (a *API) HandleEditInstance(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req model.EditInstanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	inst, err := a.orch.EditInstance(id, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			respondError(w, http.StatusNotFound, "instance not found")
			return
		}
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, inst)
}

// HandleTerminateInstance handles DELETE /api/v1/instances/{id}
func (a *API) HandleTerminateInstance(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	err := a.orch.TerminateInstance(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			respondError(w, http.StatusNotFound, "instance not found")
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message":     "instance terminated successfully",
		"instance_id": id,
	})
}

// HandleGetConsoleLogs handles GET /api/v1/instances/{id}/logs
func (a *API) HandleGetConsoleLogs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	linesStr := r.URL.Query().Get("lines")
	maxLines := 100
	if linesStr != "" {
		if parsed, err := strconv.Atoi(linesStr); err == nil && parsed > 0 {
			maxLines = parsed
		}
	}

	logs, err := a.orch.GetConsoleLogs(id, maxLines)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			respondError(w, http.StatusNotFound, "instance not found")
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"logs": logs})
}

// HandleListInstanceTypes handles GET /api/v1/instance-types
func (a *API) HandleListInstanceTypes(w http.ResponseWriter, r *http.Request) {
	types := model.ListInstanceTypes()
	respondJSON(w, http.StatusOK, types)
}

// HandleListImages handles GET /api/v1/images
func (a *API) HandleListImages(w http.ResponseWriter, r *http.Request) {
	images, err := a.storage.ListCatalogAndLocalImages()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, images)
}

// HandleDownloadImage handles POST /api/v1/images/download
func (a *API) HandleDownloadImage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL      string `json:"url"`
		Filename string `json:"filename"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.URL == "" || req.Filename == "" {
		respondError(w, http.StatusBadRequest, "url and filename are required")
		return
	}

	path, err := a.storage.DownloadImage(req.URL, req.Filename)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "image downloaded successfully",
		"path":    path,
	})
}

// HandleSystemInfo handles GET /api/v1/system/info
func (a *API) HandleSystemInfo(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"app_name":       a.cfg.AppName,
		"kvm_enabled":    a.cfg.EnableKVM,
		"host_os":        runtime.GOOS,
		"host_arch":      runtime.GOARCH,
		"host_cpus":      runtime.NumCPU(),
		"qemu_binary":    a.cfg.QemuBinary,
		"qemu_img_binary": a.cfg.QemuImgBinary,
		"port_range":     map[string]int{"min": a.cfg.MinHostPort, "max": a.cfg.MaxHostPort},
	})
}

// HandleGetInstanceMetrics handles GET /api/v1/instances/{id}/metrics
func (a *API) HandleGetInstanceMetrics(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	metrics, err := a.orch.GetInstanceMetrics(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			respondError(w, http.StatusNotFound, "instance not found")
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, metrics)
}

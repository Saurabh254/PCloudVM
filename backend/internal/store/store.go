package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/saurabh254/PCloudVM/backend/internal/model"
)

var (
	ErrNotFound = errors.New("instance not found")
)

type Store interface {
	Save(instance *model.Instance) error
	Get(id string) (*model.Instance, error)
	List() []*model.Instance
	Delete(id string) error
}

type FileStore struct {
	mu       sync.RWMutex
	filePath string
	items    map[string]*model.Instance
}

func NewFileStore(dataDir string) (*FileStore, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data dir: %w", err)
	}

	filePath := filepath.Join(dataDir, "instances.json")
	fs := &FileStore{
		filePath: filePath,
		items:    make(map[string]*model.Instance),
	}

	if err := fs.load(); err != nil {
		return nil, err
	}

	return fs, nil
}

func (s *FileStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("failed to read store file: %w", err)
	}

	if len(data) == 0 {
		return nil
	}

	var list []*model.Instance
	if err := json.Unmarshal(data, &list); err != nil {
		return fmt.Errorf("failed to decode store json: %w", err)
	}

	for _, inst := range list {
		s.items[inst.ID] = inst
	}

	return nil
}

func (s *FileStore) persistLocked() error {
	list := make([]*model.Instance, 0, len(s.items))
	for _, inst := range s.items {
		list = append(list, inst)
	}

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal instances: %w", err)
	}

	tmpFile := s.filePath + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return fmt.Errorf("failed to write tmp store file: %w", err)
	}

	return os.Rename(tmpFile, s.filePath)
}

func (s *FileStore) Save(inst *model.Instance) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Clone or save reference
	s.items[inst.ID] = inst
	return s.persistLocked()
}

func (s *FileStore) Get(id string) (*model.Instance, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	inst, exists := s.items[id]
	if !exists {
		return nil, ErrNotFound
	}
	// Return a copy to avoid race conditions
	copy := *inst
	return &copy, nil
}

func (s *FileStore) List() []*model.Instance {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]*model.Instance, 0, len(s.items))
	for _, inst := range s.items {
		copy := *inst
		list = append(list, &copy)
	}
	return list
}

func (s *FileStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.items[id]; !exists {
		return ErrNotFound
	}

	delete(s.items, id)
	return s.persistLocked()
}

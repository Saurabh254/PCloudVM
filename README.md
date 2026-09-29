# PCloudVM – Mini-AWS QEMU Cloud Orchestrator

PCloudVM is a lightweight, high-performance virtual machine orchestrator built in **Go**. It provides an AWS-like cloud experience for provisioning and managing headless QEMU virtual machines with hardware acceleration (KVM).

---

## 🌟 Key Features

- **EC2-like Instance Types**:
  - `t2.nano`: 1 vCPU, 512 MB RAM, 10 GB Disk
  - `t2.micro`: 1 vCPU, 1024 MB RAM, 15 GB Disk
  - `t2.small`: 1 vCPU, 2048 MB RAM, 20 GB Disk
  - `t2.medium`: 2 vCPU, 4096 MB RAM, 30 GB Disk
  - `c5.large`: 2 vCPU, 4096 MB RAM, 40 GB Disk
  - `m5.large`: 2 vCPU, 8192 MB RAM, 50 GB Disk
  - Custom specs (arbitrary vCPU, RAM, and Disk)

- **Complete VM Lifecycle Management**:
  - **Start**: boots QEMU headless with KVM hardware acceleration.
  - **Stop**: graceful ACPI powerdown via QMP (`system_powerdown`) with fallback/force quit.
  - **Pause**: freezes CPU execution via QMP (`stop`).
  - **Resume**: unpauses CPU execution via QMP (`cont`).
  - **Edit**:
    - Change instance type / vCPU / RAM when stopped.
    - Expand disk size via `qemu-img resize`.
    - **Hot-edit allowed ports / security groups while VM is running** via QMP human-monitor `hostfwd_add` / `hostfwd_remove`!
    - Update SSH keys and name.
  - **Terminate**: cleanly stops VM, purges overlay disks, cloud-init ISOs, and releases allocated host ports.

- **Security Groups & Port Forwarding**:
  - Expose allowed guest ports (e.g. `22`, `80`, `443`, `8080`).
  - Automatically allocates host ports in range `10000-20000` (or custom host port mapping) with collision prevention.

- **SSH Keys & Cloud-Init Provisioning**:
  - Users provide their public SSH keys (`ssh-ed25519` or `ssh-rsa`).
  - Automatically generates standard NoCloud `cidata` seed ISO containing `user-data` and `meta-data`.
  - Injects authorized keys into `cloud-user` and `root` with passwordless sudo.

- **Fast Copy-on-Write (CoW) Storage**:
  - Instances boot from lightweight QCOW2 overlay disks referencing base cloud images.
  - Instant VM provisioning in milliseconds without duplicating large base images.

- **Management Interfaces**:
  - **RESTful JSON API**: Standard OpenAPI-compatible endpoints for external clients / frontends.
  - **CLI Tool (`pcloudvm-cli`)**: Manage VMs directly from terminal.

---

## 🚀 Quickstart

### 1. Prerequisites
- Linux host with `qemu-system-x86_64`, `qemu-img`, and `xorriso`.
- KVM access (`/dev/kvm`).
- Go 1.22+.

### 2. Build Server and CLI
```bash
cd backend
go build -o bin/pcloudvm-server cmd/server/main.go
go build -o bin/pcloudvm-cli cmd/cli/main.go
```

### 3. Run Unit and Integration Tests
```bash
cd backend
go test -v ./...
```

### 4. Start the Orchestrator Server
```bash
cd backend
./bin/pcloudvm-server
```
The server will start listening on `http://localhost:5050` (configure port via `PORT=5050`).

---

## 💻 CLI Usage (`pcloudvm-cli`)

```bash
# List available instance types
./bin/pcloudvm-cli types

# View host system & virtualization info
./bin/pcloudvm-cli info

# Launch a new virtual machine
./bin/pcloudvm-cli launch \
  --name "my-web-server" \
  --type "t2.micro" \
  --ports "22,80,443" \
  --ssh-key "$(cat ~/.ssh/id_ed25519.pub)"

# List all instances
./bin/pcloudvm-cli list

# Pause a running instance
./bin/pcloudvm-cli pause <instance-id>

# Resume a paused instance
./bin/pcloudvm-cli resume <instance-id>

# Hot-edit allowed ports while running
./bin/pcloudvm-cli edit <instance-id> --ports "22,80,443,8080"

# View serial console boot logs
./bin/pcloudvm-cli logs <instance-id>

# Gracefully stop instance
./bin/pcloudvm-cli stop <instance-id>

# Terminate and delete instance
./bin/pcloudvm-cli terminate <instance-id>
```

---

## 🌐 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | API Root / Service Info |
| `GET` | `/healthz` | Health check |
| `GET` | `/api/v1/instances` | List all instances |
| `POST` | `/api/v1/instances` | Launch new instance |
| `GET` | `/api/v1/instances/{id}` | Get instance details |
| `GET` | `/api/v1/instances/{id}/status` | Live QMP status |
| `POST` | `/api/v1/instances/{id}/start` | Start instance |
| `POST` | `/api/v1/instances/{id}/stop` | Stop instance (graceful / force) |
| `POST` | `/api/v1/instances/{id}/pause` | Pause instance |
| `POST` | `/api/v1/instances/{id}/resume` | Resume instance |
| `PATCH` | `/api/v1/instances/{id}` | Edit specs, ports, name |
| `DELETE` | `/api/v1/instances/{id}` | Terminate instance |
| `GET` | `/api/v1/instances/{id}/logs` | Stream serial console output |
| `GET` | `/api/v1/instance-types` | List catalog instance types |
| `GET` | `/api/v1/images` | List available base images |
| `GET` | `/api/v1/system/info` | Host virtualization info |

---

## 📐 Architecture

```
                      +-----------------------------+
                      |   Web Dashboard / CLI Tool   |
                      +--------------+--------------+
                                     | HTTP REST API
                      +--------------v--------------+
                      |      REST API Handler       |
                      +--------------+--------------+
                                     |
               +---------------------v---------------------+
               |                Orchestrator               |
               +----------+-----------+-----------+--------+
                          |           |           |
             +------------+     +-----+----+      +-----------+
             |                  |          |                  |
      +------v------+    +------v---+  +---v--------+   +-----v-----+
      | Store (JSON)|    |  Network |  |  Storage   |   | CloudInit |
      | Thread-Safe |    | Port Mgr |  | CoW Overlay|   | NoCloud   |
      +-------------+    +----------+  +------------+   +-----------+
                               |
                        +------v------+
                        |   QEMU VM   |
                        |   Process   |
                        +------+------+
                               | UNIX Socket
                        +------v------+
                        | QMP Protocol|
                        |  Controller |
                        +-------------+
```

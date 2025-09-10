# Software Requirements Specification (SRS)  
**PCloudVM – QEMU-Based Virtual Machine Cloud Service**

---

## 1. Introduction

### 1.1 Purpose
The purpose of this Software Requirements Specification (SRS) document is to provide a detailed description of the functionality, design, and constraints of **PCloudVM**, a cloud service that enables users to create and manage virtual machines. PCloudVM is a **QEMU-based VM emulator** developed using **Python and Go**, designed to provide scalable, efficient, and secure virtualization solutions for developers and IT administrators.

This document aims to:  
- Define the functional and non-functional requirements of PCloudVM.  
- Serve as a reference for developers, testers, and stakeholders throughout the software development lifecycle.  
- Ensure clarity and agreement on system behavior, performance, and design constraints.

**Intended audience:**  
- Project stakeholders: Understand goals, scope, and capabilities.  
- Development team: Guide implementation and architecture decisions.  
- Quality assurance team: Design and execute test plans.  
- Maintenance team: Support future updates and modifications.  

---

### 1.2 Scope
PCloudVM is a cloud-based virtual machine management platform that allows users to create, run, and manage QEMU-based virtual machines efficiently.

**Scope includes:**  
- **Virtual Machine Provisioning:** Configurable CPU, RAM, storage, and network.  
- **VM Lifecycle Management:** Start, stop, pause, resume, and terminate VMs.  
- **Multi-Platform Support:** Various OS support via QEMU.  
- **Web-based Dashboard:** Monitor VM status, resource usage, and logs.  
- **APIs for Automation:** RESTful APIs for VM operations.  
- **Resource Management:** Efficient host resource allocation.  
- **Security:** Isolated VM environments with user authentication and access control.

**Out of Scope:**  
- Full hypervisor orchestration (e.g., Kubernetes, OpenStack). 
- Advanced networking beyond basic NAT and bridge modes.

**Benefits:**  
- Simplified VM setup for development and testing.  
- Centralized management of multiple VMs.  
- Productivity enhancement through automation and monitoring.  

---

### 1.3 Definitions, Acronyms, and Abbreviations
- **VM** – Virtual Machine  
- **QEMU** – Quick Emulator, a hardware virtualization platform  
- **API** – Application Programming Interface  
- **REST** – Representational State Transfer  
- **CPU** – Central Processing Unit  
- **RAM** – Random Access Memory  
- **NAT** – Network Address Translation  

---

### 1.4 References
1. QEMU Official Documentation: [https://www.qemu.org/documentation/](https://www.qemu.org/documentation/)  
2. Python Official Documentation: [https://docs.python.org/3/](https://docs.python.org/3/)  
3. Go Programming Language: [https://golang.org/doc/](https://golang.org/doc/)  
4. Cloud Virtualization Best Practices – IEEE Paper  

---

### 1.5 Overview
This document is structured as follows:  
- Section 1: Introduction – purpose, scope, definitions, references, and overview.  
- Section 2: Overall Description – product perspective, functions, user classes, environment, constraints, assumptions.  
- Section 3: Specific Requirements – functional, interface, performance, security, and other non-functional requirements.  
- Section 4: Appendices – supporting information.  
- Section 5: Index – optional reference guide.  

---

## 2. Overall Description

### 2.1 Product Perspective
PCloudVM is designed as a **standalone cloud VM management system** that can integrate with existing cloud infrastructure. It uses QEMU for virtualization and exposes Python/Go APIs for automation. It provides a web-based interface for end-users.

---

### 2.2 Product Functions
- VM creation, deletion, and configuration  
- VM lifecycle management: start, stop, pause, resume, terminate  
- Resource monitoring and reporting (CPU, RAM, storage)  
- User authentication and role-based access control  
- RESTful API support for automation  

---

### 2.3 User Classes and Characteristics
- **Developer:** Needs quick VM setup for testing code; basic technical knowledge  
- **System Administrator:** Manages multiple VMs, monitors resources, ensures security; advanced technical knowledge  
- **End-user/Tester:** Uses VMs for application testing or learning environments; basic to intermediate knowledge  

---

### 2.4 Operating Environment
- **Hardware:** x86_64 server with at least 16GB RAM, 4 CPU cores, 100GB storage  
- **Software:** Linux host (Ubuntu, CentOS), QEMU, Python 3.10+, Go 1.21+  
- **Network:** TCP/IP connectivity for API and dashboard access  

---

### 2.5 Design and Implementation Constraints
- Runs on Linux hosts only  
- QEMU version must be >= 7.0  
- Web dashboard must be responsive for desktop and mobile  
- REST APIs must comply with OpenAPI standards  

---

### 2.6 Assumptions and Dependencies
- Users have basic Linux knowledge  
- Host system has sufficient CPU, RAM, and storage  
- Dependencies like QEMU, Python, and Go are pre-installed  

---

## 3. Specific Requirements

### 3.1 Functional Requirements
1. Users can create, configure, and delete VMs  
2. Users can start, stop, pause, resume, and terminate VMs  
3. System tracks and displays VM resource usage in real-time  
4. RESTful APIs allow automated VM operations  
5. Role-based access ensures secure user operations  

---

### 3.2 External Interface Requirements

#### 3.2.1 User Interfaces
- Web-based dashboard with VM list, resource usage charts, and action buttons  
- CLI tool for advanced operations  

#### 3.2.2 Hardware Interfaces
- Standard x86_64 CPU and RAM interface  
- Storage devices accessed via QEMU virtual disk images  

#### 3.2.3 Software Interfaces
- Python and Go backend APIs  
- QEMU virtualization interface  

#### 3.2.4 Communication Interfaces
- HTTP/HTTPS for dashboard and API  
- TCP/UDP for VM networking  

---

### 3.3 Performance Requirements
- VM startup time ≤ 30 seconds  
- Dashboard response time ≤ 2 seconds for 100 VMs  
- API response time ≤ 1 second for CRUD operations  

---

### 3.4 Security Requirements
- User authentication with username/password  
- Role-based access control (Admin, Developer, Tester)  
- Secure API endpoints via HTTPS  
- VM isolation to prevent inter-VM data leakage  

---

### 3.5 Other Non-Functional Requirements
- **Reliability:** 99.5% uptime for dashboard and API  
- **Maintainability:** Modular architecture for easy updates  
- **Scalability:** Support up to 50 concurrent VMs per host  
- **Usability:** Intuitive UI with minimal training required  

---

## 4. Appendices
- Sample VM configuration files  
- API documentation reference  
- Glossary of terms  

---


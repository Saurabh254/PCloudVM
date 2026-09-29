package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"text/tabwriter"

	"github.com/saurabh254/PCloudVM/backend/internal/model"
)

var apiBase = "http://localhost:5050/api/v1"

func main() {
	if envURL := os.Getenv("PCLOUDVM_API_URL"); envURL != "" {
		apiBase = strings.TrimRight(envURL, "/") + "/api/v1"
	}

	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	command := os.Args[1]

	switch command {
	case "list", "ls":
		cmdList()
	case "launch", "create":
		cmdLaunch(os.Args[2:])
	case "start":
		cmdAction(os.Args[2:], "start", "POST")
	case "stop":
		cmdStop(os.Args[2:])
	case "pause":
		cmdAction(os.Args[2:], "pause", "POST")
	case "resume":
		cmdAction(os.Args[2:], "resume", "POST")
	case "edit":
		cmdEdit(os.Args[2:])
	case "terminate", "delete", "rm":
		cmdAction(os.Args[2:], "", "DELETE")
	case "logs":
		cmdLogs(os.Args[2:])
	case "types":
		cmdTypes()
	case "info":
		cmdInfo()
	default:
		fmt.Printf("Unknown command: %s\n\n", command)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("PCloudVM CLI - Mini-AWS Virtual Machine Orchestrator")
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  pcloudvm-cli <command> [arguments]")
	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  list, ls                     List all virtual machine instances")
	fmt.Println("  launch, create [flags]       Launch a new virtual machine")
	fmt.Println("  start <instance-id>          Start a stopped virtual machine")
	fmt.Println("  stop <instance-id> [--force] Stop a running virtual machine")
	fmt.Println("  pause <instance-id>          Pause a running virtual machine")
	fmt.Println("  resume <instance-id>         Resume a paused virtual machine")
	fmt.Println("  edit <instance-id> [flags]   Edit specs or allowed ports of an instance")
	fmt.Println("  terminate <instance-id>      Terminate and delete an instance")
	fmt.Println("  logs <instance-id>           View serial console output")
	fmt.Println("  types                        List available instance types")
	fmt.Println("  info                         Show host virtualization details")
}

func cmdList() {
	resp, err := http.Get(apiBase + "/instances")
	if err != nil {
		fmt.Printf("Error contacting server: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	var instances []model.Instance
	if err := json.NewDecoder(resp.Body).Decode(&instances); err != nil {
		fmt.Printf("Error decoding response: %v\n", err)
		os.Exit(1)
	}

	if len(instances) == 0 {
		fmt.Println("No virtual machine instances found.")
		return
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
	fmt.Fprintln(w, "ID\tNAME\tSTATUS\tTYPE\tVCPU/RAM\tALLOWED PORTS\tSSH ACCESS")
	for _, inst := range instances {
		ports := make([]string, 0, len(inst.AllowedPorts))
		sshCmd := "-"
		for _, p := range inst.AllowedPorts {
			ports = append(ports, fmt.Sprintf("%d:%d", p.HostPort, p.GuestPort))
			if p.GuestPort == 22 {
				sshCmd = fmt.Sprintf("ssh -p %d cloud-user@localhost", p.HostPort)
			}
		}
		portStr := strings.Join(ports, ", ")
		if portStr == "" {
			portStr = "none"
		}
		specs := fmt.Sprintf("%dvCPU / %dMB", inst.VCPU, inst.MemoryMB)
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%s\t%s\n",
			inst.ID, inst.Name, inst.Status, inst.InstanceType, specs, portStr, sshCmd)
	}
	w.Flush()
}

func cmdLaunch(args []string) {
	fs := flag.NewFlagSet("launch", flag.ExitOnError)
	name := fs.String("name", "", "Instance name")
	instType := fs.String("type", "t2.micro", "Instance type (t2.nano, t2.micro, t2.small, etc.)")
	portsStr := fs.String("ports", "22,80", "Allowed ports comma-separated (e.g. 22,80,443)")
	sshKey := fs.String("ssh-key", "", "Public SSH key for cloud-init")
	autoStart := fs.Bool("start", true, "Auto-start instance after creation")
	_ = fs.Parse(args)

	var allowedPorts []model.PortRuleRequest
	if *portsStr != "" {
		for _, p := range strings.Split(*portsStr, ",") {
			if num, err := strconv.Atoi(strings.TrimSpace(p)); err == nil && num > 0 {
				allowedPorts = append(allowedPorts, model.PortRuleRequest{
					GuestPort: num,
					Protocol:  "tcp",
				})
			}
		}
	}

	var sshKeys []string
	if *sshKey != "" {
		sshKeys = append(sshKeys, *sshKey)
	}

	req := model.CreateInstanceRequest{
		Name:         *name,
		InstanceType: *instType,
		AllowedPorts: allowedPorts,
		SSHKeys:      sshKeys,
		AutoStart:    *autoStart,
	}

	data, _ := json.Marshal(req)
	resp, err := http.Post(apiBase+"/instances", "application/json", bytes.NewReader(data))
	if err != nil {
		fmt.Printf("Failed: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusCreated {
		fmt.Printf("Server error (%d): %s\n", resp.StatusCode, string(body))
		os.Exit(1)
	}

	var inst model.Instance
	_ = json.Unmarshal(body, &inst)
	fmt.Printf("Instance created successfully: %s (%s)\n", inst.ID, inst.Name)
	for _, p := range inst.AllowedPorts {
		fmt.Printf("  Port: Host %d -> Guest %d (%s)\n", p.HostPort, p.GuestPort, p.Protocol)
		if p.GuestPort == 22 {
			fmt.Printf("  SSH: ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p %d cloud-user@localhost\n", p.HostPort)
		}
	}
}

func cmdStop(args []string) {
	if len(args) < 1 {
		fmt.Println("Usage: pcloudvm-cli stop <instance-id> [--force]")
		os.Exit(1)
	}
	id := args[0]
	force := false
	for _, a := range args[1:] {
		if a == "--force" || a == "-f" {
			force = true
		}
	}

	req := model.StopInstanceRequest{Force: force}
	data, _ := json.Marshal(req)
	resp, err := http.Post(apiBase+"/instances/"+id+"/stop", "application/json", bytes.NewReader(data))
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		fmt.Printf("Error (%d): %s\n", resp.StatusCode, string(b))
		os.Exit(1)
	}

	fmt.Printf("Instance %s stopped.\n", id)
}

func cmdAction(args []string, action, method string) {
	if len(args) < 1 {
		fmt.Println("Error: instance-id required")
		os.Exit(1)
	}
	id := args[0]
	url := apiBase + "/instances/" + id
	if action != "" {
		url += "/" + action
	}

	req, _ := http.NewRequest(method, url, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		fmt.Printf("Error (%d): %s\n", resp.StatusCode, string(b))
		os.Exit(1)
	}

	if action != "" {
		fmt.Printf("Instance %s: %s executed successfully.\n", id, action)
	} else {
		fmt.Printf("Instance %s processed successfully.\n", id)
	}
}

func cmdEdit(args []string) {
	if len(args) < 1 {
		fmt.Println("Usage: pcloudvm-cli edit <instance-id> [flags]")
		os.Exit(1)
	}
	id := args[0]
	fs := flag.NewFlagSet("edit", flag.ExitOnError)
	name := fs.String("name", "", "New name")
	instType := fs.String("type", "", "New instance type (e.g. t2.small)")
	diskGB := fs.Int("disk", 0, "Expand disk size (GB)")
	portsStr := fs.String("ports", "", "Updated allowed guest ports (e.g. 22,80,443)")
	_ = fs.Parse(args[1:])

	req := model.EditInstanceRequest{}
	if *name != "" {
		req.Name = name
	}
	if *instType != "" {
		req.InstanceType = instType
	}
	if *diskGB > 0 {
		req.DiskSizeGB = diskGB
	}
	if *portsStr != "" {
		var portReqs []model.PortRuleRequest
		for _, p := range strings.Split(*portsStr, ",") {
			if num, err := strconv.Atoi(strings.TrimSpace(p)); err == nil && num > 0 {
				portReqs = append(portReqs, model.PortRuleRequest{
					GuestPort: num,
					Protocol:  "tcp",
				})
			}
		}
		req.AllowedPorts = &portReqs
	}

	data, _ := json.Marshal(req)
	httpReq, _ := http.NewRequest("PATCH", apiBase+"/instances/"+id, bytes.NewReader(data))
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		fmt.Printf("Edit error (%d): %s\n", resp.StatusCode, string(b))
		os.Exit(1)
	}

	fmt.Printf("Instance %s updated successfully.\n", id)
}

func cmdLogs(args []string) {
	if len(args) < 1 {
		fmt.Println("Error: instance-id required")
		os.Exit(1)
	}
	id := args[0]
	resp, err := http.Get(apiBase + "/instances/" + id + "/logs?lines=100")
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	var data struct {
		Logs string `json:"logs"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&data)
	fmt.Println(data.Logs)
}

func cmdTypes() {
	resp, err := http.Get(apiBase + "/instance-types")
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	var types []model.InstanceTypeConfig
	_ = json.NewDecoder(resp.Body).Decode(&types)

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
	fmt.Fprintln(w, "TYPE\tvCPU\tRAM (MB)\tDEFAULT DISK\tDESCRIPTION")
	for _, t := range types {
		fmt.Fprintf(w, "%s\t%d\t%d\t%d GB\t%s\n", t.Name, t.VCPU, t.MemoryMB, t.DiskSizeGB, t.Description)
	}
	w.Flush()
}

func cmdInfo() {
	resp, err := http.Get(apiBase + "/system/info")
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	var data map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&data)
	pretty, _ := json.MarshalIndent(data, "", "  ")
	fmt.Println(string(pretty))
}

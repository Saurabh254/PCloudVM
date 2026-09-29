'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Server,
  Play,
  Square,
  Pause,
  Terminal,
  Cpu,
  Layers,
  HardDrive,
  Shield,
  Activity,
  Plus,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { apiClient, Instance, InstanceMetrics, SystemInfo } from '@/lib/api-client';
import { StatusBadge } from '@/components/StatusBadge';
import { CreateInstanceModal } from '@/components/CreateInstanceModal';

export default function DashboardOverviewPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [instanceMetrics, setInstanceMetrics] = useState<Record<string, InstanceMetrics>>({});
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [insts, sys, acts] = await Promise.all([
        apiClient.getInstances().catch(() => []),
        apiClient.getSystemInfo().catch(() => null),
        fetch('/api/activity?limit=6').then((r) => r.json()).catch(() => []),
      ]);
      setInstances(insts);
      if (sys) setSystemInfo(sys);
      setRecentActivities(acts);

      // Poll metrics for active instances
      const active = (insts as Instance[]).filter((i) => i.status === 'RUNNING' || i.status === 'BOOTING');
      if (active.length > 0) {
        const metricsMap: Record<string, InstanceMetrics> = {};
        await Promise.all(
          active.map(async (i) => {
            try {
              const m = await apiClient.getInstanceMetrics(i.id);
              metricsMap[i.id] = m;
            } catch {
              // ignore
            }
          })
        );
        setInstanceMetrics(metricsMap);
      }
    } catch (e) {
      console.error('Failed to load overview data', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handlePowerAction = async (id: string, action: 'start' | 'stop' | 'pause' | 'resume') => {
    setActionLoading(`${id}-${action}`);
    try {
      if (action === 'start') await apiClient.startInstance(id);
      if (action === 'stop') await apiClient.stopInstance(id);
      if (action === 'pause') await apiClient.pauseInstance(id);
      if (action === 'resume') await apiClient.resumeInstance(id);
      await fetchData();
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Metrics computations
  const totalInstances = instances.length;
  const runningInstances = instances.filter((i) => i.status === 'RUNNING').length;
  const stoppedInstances = instances.filter((i) => i.status === 'STOPPED').length;
  const totalVcpuAllocated = instances.reduce((acc, i) => acc + (i.status === 'RUNNING' ? i.vcpu : 0), 0);
  const totalMemoryMbAllocated = instances.reduce((acc, i) => acc + (i.status === 'RUNNING' ? i.memory_mb : 0), 0);
  const totalDiskGb = instances.reduce((acc, i) => acc + i.disk_size_gb, 0);

  const activeMetricsList = Object.values(instanceMetrics);
  const totalRssMb = activeMetricsList.reduce((acc, m) => acc + (m.memory_used_mb || 0), 0);
  const avgCpuLoad =
    activeMetricsList.length > 0
      ? activeMetricsList.reduce((acc, m) => acc + (m.cpu_usage_percent || 0), 0) / activeMetricsList.length
      : 0;

  return (
    <div className="space-y-8">
      {/* Top Banner & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Cloud Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Overview of compute instances, storage volumes, and network forwarding
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0069ff] hover:bg-[#0050d8] text-white rounded-lg text-xs font-semibold shadow-sm shadow-blue-500/25 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Launch Droplet</span>
          </button>
        </div>
      </div>

      {/* Metric Cards (DigitalOcean / AWS Cloudwatch Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Instances */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Virtual Instances
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{totalInstances}</div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
              <span className="text-emerald-600 font-semibold">{runningInstances} Running</span>
              <span>•</span>
              <span>{stoppedInstances} Stopped</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0069ff] flex items-center justify-center">
            <Server className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: vCPU Allocation */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active vCPUs
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {totalVcpuAllocated} <span className="text-sm font-normal text-slate-400">/ {systemInfo?.host_cpus || 8} Cores</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {avgCpuLoad > 0 ? (
                <span className="text-emerald-700 font-semibold">{avgCpuLoad.toFixed(1)}% avg CPU load</span>
              ) : (
                `Hypervisor: ${systemInfo?.kvm_enabled ? 'KVM Hardware Accel' : 'TCG'}`
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Cpu className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: RAM Allocation & Live RSS */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Memory
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {(totalMemoryMbAllocated / 1024).toFixed(1)}{' '}
              <span className="text-sm font-normal text-slate-400">GB</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {totalRssMb > 0 ? (
                <span className="text-emerald-700 font-semibold">{totalRssMb} MB physical RSS in use</span>
              ) : (
                `Across ${runningInstances} active workloads`
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Allocated Storage */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Provisioned Storage
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {totalDiskGb} <span className="text-sm font-normal text-slate-400">GB</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Copy-on-write QCOW2 disks
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <HardDrive className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Section: Instances Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Virtual Machines</h2>
            <p className="text-xs text-slate-500">Live QEMU instances managed by orchestrator</p>
          </div>
          <Link
            href="/instances"
            className="text-xs font-semibold text-[#0069ff] hover:underline flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {instances.length === 0 ? (
          <div className="py-16 text-center">
            <Server className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">No Instances Deployed</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Get started by launching your first virtual machine with one click.
            </p>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0069ff] hover:bg-[#0050d8] text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/25 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Launch First Droplet</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Instance Name</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">SSH Port / Forwarding</th>
                  <th className="px-6 py-3">Hardware Specs</th>
                  <th className="px-6 py-3">Base Image</th>
                  <th className="px-6 py-3 text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {instances.map((inst) => {
                  const sshPort = inst.allowed_ports.find((p) => p.guest_port === 22)?.host_port;
                  const imageName = inst.base_image.split('/').pop() || inst.base_image;

                  return (
                    <tr key={inst.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-6 py-4">
                        <Link
                          href={`/instances/${inst.id}`}
                          className="font-bold text-slate-900 hover:text-[#0069ff] flex items-center gap-2"
                        >
                          <Server className="w-4 h-4 text-slate-400" />
                          <span>{inst.name}</span>
                        </Link>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          ID: {inst.id}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <StatusBadge status={inst.status} size="sm" />
                      </td>

                      <td className="px-6 py-4 font-mono text-slate-600">
                        {sshPort ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 text-[11px]">
                              localhost:{sshPort}
                            </span>
                            <span className="text-[10px] text-slate-400">(SSH)</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">No SSH Port</span>
                        )}
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {inst.allowed_ports.length} ports exposed
                        </div>
                      </td>

                      <td className="px-6 py-4 text-slate-700">
                        <div>
                          <span className="font-semibold">{inst.instance_type}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {inst.vcpu} vCPU • {inst.memory_mb >= 1024 ? `${inst.memory_mb / 1024} GB` : `${inst.memory_mb} MB`} • {inst.disk_size_gb} GB
                        </div>
                        {instanceMetrics[inst.id] && (inst.status === 'RUNNING' || inst.status === 'BOOTING') && (
                          <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px]">
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
                              CPU {instanceMetrics[inst.id].cpu_usage_percent.toFixed(1)}%
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-semibold">
                              RAM {instanceMetrics[inst.id].memory_used_mb}MB
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4 text-slate-600">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px]">
                          {imageName}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Web Shell Shortcut */}
                          <Link
                            href={`/instances/${inst.id}?tab=terminal`}
                            className="p-1.5 bg-slate-100 hover:bg-[#0069ff] hover:text-white text-slate-600 rounded-md transition"
                            title="Open Web Terminal"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                          </Link>

                          {/* Power Controls */}
                          {inst.status === 'RUNNING' ? (
                            <>
                              <button
                                onClick={() => handlePowerAction(inst.id, 'pause')}
                                disabled={actionLoading === `${inst.id}-pause`}
                                className="p-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md shadow-xs transition cursor-pointer"
                                title="Pause VM"
                              >
                                <Pause className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handlePowerAction(inst.id, 'stop')}
                                disabled={actionLoading === `${inst.id}-stop`}
                                className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md shadow-xs transition cursor-pointer"
                                title="Stop VM"
                              >
                                <Square className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : inst.status === 'PAUSED' ? (
                            <button
                              onClick={() => handlePowerAction(inst.id, 'resume')}
                              disabled={actionLoading === `${inst.id}-resume`}
                              className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-xs transition cursor-pointer"
                              title="Resume VM"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePowerAction(inst.id, 'start')}
                              disabled={actionLoading === `${inst.id}-start`}
                              className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-xs transition cursor-pointer"
                              title="Start VM"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>
                          )}

                          {/* Details Link */}
                          <Link
                            href={`/instances/${inst.id}`}
                            className="px-2.5 py-1 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-md transition text-xs font-semibold"
                          >
                            Manage
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom Grid: Host Architecture & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Host Hypervisor Status */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#0069ff]" />
              <span>Hypervisor Infrastructure</span>
            </h2>
            <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
              Host Healthy
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-slate-400 font-medium">QEMU Binary</div>
              <div className="font-semibold text-slate-800 font-mono mt-0.5 truncate">
                {systemInfo?.qemu_binary || 'qemu-system-x86_64'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-slate-400 font-medium">Hardware Virtualization</div>
              <div className="font-semibold text-emerald-600 mt-0.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{systemInfo?.kvm_enabled ? 'KVM Enabled (/dev/kvm)' : 'Emulation'}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-slate-400 font-medium">Host Architecture</div>
              <div className="font-semibold text-slate-800 mt-0.5">
                {systemInfo?.host_os} / {systemInfo?.host_arch} ({systemInfo?.host_cpus} CPUs)
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-slate-400 font-medium">Forwarding Port Pool</div>
              <div className="font-semibold text-slate-800 font-mono mt-0.5">
                {systemInfo?.port_range?.min || 10000} - {systemInfo?.port_range?.max || 20000}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Audit Activities */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-600" />
              <span>Recent Activity Logs</span>
            </h2>
            <Link href="/activity" className="text-xs text-[#0069ff] hover:underline font-semibold">
              View All Logs
            </Link>
          </div>

          {recentActivities.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No recent activity recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivities.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between text-xs pb-2 border-b border-slate-100 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <div>
                      <span className="font-semibold text-slate-800">{log.action}</span>
                      <div className="text-slate-500 text-[11px] truncate max-w-xs">
                        {log.details}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">
                    {new Date(log.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Global Launch Modal */}
      <CreateInstanceModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => fetchData(true)}
      />
    </div>
  );
}

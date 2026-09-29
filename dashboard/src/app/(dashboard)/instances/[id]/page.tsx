'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Server,
  Play,
  Square,
  Pause,
  Terminal,
  FileText,
  Shield,
  HardDrive,
  Cpu,
  Trash2,
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Download,
  AlertTriangle,
  Loader2,
  Layers,
  Sparkles,
  Activity,
  BarChart3,
  Clock,
  Gauge,
} from 'lucide-react';
import { apiClient, Instance, InstanceMetrics } from '@/lib/api-client';
import { StatusBadge } from '@/components/StatusBadge';
import { WebTerminal } from '@/components/WebTerminal';

function formatUptime(sec?: number): string {
  if (!sec || sec <= 0) return '0s';
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export default function InstanceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const id = params?.id as string;
  const initialTab = searchParams?.get('tab') || 'terminal';

  const [instance, setInstance] = useState<Instance | null>(null);
  const [metrics, setMetrics] = useState<InstanceMetrics | null>(null);
  const [activeTab, setActiveTab] = useState<
    'terminal' | 'logs' | 'network' | 'disks' | 'hardware' | 'metrics'
  >((initialTab as any) || 'terminal');
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedPort, setCopiedPort] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Resize disk state
  const [resizeSizeGb, setResizeSizeGb] = useState<number>(20);
  const [resizing, setResizing] = useState(false);
  const [resizeSuccess, setResizeSuccess] = useState<string | null>(null);

  const fetchInstance = async () => {
    if (!id) return;
    try {
      const data = await apiClient.getInstance(id);
      setInstance(data);
      if (data.disk_size_gb) {
        setResizeSizeGb(data.disk_size_gb + 5);
      }
    } catch (e) {
      console.error('Failed to load instance', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    if (!id) return;
    setLogsLoading(true);
    try {
      const data = await apiClient.getInstanceLogs(id, 250);
      setLogs(data.logs || 'No serial logs available yet.');
    } catch (e: any) {
      setLogs(`Error fetching logs: ${e.message}`);
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchMetrics = async () => {
    if (!id) return;
    try {
      const data = await apiClient.getInstanceMetrics(id);
      setMetrics(data);
    } catch {
      // Instance may be stopped or initializing
    }
  };

  useEffect(() => {
    fetchInstance();
    fetchMetrics();
    const interval = setInterval(() => {
      fetchInstance();
      fetchMetrics();
    }, 3000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
    if (activeTab === 'metrics') {
      fetchMetrics();
    }
  }, [activeTab, id]);

  const handlePowerAction = async (action: 'start' | 'stop' | 'pause' | 'resume') => {
    if (!instance) return;
    setActionLoading(action);
    try {
      if (action === 'start') await apiClient.startInstance(instance.id);
      if (action === 'stop') await apiClient.stopInstance(instance.id);
      if (action === 'pause') await apiClient.pauseInstance(instance.id);
      if (action === 'resume') await apiClient.resumeInstance(instance.id);
      await fetchInstance();
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!instance) return;
    setActionLoading('delete');
    try {
      await apiClient.terminateInstance(instance.id);
      router.push('/instances');
    } catch (err: any) {
      alert(`Failed to terminate instance: ${err.message}`);
      setActionLoading(null);
    }
  };

  const handleResizeDisk = async () => {
    if (!instance) return;
    if (resizeSizeGb <= instance.disk_size_gb) {
      alert(`New size must be larger than current size (${instance.disk_size_gb} GB)`);
      return;
    }
    setResizing(true);
    setResizeSuccess(null);
    try {
      await apiClient.editInstance(instance.id, {
        disk_size_gb: resizeSizeGb,
      });
      setResizeSuccess(`Successfully expanded disk capacity to ${resizeSizeGb} GB!`);
      await fetchInstance();
    } catch (err: any) {
      alert(`Failed to resize disk: ${err.message}`);
    } finally {
      setResizing(false);
    }
  };

  if (loading && !instance) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-[#0069ff]" />
        <p className="text-xs">Loading instance details...</p>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="py-16 text-center">
        <Server className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-800">Instance Not Found</h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          The requested instance does not exist or has been terminated.
        </p>
        <Link
          href="/instances"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0069ff] text-white text-xs font-semibold rounded-lg"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Instances</span>
        </Link>
      </div>
    );
  }

  const sshPort = instance.allowed_ports.find((p) => p.guest_port === 22)?.host_port || 10000;
  const imageName = instance.base_image.split('/').pop() || instance.base_image;

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/instances" className="hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Instances</span>
        </Link>
        <span>/</span>
        <span className="font-semibold text-slate-800">{instance.name}</span>
        <span className="text-slate-400 font-mono">({instance.id})</span>
      </div>

      {/* Main Instance Banner (DigitalOcean Droplet Header) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#0069ff] flex items-center justify-center shrink-0 border border-blue-100 shadow-xs">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">{instance.name}</h1>
              <StatusBadge status={instance.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-slate-500 font-mono">
              <span>{instance.instance_type}</span>
              <span>•</span>
              <span>{instance.vcpu} vCPU / {instance.memory_mb >= 1024 ? `${instance.memory_mb / 1024} GB` : `${instance.memory_mb} MB`} RAM</span>
              <span>•</span>
              <span>{instance.disk_size_gb} GB SSD</span>
              <span>•</span>
              <span className="text-[#0069ff] font-semibold">{imageName}</span>
              {metrics && (instance.status === 'RUNNING' || instance.status === 'BOOTING') && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 font-sans text-[11px] font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-300">
                    <Cpu className="w-3 h-3" />
                    CPU {metrics.cpu_usage_percent.toFixed(1)}%
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 font-sans text-[11px] font-semibold text-blue-800 bg-blue-100/80 px-2 py-0.5 rounded border border-blue-300">
                    <Activity className="w-3 h-3" />
                    RAM {metrics.memory_used_mb}/{metrics.memory_total_mb} MB
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 font-sans text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                    <Clock className="w-3 h-3" />
                    {formatUptime(metrics.uptime_seconds)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Power Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {instance.status === 'RUNNING' ? (
            <>
              <button
                onClick={() => handlePowerAction('pause')}
                disabled={actionLoading === 'pause'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
              <button
                onClick={() => handlePowerAction('stop')}
                disabled={actionLoading === 'stop'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop</span>
              </button>
            </>
          ) : instance.status === 'PAUSED' ? (
            <button
              onClick={() => handlePowerAction('resume')}
              disabled={actionLoading === 'resume'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume</span>
            </button>
          ) : (
            <button
              onClick={() => handlePowerAction('start')}
              disabled={actionLoading === 'start'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Power On</span>
            </button>
          )}

          <button
            onClick={() => setDeleteConfirmOpen(true)}
            className="p-1.5 bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 rounded-lg transition border border-slate-200 cursor-pointer"
            title="Terminate Droplet"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs Header (DO Style) */}
      <div className="flex items-center gap-1 border-b border-slate-200 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('terminal')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition cursor-pointer ${
            activeTab === 'terminal'
              ? 'border-[#0069ff] text-[#0069ff]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Web Shell</span>
        </button>

        <button
          onClick={() => setActiveTab('metrics')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition cursor-pointer ${
            activeTab === 'metrics'
              ? 'border-[#0069ff] text-[#0069ff]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Live Metrics</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition cursor-pointer ${
            activeTab === 'logs'
              ? 'border-[#0069ff] text-[#0069ff]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Serial Console Logs</span>
        </button>

        <button
          onClick={() => setActiveTab('network')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition cursor-pointer ${
            activeTab === 'network'
              ? 'border-[#0069ff] text-[#0069ff]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Networking & Ports</span>
        </button>

        <button
          onClick={() => setActiveTab('disks')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition cursor-pointer ${
            activeTab === 'disks'
              ? 'border-[#0069ff] text-[#0069ff]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>Volumes & Storage</span>
        </button>

        <button
          onClick={() => setActiveTab('hardware')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition cursor-pointer ${
            activeTab === 'hardware'
              ? 'border-[#0069ff] text-[#0069ff]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Specs & Hypervisor</span>
        </button>
      </div>

      {/* Tab 1: Web Shell */}
      {activeTab === 'terminal' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div>
              Interactive SSH terminal connected directly to this instance over the host forwarded port.
            </div>
            <div className="font-mono text-slate-700">
              Forwarded Host Port: <span className="font-bold text-[#0069ff]">{sshPort}</span>
            </div>
          </div>

          <WebTerminal
            instanceId={instance.id}
            instanceName={instance.name}
            hostPort={sshPort}
            baseImage={instance.base_image}
          />
        </div>
      )}

      {/* Tab: Live Metrics */}
      {activeTab === 'metrics' && (
        <div className="space-y-6">
          {/* Header Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#0069ff]" />
                <span>Real-Time Telemetry & Resource Utilization</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Live CPU %, physical RSS memory, hypervisor process health, and system uptime
              </p>
            </div>
            <button
              onClick={fetchMetrics}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer self-start sm:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Metrics</span>
            </button>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* CPU */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">CPU Utilization</span>
                <Cpu className="w-4 h-4 text-[#0069ff]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">
                  {metrics ? `${metrics.cpu_usage_percent.toFixed(1)}%` : '0%'}
                </span>
                <span className="text-xs text-slate-400">/ {metrics?.vcpu || instance.vcpu} vCPU</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    (metrics?.cpu_usage_percent || 0) > 80
                      ? 'bg-rose-500'
                      : (metrics?.cpu_usage_percent || 0) > 50
                      ? 'bg-amber-500'
                      : 'bg-[#0069ff]'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, metrics?.cpu_usage_percent || 0))}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500">
                {metrics?.guest_cpu_percent !== undefined ? 'Guest OS load (matches htop)' : 'Hypervisor CPU load'}
              </div>
            </div>

            {/* RAM */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Memory (RAM)</span>
                <Activity className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">
                  {metrics ? `${metrics.memory_used_mb} MB` : '0 MB'}
                </span>
                <span className="text-xs text-slate-400">
                  / {metrics?.memory_total_mb || instance.memory_mb} MB
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    (metrics?.memory_percent || 0) > 85
                      ? 'bg-rose-500'
                      : (metrics?.memory_percent || 0) > 65
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, metrics?.memory_percent || 0))}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                <span>{metrics?.guest_memory_used_mb ? 'Guest OS RAM (htop)' : 'Physical RSS'}</span>
                {metrics?.host_memory_used_mb && (
                  <span className="text-slate-400 font-mono text-[10px]">Host: {metrics.host_memory_used_mb}MB</span>
                )}
              </div>
            </div>

            {/* Uptime */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">System Uptime</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 font-mono">
                  {formatUptime(metrics?.uptime_seconds)}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Status: <span className="font-semibold text-slate-800">{instance.status}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                PID: {metrics?.pid || instance.pid || 'Inactive'}
              </div>
            </div>

            {/* Storage */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Storage Capacity</span>
                <HardDrive className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">
                  {instance.disk_size_gb} GB
                </span>
                <span className="text-xs text-slate-400">QCOW2</span>
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {metrics?.disk_used_mb ? (
                  <span className="text-indigo-600 font-semibold">{metrics.disk_used_mb} MB overlay on disk</span>
                ) : (
                  `Base: ${imageName}`
                )}
              </div>
              <div className="text-[11px] text-slate-400 truncate" title={instance.disk_path}>
                Disk: {instance.disk_path.split('/').pop()}
              </div>
            </div>
          </div>

          {/* Detailed Telemetry Breakdown Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Detailed Telemetry & Process Info</h3>
                <p className="text-xs text-slate-500">Host operating metrics sampled from Linux /proc filesystem</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${metrics?.process_alive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="text-xs font-semibold text-slate-700">
                  {metrics?.process_alive ? 'Hypervisor Active' : 'Hypervisor Inactive'}
                </span>
              </div>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 px-6 py-3.5 hover:bg-slate-50/50">
                <span className="font-semibold text-slate-600">QEMU Process PID</span>
                <span className="font-mono text-slate-900">{metrics?.pid || instance.pid || 'N/A'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 px-6 py-3.5 hover:bg-slate-50/50">
                <span className="font-semibold text-slate-600">Guest CPU Usage (htop)</span>
                <span className="font-mono text-slate-900">{metrics ? `${metrics.cpu_usage_percent.toFixed(2)}%` : '0%'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 px-6 py-3.5 hover:bg-slate-50/50">
                <span className="font-semibold text-slate-600">Guest OS Active Memory (htop / free -m)</span>
                <span className="font-mono text-slate-900">
                  {metrics?.guest_memory_used_mb ? (
                    <>
                      <span className="font-bold text-emerald-700">{metrics.guest_memory_used_mb} MB</span>
                      <span className="text-slate-400"> / {metrics.guest_memory_total_mb || instance.memory_mb} MB ({metrics.memory_percent.toFixed(1)}%)</span>
                    </>
                  ) : (
                    <span>{metrics?.memory_used_mb || 0} MB ({metrics?.memory_percent.toFixed(1) || 0}%)</span>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 px-6 py-3.5 hover:bg-slate-50/50">
                <span className="font-semibold text-slate-600">Host Physical Memory (Hypervisor RSS)</span>
                <span className="font-mono text-slate-900">{metrics?.host_memory_used_mb || metrics?.memory_used_mb || 0} MB (QEMU process resident set)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 px-6 py-3.5 hover:bg-slate-50/50">
                <span className="font-semibold text-slate-600">Provisioned Virtual RAM</span>
                <span className="font-mono text-slate-900">{instance.memory_mb} MB ({instance.memory_mb >= 1024 ? `${instance.memory_mb / 1024} GB` : `${instance.memory_mb} MB`})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 px-6 py-3.5 hover:bg-slate-50/50">
                <span className="font-semibold text-slate-600">Total Running Uptime</span>
                <span className="font-mono text-slate-900">{formatUptime(metrics?.uptime_seconds)} ({metrics?.uptime_seconds || 0} seconds)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 px-6 py-3.5 hover:bg-slate-50/50">
                <span className="font-semibold text-slate-600">Overlay Disk Usage</span>
                <span className="font-mono text-slate-900">{metrics?.disk_used_mb || 0} MB on host filesystem ({instance.disk_size_gb} GB provisioned virtual capacity)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 px-6 py-3.5 hover:bg-slate-50/50">
                <span className="font-semibold text-slate-600">QMP Control Socket</span>
                <span className="font-mono text-slate-700 break-all">{instance.qmp_socket}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 px-6 py-3.5 hover:bg-slate-50/50">
                <span className="font-semibold text-slate-600">Serial Output Console Log</span>
                <span className="font-mono text-slate-700 break-all">{instance.serial_log}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Serial Boot Logs */}
      {activeTab === 'logs' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="px-6 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <FileText className="w-4 h-4 text-[#0069ff]" />
              <span>Kernel Boot & Serial Output (/dev/ttyS0)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchLogs}
                disabled={logsLoading}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded text-xs transition cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${logsLoading ? 'animate-spin' : ''}`} />
                <span>Refresh Logs</span>
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([logs], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${instance.name}-serial.log`;
                  a.click();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded text-xs transition cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>Download</span>
              </button>
            </div>
          </div>
          <pre className="p-4 bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto max-h-[500px] leading-relaxed whitespace-pre-wrap">
            {logsLoading ? 'Loading boot logs...' : logs}
          </pre>
        </div>
      )}

      {/* Tab 3: Networking & Security */}
      {activeTab === 'network' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Port Forwarding Rules</h2>
                <p className="text-xs text-slate-500">
                  Guest ports forwarded to host loopback interfaces
                </p>
              </div>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Purpose</th>
                  <th className="px-6 py-3">Guest Port</th>
                  <th className="px-6 py-3">Protocol</th>
                  <th className="px-6 py-3">Host Port (Access URL)</th>
                  <th className="px-6 py-3 text-right">Quick Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {instance.allowed_ports.map((rule, idx) => {
                  const isSsh = rule.guest_port === 22;
                  const isHttp = rule.guest_port === 80;
                  const isHttps = rule.guest_port === 443;
                  const purpose = isSsh ? 'SSH Terminal' : isHttp ? 'Web HTTP' : isHttps ? 'Web HTTPS' : 'Custom Service';

                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-sans font-semibold text-slate-800">
                        {purpose}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {rule.guest_port}
                      </td>
                      <td className="px-6 py-3 text-slate-500 uppercase">
                        {rule.protocol}
                      </td>
                      <td className="px-6 py-3 font-bold text-[#0069ff]">
                        localhost:{rule.host_port}
                      </td>
                      <td className="px-6 py-3 text-right font-sans">
                        {isHttp ? (
                          <a
                            href={`http://localhost:${rule.host_port}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#0069ff] hover:underline"
                          >
                            <span>Open URL</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : isSsh ? (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`ssh -p ${rule.host_port} cloud-user@localhost`);
                              setCopiedPort(rule.host_port);
                              setTimeout(() => setCopiedPort(null), 2000);
                            }}
                            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 px-2 py-0.5 rounded cursor-pointer"
                          >
                            {copiedPort === rule.host_port ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-600">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy SSH</span>
                              </>
                            )}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Volumes & Storage */}
      {activeTab === 'disks' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[#0069ff]" />
              <span>Storage & Overlay Disk Configuration</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-400 font-semibold uppercase tracking-wider mb-1">
                  Active CoW Overlay Disk
                </div>
                <div className="font-mono text-slate-800 break-all">{instance.disk_path}</div>
                <div className="text-slate-500 mt-2">
                  Format: <strong>QCOW2</strong> (Copy-on-write overlay, protects base golden image)
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-400 font-semibold uppercase tracking-wider mb-1">
                  Golden Backing Image
                </div>
                <div className="font-mono text-slate-800 break-all">{instance.base_image}</div>
                <div className="text-slate-500 mt-2">
                  Cloud-init Seed ISO: <strong>{instance.seed_iso_path || 'Mounted as CD-ROM'}</strong>
                </div>
              </div>
            </div>

            {/* Resize Disk Section */}
            <div className="border-t border-slate-200 pt-5">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                Resize Virtual Disk Capacity
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Expand disk capacity using QEMU live volume resize. Current size: <strong>{instance.disk_size_gb} GB</strong>.
              </p>

              {resizeSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg mb-3">
                  {resizeSuccess}
                </div>
              )}

              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={instance.disk_size_gb + 1}
                  value={resizeSizeGb}
                  onChange={(e) => setResizeSizeGb(parseInt(e.target.value, 10))}
                  className="w-32 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold"
                />
                <span className="text-xs text-slate-600 font-medium">GB</span>
                <button
                  onClick={handleResizeDisk}
                  disabled={resizing || resizeSizeGb <= instance.disk_size_gb}
                  className="px-4 py-1.5 bg-[#0069ff] hover:bg-[#0050d8] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  {resizing ? 'Expanding Disk...' : 'Expand Disk Capacity'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Specs & Hypervisor */}
      {activeTab === 'hardware' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#0069ff]" />
            <span>Hypervisor Diagnostics & State</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-400 font-sans block mb-1">Process PID (QEMU)</span>
              <span className="font-bold text-slate-800">{instance.pid || 'Inactive'}</span>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-400 font-sans block mb-1">QMP Socket</span>
              <span className="text-slate-800 break-all">{instance.qmp_socket}</span>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-400 font-sans block mb-1">Work Directory</span>
              <span className="text-slate-800 break-all">{instance.work_dir}</span>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-400 font-sans block mb-1">Provisioned Timestamp</span>
              <span className="text-slate-800">{new Date(instance.created_at).toLocaleString()}</span>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2 font-sans">
              Injected Cloud-Init SSH Keys ({instance.ssh_keys?.length || 0})
            </span>
            <div className="space-y-2">
              {instance.ssh_keys?.map((k, idx) => (
                <div
                  key={idx}
                  className="p-2 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono text-slate-700 break-all"
                >
                  {k}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-full bg-rose-50 border border-rose-200">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Terminate Droplet</h3>
                <p className="text-xs text-slate-500">Irreversible action</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently destroy <strong className="text-slate-900">{instance.name}</strong>?
              All ephemeral data on the overlay disk will be deleted.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading === 'delete'}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-sm shadow-rose-500/25 transition cursor-pointer"
              >
                {actionLoading === 'delete' ? 'Destroying...' : 'Yes, Terminate Droplet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

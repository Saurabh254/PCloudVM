'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Server,
  Play,
  Square,
  Pause,
  Terminal,
  Trash2,
  Edit,
  Plus,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  Shield,
  Layers,
  Cpu,
  AlertTriangle,
  X,
  Loader2,
} from 'lucide-react';
import { apiClient, Instance, InstanceMetrics } from '@/lib/api-client';
import { StatusBadge } from '@/components/StatusBadge';
import { CreateInstanceModal } from '@/components/CreateInstanceModal';

export default function InstancesPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [instanceMetrics, setInstanceMetrics] = useState<Record<string, InstanceMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Instance | null>(null);
  const [editTarget, setEditTarget] = useState<Instance | null>(null);

  // Edit form state
  const [editVcpu, setEditVcpu] = useState(1);
  const [editMemoryMb, setEditMemoryMb] = useState(1024);
  const [editPorts, setEditPorts] = useState<
    { guest_port: number; host_port?: number; protocol: string }[]
  >([]);
  const [newPortGuest, setNewPortGuest] = useState('');
  const [newPortProto, setNewPortProto] = useState('tcp');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchInstances = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const data = await apiClient.getInstances();
      setInstances(data);

      const active = data.filter((i) => i.status === 'RUNNING' || i.status === 'BOOTING');
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
      console.error('Failed to load instances', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInstances();
    const interval = setInterval(() => fetchInstances(), 4000);
    return () => clearInterval(interval);
  }, []);

  const handlePowerAction = async (id: string, action: 'start' | 'stop' | 'pause' | 'resume') => {
    setActionLoading(`${id}-${action}`);
    try {
      if (action === 'start') await apiClient.startInstance(id);
      if (action === 'stop') await apiClient.stopInstance(id);
      if (action === 'pause') await apiClient.pauseInstance(id);
      if (action === 'resume') await apiClient.resumeInstance(id);
      await fetchInstances();
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(`delete-${deleteTarget.id}`);
    try {
      await apiClient.terminateInstance(deleteTarget.id);
      setDeleteTarget(null);
      await fetchInstances();
    } catch (err: any) {
      alert(`Failed to terminate instance: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const openEditModal = (inst: Instance) => {
    setEditTarget(inst);
    setEditVcpu(inst.vcpu);
    setEditMemoryMb(inst.memory_mb);
    setEditPorts(
      inst.allowed_ports.map((p) => ({
        guest_port: p.guest_port,
        host_port: p.host_port,
        protocol: p.protocol || 'tcp',
      }))
    );
    setEditError(null);
  };

  const handleAddPort = () => {
    const portNum = parseInt(newPortGuest, 10);
    if (!portNum || portNum < 1 || portNum > 65535) return;
    if (editPorts.some((p) => p.guest_port === portNum && p.protocol === newPortProto)) return;
    setEditPorts([...editPorts, { guest_port: portNum, protocol: newPortProto }]);
    setNewPortGuest('');
  };

  const handleRemovePort = (idx: number) => {
    setEditPorts(editPorts.filter((_, i) => i !== idx));
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setEditSubmitting(true);
    setEditError(null);

    try {
      await apiClient.editInstance(editTarget.id, {
        vcpu: editVcpu,
        memory_mb: editMemoryMb,
        allowed_ports: editPorts,
      });
      setEditTarget(null);
      await fetchInstances();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update instance configuration');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Filtering
  const filteredInstances = instances.filter((inst) => {
    const matchesSearch =
      inst.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inst.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inst.base_image.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inst.allowed_ports.some((p) => p.host_port?.toString().includes(searchTerm));

    const matchesStatus =
      statusFilter === 'ALL' || inst.status.toUpperCase() === statusFilter.toUpperCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Instances
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your virtual machine droplets, specs, ports, and console access
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchInstances(true)}
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
            <span>Create Droplet</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by name, ID, or port..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-hidden focus:border-[#0069ff] transition"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          {['ALL', 'RUNNING', 'STOPPED', 'PAUSED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer shrink-0 ${
                statusFilter === st
                  ? 'bg-[#0069ff] text-white shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading && instances.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-[#0069ff]" />
            <p className="text-xs">Fetching instances from QEMU hypervisor...</p>
          </div>
        ) : filteredInstances.length === 0 ? (
          <div className="py-16 text-center">
            <Server className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <div className="font-semibold text-slate-700 text-sm">No Instances Found</div>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
              {searchTerm || statusFilter !== 'ALL'
                ? 'Try adjusting your search query or status filter.'
                : 'You have not created any instances yet.'}
            </p>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0069ff] hover:bg-[#0050d8] text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/25 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Launch Droplet</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Instance Name</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">SSH Port / Network</th>
                  <th className="px-6 py-3">Hardware Specs</th>
                  <th className="px-6 py-3">Image</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredInstances.map((inst) => {
                  const sshPort = inst.allowed_ports.find((p) => p.guest_port === 22)?.host_port;
                  const imageName = inst.base_image.split('/').pop() || inst.base_image;

                  return (
                    <tr key={inst.id} className="hover:bg-slate-50/80 transition">
                      {/* Name & ID */}
                      <td className="px-6 py-4">
                        <Link
                          href={`/instances/${inst.id}`}
                          className="font-bold text-slate-900 hover:text-[#0069ff] flex items-center gap-2 group"
                        >
                          <Server className="w-4 h-4 text-slate-400 group-hover:text-[#0069ff]" />
                          <span>{inst.name}</span>
                        </Link>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {inst.id}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <StatusBadge status={inst.status} size="sm" />
                      </td>

                      {/* Port Mappings */}
                      <td className="px-6 py-4">
                        {sshPort ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-slate-800 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">
                              localhost:{sshPort}
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold">(SSH)</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">No SSH mapped</span>
                        )}
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          <span>{inst.allowed_ports.length} ports open</span>
                        </div>
                      </td>

                      {/* Specs */}
                      <td className="px-6 py-4 text-slate-700">
                        <div className="font-semibold text-slate-900">{inst.instance_type}</div>
                        <div className="text-[11px] text-slate-500">
                          {inst.vcpu} vCPU • {inst.memory_mb >= 1024 ? `${inst.memory_mb / 1024} GB` : `${inst.memory_mb} MB`} RAM • {inst.disk_size_gb} GB
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

                      {/* Image */}
                      <td className="px-6 py-4 text-slate-600">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-mono">
                          {imageName}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Web Shell button */}
                          <Link
                            href={`/instances/${inst.id}?tab=terminal`}
                            className="p-1.5 bg-slate-100 hover:bg-[#0069ff] hover:text-white text-slate-600 rounded-md transition"
                            title="Interactive Web Shell"
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

                          {/* Edit Button */}
                          <button
                            onClick={() => openEditModal(inst)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md transition cursor-pointer"
                            title="Edit Specs & Ports"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* Terminate Button */}
                          <button
                            onClick={() => setDeleteTarget(inst)}
                            className="p-1.5 bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 rounded-md transition cursor-pointer"
                            title="Terminate Instance"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* Terminate Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-full bg-rose-50 border border-rose-200">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Terminate Instance</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to destroy <strong className="text-slate-900">{deleteTarget.name}</strong> (<code>{deleteTarget.id}</code>)?
              The virtual disk overlay and port forwardings will be deleted.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading === `delete-${deleteTarget.id}`}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-sm shadow-rose-500/25 transition cursor-pointer"
              >
                {actionLoading === `delete-${deleteTarget.id}` ? 'Destroying...' : 'Yes, Terminate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Instance Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Edit Instance: {editTarget.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Update hardware specs or modify exposed network ports
                </p>
              </div>
              <button
                onClick={() => setEditTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {editError}
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* vCPUs & Memory */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    vCPUs
                  </label>
                  <select
                    value={editVcpu}
                    onChange={(e) => setEditVcpu(parseInt(e.target.value, 10))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                  >
                    <option value={1}>1 vCPU</option>
                    <option value={2}>2 vCPUs</option>
                    <option value={4}>4 vCPUs</option>
                    <option value={8}>8 vCPUs</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Memory (RAM)
                  </label>
                  <select
                    value={editMemoryMb}
                    onChange={(e) => setEditMemoryMb(parseInt(e.target.value, 10))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                  >
                    <option value={512}>512 MB</option>
                    <option value={1024}>1024 MB (1 GB)</option>
                    <option value={2048}>2048 MB (2 GB)</option>
                    <option value={4096}>4096 MB (4 GB)</option>
                    <option value={8192}>8192 MB (8 GB)</option>
                  </select>
                </div>
              </div>

              {/* Port Management */}
              <div>
                <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Allowed Ports (Firewall)
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="number"
                    placeholder="Guest Port (e.g. 8080)"
                    value={newPortGuest}
                    onChange={(e) => setNewPortGuest(e.target.value)}
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono"
                  />
                  <select
                    value={newPortProto}
                    onChange={(e) => setNewPortProto(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddPort}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Add Port
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-36 overflow-y-auto bg-slate-50/50">
                  {editPorts.length === 0 ? (
                    <div className="p-3 text-slate-400 text-center">No ports exposed</div>
                  ) : (
                    editPorts.map((p, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 flex items-center justify-between text-xs font-mono bg-white"
                      >
                        <span className="text-slate-800">
                          {p.host_port ? (
                            <>
                              <span className="font-semibold text-[#0069ff]">{p.host_port}</span>
                              <span className="text-slate-400 mx-1.5">➔</span>
                              <span>{p.guest_port}/{p.protocol.toUpperCase()}</span>
                            </>
                          ) : (
                            <span>
                              {p.guest_port}/{p.protocol.toUpperCase()}{' '}
                              <span className="text-slate-400 font-sans text-[11px]">(new)</span>
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePort(idx)}
                          className="text-slate-400 hover:text-rose-600 transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  * Note: Changing hardware specs will apply when the VM is restarted.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSubmitting}
                className="px-4 py-2 bg-[#0069ff] hover:bg-[#0050d8] text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/25 transition cursor-pointer"
              >
                {editSubmitting ? 'Saving Changes...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Launch Modal */}
      <CreateInstanceModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => fetchInstances(true)}
      />
    </div>
  );
}

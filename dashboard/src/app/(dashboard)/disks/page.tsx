'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  HardDrive,
  Server,
  Layers,
  RefreshCw,
  Maximize2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react';
import { apiClient, Instance } from '@/lib/api-client';

export default function DisksManagementPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Resize modal
  const [selectedDiskInstance, setSelectedDiskInstance] = useState<Instance | null>(null);
  const [newSizeGb, setNewSizeGb] = useState<number>(20);
  const [resizing, setResizing] = useState(false);
  const [resizeMsg, setResizeMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchDisks = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const data = await apiClient.getInstances();
      setInstances(data);
    } catch (e) {
      console.error('Failed to load disk instances', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDisks();
  }, []);

  const openResizeModal = (inst: Instance) => {
    setSelectedDiskInstance(inst);
    setNewSizeGb(inst.disk_size_gb + 5);
    setResizeMsg(null);
  };

  const handleResize = async () => {
    if (!selectedDiskInstance) return;
    if (newSizeGb <= selectedDiskInstance.disk_size_gb) {
      setResizeMsg({
        type: 'error',
        text: `New size must be larger than current capacity (${selectedDiskInstance.disk_size_gb} GB)`,
      });
      return;
    }

    setResizing(true);
    setResizeMsg(null);

    try {
      await apiClient.editInstance(selectedDiskInstance.id, {
        disk_size_gb: newSizeGb,
      });
      setResizeMsg({
        type: 'success',
        text: `Successfully expanded virtual disk to ${newSizeGb} GB.`,
      });
      await fetchDisks();
    } catch (err: any) {
      setResizeMsg({
        type: 'error',
        text: err.message || 'Failed to expand disk',
      });
    } finally {
      setResizing(false);
    }
  };

  const totalProvisionedStorage = instances.reduce((acc, i) => acc + (i.disk_size_gb || 0), 0);
  const totalVolumes = instances.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Volumes & Disks
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage copy-on-write overlay virtual disks and expand storage capacity
          </p>
        </div>

        <button
          onClick={() => fetchDisks(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-medium transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Volumes</span>
        </button>
      </div>

      {/* Storage Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Storage Allocated
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {totalProvisionedStorage} <span className="text-sm font-normal text-slate-500">GB</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Across all instances</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0069ff] flex items-center justify-center">
            <HardDrive className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Virtual Volumes
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{totalVolumes}</div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-1">
              QCOW2 Dynamic Sparse Overlays
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Storage Technology
            </div>
            <div className="text-base font-bold text-slate-800 mt-1">Copy-on-Write (CoW)</div>
            <div className="text-[11px] text-slate-500 mt-1">Zero golden image pollution</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Disks Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Virtual Machine Storage Drives</h2>
            <p className="text-xs text-slate-500">Overlay disk images attached to compute instances</p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-[#0069ff]" />
            <p className="text-xs">Loading volumes...</p>
          </div>
        ) : instances.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            No virtual disks found. Disks are created automatically when instances are launched.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Volume / Instance</th>
                  <th className="px-6 py-3">Virtual Capacity</th>
                  <th className="px-6 py-3">Format</th>
                  <th className="px-6 py-3">Backing Golden Image</th>
                  <th className="px-6 py-3">Disk Path</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {instances.map((inst) => {
                  const backingName = inst.base_image.split('/').pop() || inst.base_image;
                  return (
                    <tr key={inst.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-6 py-4">
                        <Link
                          href={`/instances/${inst.id}`}
                          className="font-bold text-slate-900 hover:text-[#0069ff] flex items-center gap-2"
                        >
                          <HardDrive className="w-4 h-4 text-slate-400" />
                          <span>disk.qcow2</span>
                        </Link>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Attached to: <strong>{inst.name}</strong> ({inst.id})
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-900 text-sm">
                          {inst.disk_size_gb} GB
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-[#0069ff] font-mono text-[11px] font-semibold">
                          QCOW2 Overlay
                        </span>
                      </td>

                      <td className="px-6 py-4 font-mono text-slate-600 text-[11px]">
                        {backingName}
                      </td>

                      <td className="px-6 py-4 font-mono text-slate-400 text-[10px] max-w-xs truncate" title={inst.disk_path}>
                        {inst.disk_path}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openResizeModal(inst)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-[#0069ff] hover:text-white text-slate-700 rounded-md text-xs font-semibold transition cursor-pointer"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>Resize</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resize Modal */}
      {selectedDiskInstance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-[#0069ff]" />
                <h3 className="text-base font-bold text-slate-900">
                  Expand Virtual Disk
                </h3>
              </div>
              <button
                onClick={() => setSelectedDiskInstance(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Expanding virtual disk for instance <strong>{selectedDiskInstance.name}</strong>. Current capacity is <strong>{selectedDiskInstance.disk_size_gb} GB</strong>.
            </p>

            {resizeMsg && (
              <div
                className={`p-3 text-xs rounded-lg flex items-center gap-2 ${
                  resizeMsg.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    : 'bg-rose-50 border border-rose-200 text-rose-700'
                }`}
              >
                {resizeMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span>{resizeMsg.text}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                New Disk Capacity (GB)
              </label>
              <input
                type="number"
                min={selectedDiskInstance.disk_size_gb + 1}
                value={newSizeGb}
                onChange={(e) => setNewSizeGb(parseInt(e.target.value, 10))}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Virtual capacity can only be increased, not decreased.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setSelectedDiskInstance(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={handleResize}
                disabled={resizing || newSizeGb <= selectedDiskInstance.disk_size_gb}
                className="px-4 py-2 bg-[#0069ff] hover:bg-[#0050d8] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/25 transition cursor-pointer"
              >
                {resizing ? 'Expanding...' : 'Apply Expansion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

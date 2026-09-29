'use client';

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Lock,
  Globe,
  Database,
  Layers,
} from 'lucide-react';

interface PortRule {
  port_range: number;
  protocol: string;
  description: string;
}

interface SecurityGroup {
  id: string;
  name: string;
  description: string;
  rules: PortRule[];
  created_at: string;
}

export default function SecurityGroupsPage() {
  const [securityGroups, setSecurityGroups] = useState<SecurityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Security Group form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<PortRule[]>([
    { port_range: 22, protocol: 'tcp', description: 'SSH Access' },
    { port_range: 80, protocol: 'tcp', description: 'HTTP Web' },
  ]);
  const [newPort, setNewPort] = useState('');
  const [newProto, setNewProto] = useState('tcp');
  const [newDesc, setNewDesc] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSecurityGroups = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/security-groups');
      const data = await res.json();
      setSecurityGroups(data);
    } catch (e) {
      console.error('Failed to load security groups', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSecurityGroups();
  }, []);

  const handleAddRule = () => {
    const portNum = parseInt(newPort, 10);
    if (!portNum || portNum < 1 || portNum > 65535) return;
    if (rules.some((r) => r.port_range === portNum && r.protocol === newProto)) return;

    setRules([
      ...rules,
      {
        port_range: portNum,
        protocol: newProto,
        description: newDesc.trim() || `Port ${portNum}`,
      },
    ]);
    setNewPort('');
    setNewDesc('');
  };

  const handleRemoveRule = (index: number) => {
    setRules(rules.filter((_, idx) => idx !== index));
  };

  const handleApplyPreset = (port: number, proto: string, desc: string) => {
    if (rules.some((r) => r.port_range === port && r.protocol === proto)) return;
    setRules([...rules, { port_range: port, protocol: proto, description: desc }]);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/security-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          rules,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create security group');
      }

      setIsModalOpen(false);
      setName('');
      setDescription('');
      setRules([
        { port_range: 22, protocol: 'tcp', description: 'SSH Access' },
        { port_range: 80, protocol: 'tcp', description: 'HTTP Web' },
      ]);
      await fetchSecurityGroups();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm('Are you sure you want to delete this security group?')) return;
    try {
      await fetch(`/api/security-groups?id=${id}`, { method: 'DELETE' });
      await fetchSecurityGroups();
    } catch (e: any) {
      alert(`Failed to delete: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Security Groups
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure inbound firewall rules and manage exposed network ports
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchSecurityGroups(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0069ff] hover:bg-[#0050d8] text-white rounded-lg text-xs font-semibold shadow-sm shadow-blue-500/25 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Create Security Group</span>
          </button>
        </div>
      </div>

      {/* Security Groups List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {securityGroups.map((sg) => (
          <div
            key={sg.id}
            className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col justify-between"
          >
            <div>
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0069ff] flex items-center justify-center border border-blue-100">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{sg.name}</h3>
                    <p className="text-xs text-slate-500">{sg.description || 'No description'}</p>
                  </div>
                </div>

                {sg.name !== 'default' && (
                  <button
                    onClick={() => handleDeleteGroup(sg.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                    title="Delete Security Group"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Rules Table */}
              <div className="p-4">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Inbound Rules ({sg.rules?.length || 0})
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] uppercase font-semibold">
                      <tr>
                        <th className="px-3 py-2">Port</th>
                        <th className="px-3 py-2">Protocol</th>
                        <th className="px-3 py-2">Label</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {sg.rules?.map((rule, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-bold text-[#0069ff]">
                            {rule.port_range}
                          </td>
                          <td className="px-3 py-2 text-slate-600 uppercase text-[11px]">
                            {rule.protocol}
                          </td>
                          <td className="px-3 py-2 font-sans text-slate-700 text-xs">
                            {rule.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40 text-[11px] text-slate-400 font-mono flex items-center justify-between">
              <span>ID: {sg.id}</span>
              <span>{new Date(sg.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#0069ff]" />
                <h3 className="text-base font-bold text-slate-900">
                  New Security Group
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateGroup} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. database-rules"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Inbound access for PostgreSQL and Redis"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block font-semibold text-slate-500 uppercase tracking-wider mb-1.5 text-[10px]">
                  Add Common Service Preset:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(22, 'tcp', 'SSH Access')}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium"
                  >
                    + SSH (22)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(80, 'tcp', 'HTTP Web')}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium"
                  >
                    + HTTP (80)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(443, 'tcp', 'HTTPS Secure')}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium"
                  >
                    + HTTPS (443)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(5432, 'tcp', 'PostgreSQL Database')}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium"
                  >
                    + Postgres (5432)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(6379, 'tcp', 'Redis In-Memory Cache')}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium"
                  >
                    + Redis (6379)
                  </button>
                </div>
              </div>

              {/* Add Custom Port Input */}
              <div>
                <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Custom Inbound Rule
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Port (e.g. 8080)"
                    value={newPort}
                    onChange={(e) => setNewPort(e.target.value)}
                    className="w-24 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                  />
                  <select
                    value={newProto}
                    onChange={(e) => setNewProto(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddRule}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Current Rule List */}
              <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
                {rules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 flex items-center justify-between font-mono text-xs bg-slate-50/50"
                  >
                    <div>
                      <span className="font-bold text-[#0069ff]">{rule.port_range}</span>
                      <span className="text-slate-400 mx-1.5">/</span>
                      <span className="uppercase text-slate-600">{rule.protocol}</span>
                      <span className="font-sans text-slate-500 ml-2">({rule.description})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRule(idx)}
                      className="text-slate-400 hover:text-rose-600 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || rules.length === 0}
                  className="px-4 py-2 bg-[#0069ff] hover:bg-[#0050d8] disabled:bg-blue-300 text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/25 transition cursor-pointer"
                >
                  {submitting ? 'Creating Group...' : 'Create Security Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

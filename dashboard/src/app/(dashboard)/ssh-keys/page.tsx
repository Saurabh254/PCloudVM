'use client';

import React, { useState, useEffect } from 'react';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Download,
  Sparkles,
  AlertCircle,
  RefreshCw,
  X,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

interface SshKey {
  id: string;
  name: string;
  public_key: string;
  fingerprint: string;
  created_at: string;
}

export default function SshKeysPage() {
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isGenModalOpen, setIsGenModalOpen] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<{
    name: string;
    private_key: string;
    public_key: string;
  } | null>(null);

  // Form states
  const [addName, setAddName] = useState('');
  const [addPubKey, setAddPubKey] = useState('');
  const [genName, setGenName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/ssh-keys');
      const data = await res.json();
      setKeys(data);
    } catch (e) {
      console.error('Failed to load keys', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCopyKey = (key: SshKey) => {
    navigator.clipboard.writeText(key.public_key);
    setCopiedId(key.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !addPubKey.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/ssh-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addName.trim(),
          public_key: addPubKey.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add key');

      setIsAddModalOpen(false);
      setAddName('');
      setAddPubKey('');
      await fetchKeys();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/ssh-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generate: true,
          name: genName.trim() || `key-${Date.now()}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate key');

      // Auto trigger download of the private key
      const blob = new Blob([data.private_key], { type: 'application/x-pem-file' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.name}.pem`;
      a.click();

      setGeneratedKey({
        name: data.name,
        private_key: data.private_key,
        public_key: data.public_key,
      });

      setIsGenModalOpen(false);
      setGenName('');
      await fetchKeys();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Are you sure you want to remove this SSH key?')) return;
    try {
      await fetch(`/api/ssh-keys?id=${id}`, { method: 'DELETE' });
      await fetchKeys();
    } catch (e: any) {
      alert(`Failed to delete key: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            SSH Key Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Store and generate SSH keys injected into virtual machines via Cloud-Init
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchKeys(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Key</span>
          </button>

          <button
            onClick={() => setIsGenModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0069ff] hover:bg-[#0050d8] text-white rounded-lg text-xs font-semibold shadow-sm shadow-blue-500/25 transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Generate Key Pair</span>
          </button>
        </div>
      </div>

      {/* Generated Key Success Banner */}
      {generatedKey && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>Key Pair Successfully Generated & Downloaded!</span>
            </div>
            <button
              onClick={() => setGeneratedKey(null)}
              className="p-1 text-emerald-700 hover:text-emerald-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-emerald-700 leading-relaxed">
            Your private key file <strong>{generatedKey.name}.pem</strong> has been saved to your downloads folder.
            The public key is now registered in PCloudVM and ready to inject into new Droplets.
          </p>
          <div className="p-2.5 bg-white border border-emerald-200 rounded-lg font-mono text-[11px] text-slate-700 break-all select-all">
            {generatedKey.public_key}
          </div>
        </div>
      )}

      {/* Keys List */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Registered Public Keys</h2>
            <p className="text-xs text-slate-500">Public keys available for cloud-init injection</p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-[#0069ff]" />
            <p className="text-xs">Loading keys...</p>
          </div>
        ) : keys.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            <Key className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <div className="font-semibold text-slate-700">No SSH Keys Found</div>
            <p className="mt-1 mb-4">Add your existing public key or generate a new Ed25519 key pair.</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-3 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg font-semibold"
              >
                Add Key
              </button>
              <button
                onClick={() => setIsGenModalOpen(true)}
                className="px-3 py-1.5 bg-[#0069ff] text-white rounded-lg font-semibold shadow-xs"
              >
                Generate Key
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Key Name</th>
                  <th className="px-6 py-3">Fingerprint</th>
                  <th className="px-6 py-3">Public Key Preview</th>
                  <th className="px-6 py-3">Added Date</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {keys.map((key) => (
                  <tr key={key.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <Key className="w-4 h-4 text-[#0069ff]" />
                        <span>{key.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {key.id}
                      </div>
                    </td>

                    <td className="px-6 py-4 font-mono text-slate-600 text-[11px]">
                      {key.fingerprint}
                    </td>

                    <td className="px-6 py-4 font-mono text-slate-400 text-[11px] max-w-xs truncate">
                      {key.public_key}
                    </td>

                    <td className="px-6 py-4 text-slate-500 text-[11px]">
                      {new Date(key.created_at).toLocaleDateString()}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleCopyKey(key)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md transition cursor-pointer"
                          title="Copy Public Key"
                        >
                          {copiedId === key.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          onClick={() => handleDeleteKey(key.id)}
                          className="p-1.5 bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 rounded-md transition cursor-pointer"
                          title="Delete Key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add Existing Key */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-[#0069ff]" />
                <h3 className="text-base font-bold text-slate-900">Add Existing SSH Key</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
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

            <form onSubmit={handleAddKey} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Key Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. macbook-pro-work"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Public Key Content
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Begins with 'ssh-ed25519 AAA...' or 'ssh-rsa AAA...'"
                  value={addPubKey}
                  onChange={(e) => setAddPubKey(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-900 text-xs leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#0069ff] hover:bg-[#0050d8] text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/25 transition cursor-pointer"
                >
                  {submitting ? 'Adding...' : 'Add SSH Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Generate Key Pair */}
      {isGenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#0069ff]" />
                <h3 className="text-base font-bold text-slate-900">Generate Ed25519 Key Pair</h3>
              </div>
              <button
                onClick={() => setIsGenModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              PCloudVM will generate a cryptographically secure <strong>Ed25519</strong> key pair.
              The private key (<code className="text-slate-800">.pem</code>) will automatically download to your browser.
            </p>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {error}
              </div>
            )}

            <form onSubmit={handleGenerateKey} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Key Pair Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. dev-cluster-key"
                  value={genName}
                  onChange={(e) => setGenName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsGenModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#0069ff] hover:bg-[#0050d8] text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/25 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Generating...' : 'Generate & Download'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

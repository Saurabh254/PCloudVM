'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Server,
  Cpu,
  Layers,
  HardDrive,
  Shield,
  Key,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { apiClient, CatalogImage, InstanceTypeConfig } from '@/lib/api-client';

interface SecurityGroup {
  id: string;
  name: string;
  description: string;
  rules: { port_range: number; protocol: string; description: string }[];
}

interface SshKey {
  id: string;
  name: string;
  public_key: string;
  fingerprint: string;
}

interface CreateInstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (instance: any) => void;
}

export function CreateInstanceModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateInstanceModalProps) {
  const [images, setImages] = useState<CatalogImage[]>([]);
  const [instanceTypes, setInstanceTypes] = useState<InstanceTypeConfig[]>([]);
  const [securityGroups, setSecurityGroups] = useState<SecurityGroup[]>([]);
  const [sshKeys, setSshKeys] = useState<SshKey[]>([]);

  const [selectedImage, setSelectedImage] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('t2.micro');
  const [selectedSecurityGroup, setSelectedSecurityGroup] = useState<string>('sg-default');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [customKey, setCustomKey] = useState<string>('');
  const [instanceName, setInstanceName] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      apiClient.getImages().catch(() => []),
      apiClient.getInstanceTypes().catch(() => []),
      fetch('/api/security-groups').then((r) => r.json()).catch(() => []),
      fetch('/api/ssh-keys').then((r) => r.json()).catch(() => []),
    ])
      .then(([imgs, types, sgs, keys]) => {
        if (!mounted) return;

        // 1. Sort images so Debian 12 Bookworm appears first
        const sortedImgs = [...(Array.isArray(imgs) ? imgs : [])].sort((a: CatalogImage, b: CatalogImage) => {
          if (a.id === 'debian-12') return -1;
          if (b.id === 'debian-12') return 1;
          return 0;
        });
        setImages(sortedImgs);

        // 2. Set Instance Types with fallback
        const validTypes = Array.isArray(types) && types.length > 0 ? types : [
          { name: 't2.nano', vcpu: 1, memory_mb: 512, disk_size_gb: 10, description: '1 vCPU, 512 MB RAM' },
          { name: 't2.micro', vcpu: 1, memory_mb: 1024, disk_size_gb: 15, description: '1 vCPU, 1 GB RAM' },
          { name: 't2.small', vcpu: 1, memory_mb: 2048, disk_size_gb: 20, description: '1 vCPU, 2 GB RAM' },
          { name: 't2.medium', vcpu: 2, memory_mb: 4096, disk_size_gb: 30, description: '2 vCPU, 4 GB RAM' },
          { name: 'm5.large', vcpu: 2, memory_mb: 8192, disk_size_gb: 50, description: '2 vCPU, 8 GB RAM' },
        ];
        setInstanceTypes(validTypes);

        // 3. Set Security Groups
        const validSgs = Array.isArray(sgs) ? sgs : [];
        setSecurityGroups(validSgs);

        // 4. Set SSH Keys
        const validKeys = Array.isArray(keys) ? keys : [];
        setSshKeys(validKeys);

        // Pick default image: Debian 12 Bookworm
        const debian = sortedImgs.find((i: CatalogImage) => i.id === 'debian-12' || i.filename?.includes('debian'));
        if (debian) {
          setSelectedImage(debian.id);
        } else if (sortedImgs.length > 0) {
          const installed = sortedImgs.find((i: CatalogImage) => i.installed);
          setSelectedImage(installed ? installed.id : sortedImgs[0].id);
        }

        // Pick default instance size (t2.micro for Bookworm)
        const micro = validTypes.find((t: InstanceTypeConfig) => t.name === 't2.micro');
        setSelectedType(micro ? micro.name : validTypes[0].name);

        // Pick default security group
        if (validSgs.length > 0) {
          const defSg = validSgs.find((s: SecurityGroup) => s.name === 'default');
          setSelectedSecurityGroup(defSg ? defSg.id : validSgs[0].id);
        }

        // Pick default ssh key if exists (select ALL existing keys by default)
        if (validKeys.length > 0) {
          setSelectedKeys(validKeys.map((k: SshKey) => k.public_key));
        }

        // Auto name
        const rand = Math.floor(100 + Math.random() * 900);
        setInstanceName(`vm-node-${rand}`);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleKey = (pubKey: string) => {
    if (selectedKeys.includes(pubKey)) {
      setSelectedKeys(selectedKeys.filter((k) => k !== pubKey));
    } else {
      setSelectedKeys([...selectedKeys, pubKey]);
    }
  };

  const handleCreate = async () => {
    if (submitting) return;
    setError(null);

    const name = instanceName.trim();
    if (!name) {
      setError('Please provide an instance name');
      return;
    }

    if (!selectedImage) {
      setError('Please select an OS image');
      return;
    }

    setSubmitting(true);

    try {
      // Gather allowed ports from the selected security group
      const activeSg = securityGroups.find((sg) => sg.id === selectedSecurityGroup);
      const portRules = activeSg
        ? activeSg.rules.map((r) => ({
            guest_port: r.port_range,
            protocol: r.protocol || 'tcp',
          }))
        : [{ guest_port: 22, protocol: 'tcp' }];

      // Gather SSH keys
      const finalKeys = [...selectedKeys];
      if (customKey.trim()) {
        finalKeys.push(customKey.trim());
      }

      const payload = {
        name,
        instance_type: selectedType,
        base_image: selectedImage,
        image_id: selectedImage,
        ssh_keys: finalKeys,
        allowed_ports: portRules,
      };

      const newInst = await apiClient.createInstance(payload);

      // Auto start the instance immediately
      try {
        await apiClient.startInstance(newInst.id);
      } catch (startErr) {
        console.warn('Auto-start warning:', startErr);
      }

      onSuccess(newInst);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create instance');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0069ff] flex items-center justify-center text-white shadow-xs">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Create New Instance</h2>
              <p className="text-xs text-slate-500">Deploy a headless QEMU virtual machine</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-[#0069ff]" />
              <p className="text-xs">Loading images and cloud specifications...</p>
            </div>
          ) : (
            <>
              {/* Step 1: Choose Image */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                  1. Choose an OS Image
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {images.map((img) => {
                    const isSelected = selectedImage === img.id;
                    return (
                      <div
                        key={img.id}
                        onClick={() => setSelectedImage(img.id)}
                        className={`p-3.5 rounded-lg border text-left cursor-pointer transition relative flex flex-col justify-between ${
                          isSelected
                            ? 'border-[#0069ff] bg-blue-50/40 ring-2 ring-blue-500/20'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <span>{img.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {img.id === 'debian-12' && (
                              <span className="text-[10px] bg-blue-50 text-[#0069ff] border border-blue-200 px-1.5 py-0.5 rounded font-semibold">
                                Default
                              </span>
                            )}
                            {img.installed ? (
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                                Installed
                              </span>
                            ) : (
                              <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                                Auto-fetch
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                          {img.description}
                        </p>
                        <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono pt-1 border-t border-slate-100">
                          <span>User: {img.default_user}</span>
                          <span>{img.size_estimate}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Choose Instance Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                  2. Choose Instance Size
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                  {instanceTypes.map((type) => {
                    const isSelected = selectedType === type.name;
                    return (
                      <div
                        key={type.name}
                        onClick={() => setSelectedType(type.name)}
                        className={`p-3 rounded-lg border text-center cursor-pointer transition ${
                          isSelected
                            ? 'border-[#0069ff] bg-blue-50/50 ring-2 ring-blue-500/20 text-[#0069ff]'
                            : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                        }`}
                      >
                        <div className="font-bold text-sm text-slate-900 mb-1">{type.name}</div>
                        <div className="text-xs font-semibold text-slate-700">
                          {type.memory_mb >= 1024
                            ? `${type.memory_mb / 1024} GB RAM`
                            : `${type.memory_mb} MB RAM`}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {type.vcpu} vCPU • {type.disk_size_gb} GB
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 3: Security Group & Ports */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  3. Security Group & Port Rules
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {securityGroups.map((sg) => {
                    const isSelected = selectedSecurityGroup === sg.id;
                    return (
                      <div
                        key={sg.id}
                        onClick={() => setSelectedSecurityGroup(sg.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          isSelected
                            ? 'border-[#0069ff] bg-blue-50/40 ring-2 ring-blue-500/20'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-[#0069ff]" />
                            {sg.name}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {sg.rules?.length || 0} ports
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 line-clamp-1 mb-2">
                          {sg.description || 'Custom port firewall'}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {sg.rules?.map((r, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono"
                            >
                              {r.port_range}/{r.protocol}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 4: Authentication (SSH Keys) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  4. SSH Key Injection (Cloud-Init)
                </label>
                {sshKeys.length > 0 ? (
                  <div className="space-y-2 mb-3 max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                    {sshKeys.map((key) => {
                      const isChecked = selectedKeys.includes(key.public_key);
                      return (
                        <div
                          key={key.id}
                          onClick={() => handleToggleKey(key.public_key)}
                          className={`p-2 rounded-md flex items-center justify-between cursor-pointer border text-xs transition ${
                            isChecked
                              ? 'bg-white border-blue-400 text-blue-900 shadow-xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center ${
                                isChecked
                                  ? 'bg-[#0069ff] border-[#0069ff] text-white'
                                  : 'border-slate-300'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span className="font-semibold">{key.name}</span>
                          </div>
                          <span className="font-mono text-[10px] text-slate-400">
                            {key.fingerprint.substring(0, 16)}...
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 mb-2">
                    No stored SSH keys found. You can add one below or CirrOS default password will apply.
                  </div>
                )}

                <div>
                  <input
                    type="text"
                    placeholder="Or paste an additional OpenSSH public key (ssh-ed25519 / ssh-rsa)..."
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Step 5: Instance Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  5. Instance Name
                </label>
                <input
                  type="text"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="e.g. debian-web-server"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium focus:outline-hidden focus:border-blue-500"
                />
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium rounded-lg text-xs transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={handleCreate}
            disabled={submitting || loading}
            className="flex items-center gap-2 px-5 py-2 bg-[#0069ff] hover:bg-[#0050d8] disabled:bg-blue-300 text-white font-semibold rounded-lg text-xs shadow-sm shadow-blue-500/25 transition cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Launching Droplet...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Create Droplet</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

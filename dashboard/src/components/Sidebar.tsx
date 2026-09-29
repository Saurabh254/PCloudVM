'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Server,
  HardDrive,
  Disc,
  Shield,
  Key,
  LayoutDashboard,
  Activity,
  Cpu,
  LogOut,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface SidebarProps {
  user?: {
    username: string;
    email: string;
    role: string;
  } | null;
  systemInfo?: {
    kvm_enabled: boolean;
    host_arch: string;
    host_cpus: number;
  } | null;
}

export function Sidebar({ user, systemInfo }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { label: 'Overview', href: '/', icon: LayoutDashboard },
    { label: 'Instances', href: '/instances', icon: Server },
    { label: 'Disks & Volumes', href: '/disks', icon: HardDrive },
    { label: 'OS Images', href: '/images', icon: Disc },
    { label: 'Security Groups', href: '/security-groups', icon: Shield },
    { label: 'SSH Keys', href: '/ssh-keys', icon: Key },
    { label: 'Activity Logs', href: '/activity', icon: Activity },
  ];

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (e) {
      console.error('Logout error', e);
    }
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 h-screen sticky top-0 select-none z-30">
      <div>
        {/* Brand / Logo */}
        <div className="h-16 px-6 border-b border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0069ff] flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
            <Server className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <div className="font-bold text-slate-900 tracking-tight text-base flex items-center gap-1.5">
              <span>PCloudVM</span>
              <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-[#0069ff] border border-blue-200">
                Cloud
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">Headless QEMU Cloud</div>
          </div>
        </div>

        {/* Project Selector (DO Style) */}
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1">
            Environment
          </div>
          <div className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-100 cursor-pointer transition text-xs font-medium text-slate-700">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Default Project</span>
            </div>
            <span className="text-[10px] text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
              Local
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-1.5">
            Compute & Network
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#0069ff] text-white shadow-sm shadow-blue-500/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/70" />}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer / Host Hardware & User profile */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/50 space-y-3">
        {/* Host KVM Status */}
        <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-xs">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-slate-400" /> Host Hypervisor
            </span>
            {systemInfo?.kvm_enabled ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                KVM On
              </span>
            ) : (
              <span className="text-[11px] font-medium text-amber-600">Emulation</span>
            )}
          </div>
          <div className="text-[11px] text-slate-400">
            {systemInfo?.host_arch || 'amd64'} • {systemInfo?.host_cpus || 8} vCPUs available
          </div>
        </div>

        {/* User profile & Logout */}
        <div className="flex items-center justify-between pt-1 px-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center shrink-0 uppercase border border-slate-300">
              {user?.username?.substring(0, 2) || 'AD'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800 truncate">
                {user?.username || 'admin'}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {user?.email || 'admin@pcloudvm.local'}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Log Out"
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

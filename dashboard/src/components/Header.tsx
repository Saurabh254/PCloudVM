'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Plus,
  Server,
  Shield,
  Key,
  HardDrive,
  LogOut,
  User,
  ChevronDown,
  Activity,
  CheckCircle2,
} from 'lucide-react';

interface HeaderProps {
  user?: {
    username: string;
    email: string;
    role: string;
  } | null;
  onOpenCreateInstance?: () => void;
}

export function Header({ user, onOpenCreateInstance }: HeaderProps) {
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setCreateMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (e) {
      console.error('Logout error', e);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20 shadow-xs">
      {/* Left: Breadcrumbs / Quick Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
          <span className="text-slate-900 font-semibold">PCloudVM</span>
          <span>/</span>
          <span className="text-slate-600">Console</span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Hypervisor Active</span>
        </div>
      </div>

      {/* Right: Actions & User */}
      <div className="flex items-center gap-4">
        {/* Quick + Create Dropdown (DO Style) */}
        <div className="relative" ref={createMenuRef}>
          <button
            onClick={() => setCreateMenuOpen(!createMenuOpen)}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-[#0069ff] hover:bg-[#0050d8] text-white rounded-md text-sm font-semibold shadow-sm shadow-blue-500/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Create</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-80" />
          </button>

          {createMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-1">
                Resources
              </div>
              <button
                onClick={() => {
                  setCreateMenuOpen(false);
                  if (onOpenCreateInstance) {
                    onOpenCreateInstance();
                  } else {
                    window.location.href = '/instances?action=create';
                  }
                }}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition"
              >
                <div className="w-6 h-6 rounded bg-blue-50 text-[#0069ff] flex items-center justify-center">
                  <Server className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-medium">Virtual Instance</div>
                  <div className="text-[11px] text-slate-400">Launch a new QEMU VM</div>
                </div>
              </button>

              <Link
                href="/security-groups"
                onClick={() => setCreateMenuOpen(false)}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition"
              >
                <div className="w-6 h-6 rounded bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-medium">Security Group</div>
                  <div className="text-[11px] text-slate-400">Configure firewall & ports</div>
                </div>
              </Link>

              <Link
                href="/ssh-keys"
                onClick={() => setCreateMenuOpen(false)}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition"
              >
                <div className="w-6 h-6 rounded bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Key className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-medium">SSH Key Pair</div>
                  <div className="text-[11px] text-slate-400">Generate or add public keys</div>
                </div>
              </Link>
            </div>
          )}
        </div>

        {/* User Avatar Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-semibold text-xs flex items-center justify-center uppercase">
              {user?.username?.substring(0, 2) || 'AD'}
            </div>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-2 border-b border-slate-100">
                <div className="text-xs font-semibold text-slate-900">{user?.username || 'admin'}</div>
                <div className="text-[11px] text-slate-500 truncate">{user?.email || 'admin@pcloudvm.local'}</div>
              </div>

              <Link
                href="/activity"
                onClick={() => setUserMenuOpen(false)}
                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition"
              >
                <Activity className="w-3.5 h-3.5 text-slate-400" />
                <span>Audit Logs</span>
              </Link>

              <div className="border-t border-slate-100 my-1" />

              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition font-medium"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

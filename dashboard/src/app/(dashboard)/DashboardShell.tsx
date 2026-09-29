'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { CreateInstanceModal } from '@/components/CreateInstanceModal';

interface DashboardShellProps {
  user: any;
  systemInfo: any;
  children: React.ReactNode;
}

export function DashboardShell({ user, systemInfo, children }: DashboardShellProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const router = useRouter();

  const handleInstanceCreated = (inst: any) => {
    router.push(`/instances/${inst.id}`);
    router.refresh();
  };

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      {/* Sidebar */}
      <Sidebar user={user} systemInfo={systemInfo} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <Header
          user={user}
          onOpenCreateInstance={() => setCreateModalOpen(true)}
        />

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>

      {/* Global Launch Modal */}
      <CreateInstanceModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleInstanceCreated}
      />
    </div>
  );
}

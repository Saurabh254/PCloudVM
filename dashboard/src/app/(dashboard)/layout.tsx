import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { DashboardShell } from './DashboardShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  let systemInfo = null;
  try {
    systemInfo = await apiClient.getSystemInfo();
  } catch (e) {
    // Backend offline or starting
    systemInfo = {
      app_name: 'PCloudVM Orchestrator',
      kvm_enabled: true,
      host_arch: 'amd64',
      host_cpus: 8,
    } as any;
  }

  return (
    <DashboardShell user={user} systemInfo={systemInfo}>
      {children}
    </DashboardShell>
  );
}

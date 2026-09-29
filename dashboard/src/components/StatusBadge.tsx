import React from 'react';

interface StatusBadgeProps {
  status:
    | 'PROVISIONING'
    | 'BOOTING'
    | 'RUNNING'
    | 'PAUSED'
    | 'STOPPED'
    | 'ERROR'
    | 'TERMINATED'
    | string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const normStatus = (status || '').toUpperCase();

  let badgeClass = 'bg-slate-50 text-slate-700 border-slate-200';
  let dotClass = 'bg-slate-400';
  let label = normStatus;

  switch (normStatus) {
    case 'RUNNING':
      badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      dotClass = 'bg-emerald-500';
      label = 'Running';
      break;
    case 'BOOTING':
      badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
      dotClass = 'bg-amber-500';
      label = 'Booting OS';
      break;
    case 'PROVISIONING':
      badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
      dotClass = 'bg-blue-500';
      label = 'Provisioning';
      break;
    case 'PAUSED':
      badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
      dotClass = 'bg-amber-500';
      label = 'Paused';
      break;
    case 'STOPPED':
      badgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
      dotClass = 'bg-slate-400';
      label = 'Stopped';
      break;
    case 'ERROR':
      badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
      dotClass = 'bg-rose-500';
      label = 'Error';
      break;
    case 'TERMINATED':
      badgeClass = 'bg-gray-100 text-gray-500 border-gray-200 line-through';
      dotClass = 'bg-gray-400';
      label = 'Terminated';
      break;
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${sizeClasses} ${badgeClass}`}
    >
      <span className={`inline-block rounded-full h-1.5 w-1.5 ${dotClass} shrink-0`} />
      <span>{label}</span>
    </span>
  );
}

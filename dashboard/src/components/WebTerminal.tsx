'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal as TerminalIcon,
  Play,
  RotateCcw,
  Copy,
  Check,
  Cpu,
  HardDrive,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';

interface WebTerminalProps {
  instanceId: string;
  instanceName: string;
  hostPort: number;
  baseImage: string;
}

export function WebTerminal({
  instanceId,
  instanceName,
  hostPort,
  baseImage,
}: WebTerminalProps) {
  const isCirros = baseImage.toLowerCase().includes('cirros');
  const defaultUser = isCirros ? 'cirros' : 'cloud-user';
  const defaultPassword = isCirros ? 'gocubsgo' : '';

  const [username, setUsername] = useState(defaultUser);
  const [password, setPassword] = useState(defaultPassword);
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [lines, setLines] = useState<{ id: string; type: 'cmd' | 'out' | 'err' | 'sys'; text: string }[]>([
    {
      id: 'init-1',
      type: 'sys',
      text: `Connected to PCloudVM Web Shell Bridge for instance [${instanceName}] (${instanceId})`,
    },
    {
      id: 'init-2',
      type: 'sys',
      text: `SSH Port: localhost:${hostPort} | User: ${defaultUser} ${isCirros ? '(Password: gocubsgo)' : '(Uses injected Cloud-Init SSH Key)'}`,
    },
    {
      id: 'init-3',
      type: 'sys',
      text: `Type a command below or click a quick diagnostic button to execute.`,
    },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const runCommand = async (cmdToRun: string) => {
    const trimmed = cmdToRun.trim();
    if (!trimmed || isRunning) return;

    // Add to history
    setHistory((prev) => [trimmed, ...prev]);
    setHistoryIdx(-1);
    setCommand('');

    // Append command prompt line
    const cmdId = `cmd-${Date.now()}`;
    setLines((prev) => [
      ...prev,
      { id: cmdId, type: 'cmd', text: `${username}@${instanceName}:~$ ${trimmed}` },
    ]);

    setIsRunning(true);

    try {
      const res = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId,
          command: trimmed,
          username,
          password: password || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setLines((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            type: 'err',
            text: `[Error] ${data.error || 'Execution failed'}${data.hint ? `\nHint: ${data.hint}` : ''}`,
          },
        ]);
      } else {
        const out = data.output || '(No output returned)';
        setLines((prev) => [
          ...prev,
          {
            id: `out-${Date.now()}`,
            type: 'out',
            text: out.trimEnd(),
          },
        ]);
      }
    } catch (err: any) {
      setLines((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          type: 'err',
          text: `[Bridge Error] ${err.message}`,
        },
      ]);
    } finally {
      setIsRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      runCommand(command);
    } else if (e.key === 'ArrowUp') {
      if (history.length > 0 && historyIdx + 1 < history.length) {
        const nextIdx = historyIdx + 1;
        setHistoryIdx(nextIdx);
        setCommand(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      if (historyIdx > 0) {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        setCommand(history[nextIdx]);
      } else if (historyIdx === 0) {
        setHistoryIdx(-1);
        setCommand('');
      }
    }
  };

  const clearTerminal = () => {
    setLines([
      {
        id: `sys-${Date.now()}`,
        type: 'sys',
        text: `Terminal output cleared. Ready for input.`,
      },
    ]);
  };

  const sshCliCommand = `ssh -p ${hostPort} ${username}@localhost`;

  const copySshCli = () => {
    navigator.clipboard.writeText(sshCliCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const quickCommands = [
    { label: 'Fastfetch', cmd: 'fastfetch', icon: Sparkles },
    { label: 'System Info', cmd: 'uname -a', icon: Cpu },
    { label: 'Uptime', cmd: 'uptime', icon: Activity },
    { label: 'Memory', cmd: 'free -h || free -m', icon: Layers },
    { label: 'Disk Space', cmd: 'df -h', icon: HardDrive },
    { label: 'IP Config', cmd: 'ip -br a || ifconfig', icon: Sparkles },
  ];

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      {/* Terminal Header */}
      <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <TerminalIcon className="w-3.5 h-3.5 text-[#0069ff]" />
            <span className="font-semibold text-white">{instanceName}</span>
            <span className="text-slate-500">|</span>
            <span className="text-emerald-400">localhost:{hostPort}</span>
          </div>
        </div>

        {/* SSH Connection command helper */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-300">
            <span className="text-slate-500">$</span>
            <span>{sshCliCommand}</span>
            <button
              onClick={copySshCli}
              className="ml-1 text-slate-400 hover:text-white transition p-0.5"
              title="Copy SSH command"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>

          <button
            onClick={clearTerminal}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
            title="Clear terminal"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Credentials bar */}
      <div className="bg-slate-900/90 border-b border-slate-800/80 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">User:</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-slate-200 font-mono text-xs w-28 focus:border-blue-500 focus:outline-hidden"
              placeholder="user"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Password:</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-slate-200 font-mono text-xs w-28 focus:border-blue-500 focus:outline-hidden"
              placeholder={isCirros ? 'gocubsgo' : 'optional'}
            />
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-mono">
          Interactive SSH Bridge • Status: <span className="text-emerald-400">Ready</span>
        </div>
      </div>

      {/* Quick Diagnostic buttons */}
      <div className="bg-slate-950/60 px-4 py-1.5 border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-xs">
        <span className="text-[11px] font-medium text-slate-400 shrink-0">Quick Actions:</span>
        {quickCommands.map((q) => {
          const Icon = q.icon;
          return (
            <button
              key={q.cmd}
              onClick={() => runCommand(q.cmd)}
              disabled={isRunning}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition text-xs font-mono shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Icon className="w-3 h-3 text-[#0069ff]" />
              <span>{q.label}</span>
            </button>
          );
        })}
      </div>

      {/* Terminal Screen / Output */}
      <div className="p-4 font-mono text-xs text-slate-200 min-h-[340px] max-h-[460px] overflow-y-auto space-y-1.5 bg-[#0a0f1d] selection:bg-blue-600 selection:text-white">
        {lines.map((line) => {
          if (line.type === 'sys') {
            return (
              <div key={line.id} className="text-slate-400 italic">
                {line.text}
              </div>
            );
          }
          if (line.type === 'cmd') {
            return (
              <div key={line.id} className="text-emerald-400 font-semibold pt-1">
                {line.text}
              </div>
            );
          }
          if (line.type === 'err') {
            return (
              <div key={line.id} className="text-rose-400 whitespace-pre-wrap bg-rose-950/20 p-2 rounded border border-rose-900/40">
                {line.text}
              </div>
            );
          }
          return (
            <div key={line.id} className="whitespace-pre-wrap text-slate-200 leading-relaxed font-mono">
              {line.text}
            </div>
          );
        })}

        {isRunning && (
          <div className="flex items-center gap-2 text-blue-400 py-1">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
            <span className="italic text-xs">Executing command over SSH...</span>
          </div>
        )}

        <div ref={terminalEndRef} />
      </div>

      {/* Terminal Input Bar */}
      <div className="bg-slate-950 p-3 border-t border-slate-800 flex items-center gap-2">
        <span className="text-emerald-400 font-mono font-bold text-sm select-none">
          $
        </span>
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
          placeholder="Type shell command (e.g. ls -la, uname -a, curl ipinfo.io) and press Enter..."
          className="flex-1 bg-transparent border-0 text-white font-mono text-xs focus:outline-hidden placeholder:text-slate-600 disabled:opacity-50"
        />
        <button
          onClick={() => runCommand(command)}
          disabled={!command.trim() || isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0069ff] hover:bg-[#0050d8] disabled:bg-slate-800 disabled:text-slate-600 text-white rounded text-xs font-semibold transition cursor-pointer"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Run</span>
        </button>
      </div>
    </div>
  );
}

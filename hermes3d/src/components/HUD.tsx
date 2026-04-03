"use client";

import { useState } from "react";
import { Wifi, WifiOff, Users, Activity, Send, ChevronDown, ChevronUp } from "lucide-react";
import { useAgentStore, selectAgentList, STATUS_COLORS } from "@/store/agents";
import { getGatewayClient } from "@/lib/gateway-client";
import type { Agent } from "@/lib/types";

interface HUDProps {
  onAgentSelect: (agent: Agent) => void;
  selectedAgentId?: string;
}

export function HUD({ onAgentSelect, selectedAgentId }: HUDProps) {
  const connected = useAgentStore((s) => s.connected);
  const agents = useAgentStore(selectAgentList);
  const log = useAgentStore((s) => s.activityLog.slice(0, 8));
  const [prompt, setPrompt] = useState("");
  const [rosterOpen, setRosterOpen] = useState(true);

  const activeCount = agents.filter((a) => a.status !== "idle").length;

  const broadcastPrompt = () => {
    const msg = prompt.trim();
    if (!msg) return;
    // Send to PM who coordinates
    getGatewayClient().send({ type: "chat", prompt: msg });
    setPrompt("");
  };

  return (
    <>
      {/* ── Top status bar ───────────────────────────────────── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full bg-black/60 backdrop-blur border border-white/10 text-xs text-white select-none z-20">
        {connected ? (
          <Wifi size={13} className="text-green-400" />
        ) : (
          <WifiOff size={13} className="text-red-400" />
        )}
        <span className="text-gray-300">Hermes Office</span>
        <span className="text-gray-600">·</span>
        <Users size={11} className="text-gray-400" />
        <span className="text-gray-400">{agents.length}</span>
        {activeCount > 0 && (
          <>
            <span className="text-gray-600">·</span>
            <Activity size={11} className="text-yellow-400 animate-pulse" />
            <span className="text-yellow-400">{activeCount} active</span>
          </>
        )}
      </div>

      {/* ── Agent roster — top right ─────────────────────────── */}
      <div className="absolute top-3 right-3 z-20 w-56">
        <div className="bg-black/70 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
          <button
            onClick={() => setRosterOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-300 hover:text-white transition-colors"
          >
            <span className="font-semibold tracking-wide uppercase">Agents</span>
            {rosterOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {rosterOpen && (
            <div className="divide-y divide-white/5">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => onAgentSelect(agent)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                  style={{
                    background: selectedAgentId === agent.id ? agent.color + "15" : undefined,
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: STATUS_COLORS[agent.status],
                      boxShadow:
                        agent.status !== "idle"
                          ? `0 0 6px ${STATUS_COLORS[agent.status]}`
                          : undefined,
                    }}
                  />
                  <span
                    className="text-xs font-medium flex-1 truncate"
                    style={{
                      color: selectedAgentId === agent.id ? agent.color : "#d1d5db",
                    }}
                  >
                    {agent.name}
                  </span>
                  <span className="text-[10px] text-gray-600 truncate max-w-[80px]">
                    {agent.status === "idle" ? "idle" : agent.task?.slice(0, 18) ?? agent.status}
                  </span>
                </button>
              ))}
              {agents.length === 0 && (
                <div className="px-3 py-3 text-xs text-gray-600 italic">
                  Waiting for gateway…
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Activity feed — bottom left ──────────────────────── */}
      <div className="absolute bottom-20 left-3 z-20 w-72 max-h-44 overflow-y-auto space-y-1 pointer-events-none">
        {log.map((entry, i) => {
          const agent = agents.find((a) => a.id === entry.agentId);
          return (
            <div
              key={i}
              className="flex gap-2 items-start bg-black/50 backdrop-blur rounded px-2 py-1 text-[11px]"
            >
              {agent && (
                <span className="font-semibold shrink-0" style={{ color: agent.color }}>
                  {agent.name}
                </span>
              )}
              <span className="text-gray-400 truncate">{entry.message.slice(0, 80)}</span>
            </div>
          );
        })}
      </div>

      {/* ── Broadcast input — bottom center ─────────────────── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2 items-center w-[480px] max-w-[90vw]">
        <div className="flex-1 bg-black/70 backdrop-blur border border-white/10 rounded-xl overflow-hidden flex items-center">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                broadcastPrompt();
              }
            }}
            placeholder="Message PM (coordinates all agents)…"
            className="flex-1 bg-transparent text-xs text-white px-4 py-3 outline-none placeholder-gray-600"
          />
          <button
            onClick={broadcastPrompt}
            disabled={!prompt.trim()}
            className="px-3 py-3 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            <Send size={15} />
          </button>
        </div>
      </div>

      {/* ── Connection status overlay ────────────────────────── */}
      {!connected && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="bg-black/80 backdrop-blur border border-red-500/30 rounded-2xl px-8 py-6 text-center">
            <WifiOff size={32} className="text-red-400 mx-auto mb-3" />
            <div className="text-white font-semibold mb-1">Connecting to gateway…</div>
            <div className="text-gray-400 text-sm">
              Run <code className="text-purple-400 font-mono">npm run hermes-adapter</code> or{" "}
              <code className="text-green-400 font-mono">npm run demo-gateway</code>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

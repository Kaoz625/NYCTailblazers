"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Zap, ChevronDown, ChevronUp } from "lucide-react";
import type { Agent } from "@/lib/types";
import { STATUS_COLORS, useAgentStore } from "@/store/agents";
import { getGatewayClient } from "@/lib/gateway-client";

interface AgentPanelProps {
  agent: Agent;
  onClose: () => void;
}

export function AgentPanel({ agent, onClose }: AgentPanelProps) {
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const log = useAgentStore((s) =>
    s.activityLog.filter((e) => e.agentId === agent.id).slice(0, 30)
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const sendMessage = () => {
    const prompt = input.trim();
    if (!prompt) return;
    getGatewayClient().send({ type: "chat", agentId: agent.id, prompt });
    setInput("");
    textareaRef.current?.focus();
  };

  const statusColor = STATUS_COLORS[agent.status] ?? "#9e9e9e";

  return (
    <div
      className="flex flex-col bg-[#0d0d1a] border rounded-xl shadow-2xl overflow-hidden"
      style={{
        borderColor: agent.color + "55",
        boxShadow: `0 0 24px ${agent.color}33`,
        width: 340,
        maxHeight: expanded ? 520 : 320,
        transition: "max-height 0.3s ease",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ background: agent.color + "22", borderBottom: `1px solid ${agent.color}44` }}
      >
        {/* Avatar dot */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: agent.color, color: "#000" }}
        >
          {agent.name[0]}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-white truncate">{agent.name}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase"
              style={{ background: statusColor + "33", color: statusColor }}
            >
              {agent.status}
            </span>
          </div>
          <div className="text-[11px] text-gray-400 truncate">{agent.model}</div>
        </div>

        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Current task */}
      {agent.task && agent.status !== "idle" && (
        <div className="px-4 py-2 text-xs text-gray-400 bg-[#111827] border-b border-gray-800 shrink-0 flex items-center gap-2">
          <Zap size={11} style={{ color: statusColor }} />
          <span className="truncate">{agent.task}</span>
        </div>
      )}

      {/* Activity log */}
      <div
        ref={logRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-1 font-mono text-[11px] text-gray-400"
        style={{ minHeight: 80 }}
      >
        {log.length === 0 ? (
          <div className="text-gray-600 italic">No activity yet…</div>
        ) : (
          log.map((entry, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-gray-600 shrink-0">
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className="text-gray-300 break-all">{entry.message}</span>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div
        className="px-3 py-2 shrink-0 flex gap-2 items-end border-t border-gray-800"
        style={{ background: "#111827" }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={`Message ${agent.name}…`}
          rows={2}
          className="flex-1 bg-transparent text-xs text-white resize-none outline-none placeholder-gray-600 leading-relaxed"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="shrink-0 p-1.5 rounded transition-colors disabled:opacity-30"
          style={{ background: agent.color + "33", color: agent.color }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

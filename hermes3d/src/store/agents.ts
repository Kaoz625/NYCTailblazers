"use client";

import { create } from "zustand";
import type { Agent, AgentStatus, GatewayMessage } from "@/lib/types";

// Must match DESK_POSITIONS in OfficeScene.tsx (index = deskIndex in agents-config)
const DESK_POSITIONS: Array<{ x: number; y: number; z: number }> = [
  { x: -4,   y: 0, z: -2 },   // 0
  { x: -1.5, y: 0, z: -2 },   // 1
  { x:  1.5, y: 0, z: -2 },   // 2
  { x:  4,   y: 0, z: -2 },   // 3
  { x: -4,   y: 0, z:  1.5 }, // 4
  { x: -1.5, y: 0, z:  1.5 }, // 5
  { x:  1.5, y: 0, z:  1.5 }, // 6
  { x:  4,   y: 0, z:  1.5 }, // 7
];

function assignPosition(deskIndex: number | undefined, fallbackIndex: number) {
  const idx = deskIndex ?? fallbackIndex;
  return DESK_POSITIONS[idx % DESK_POSITIONS.length];
}

// ── Store types ───────────────────────────────────────────────────────────

interface AgentStore {
  agents: Record<string, Agent>;
  connected: boolean;
  activityLog: Array<{ agentId: string; message: string; timestamp: string }>;

  // Actions
  setConnected: (v: boolean) => void;
  handleGatewayMessage: (msg: GatewayMessage) => void;
  clearLog: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: {},
  connected: false,
  activityLog: [],

  setConnected: (v) => set({ connected: v }),

  handleGatewayMessage: (msg: GatewayMessage) => {
    set((state) => {
      const agents = { ...state.agents };
      const log = state.activityLog;

      switch (msg.type) {
        case "agent_registered": {
          if (!msg.agentId) break;
          const fallback = Object.keys(agents).length;
          agents[msg.agentId] = {
            id: msg.agentId,
            name: msg.agentName ?? msg.agentId,
            model: msg.model ?? "unknown",
            status: "idle",
            lastActiveAt: msg.timestamp,
            position: assignPosition(msg.deskIndex, fallback),
            color: msg.color ?? "#e040fb",
          };
          break;
        }

        case "agent_status": {
          if (!msg.agentId) break;
          const existing = agents[msg.agentId];
          if (existing) {
            agents[msg.agentId] = {
              ...existing,
              status: (msg.status as AgentStatus) ?? existing.status,
              task: msg.task ?? existing.task,
              lastActiveAt: msg.timestamp,
            };
          } else {
            // Auto-register unknown agent
            const fallback = Object.keys(agents).length;
            agents[msg.agentId] = {
              id: msg.agentId,
              name: msg.agentName ?? msg.agentId,
              model: msg.model ?? "unknown",
              status: (msg.status as AgentStatus) ?? "idle",
              task: msg.task,
              lastActiveAt: msg.timestamp,
              position: assignPosition(msg.deskIndex, fallback),
              color: msg.color ?? "#e040fb",
            };
          }
          break;
        }

        case "agent_message": {
          if (!msg.agentId) break;
          const existing = agents[msg.agentId];
          if (existing) {
            agents[msg.agentId] = {
              ...existing,
              lastMessage: msg.message,
              lastActiveAt: msg.timestamp,
            };
          }
          return {
            agents,
            activityLog: [
              { agentId: msg.agentId, message: msg.message ?? "", timestamp: msg.timestamp },
              ...log,
            ].slice(0, 200),
          };
        }

        case "agent_done": {
          if (!msg.agentId) break;
          const existing = agents[msg.agentId];
          if (existing) {
            agents[msg.agentId] = {
              ...existing,
              status: "done",
              lastMessage: msg.message,
              lastActiveAt: msg.timestamp,
            };
          }
          break;
        }

        case "agent_error": {
          if (!msg.agentId) break;
          const existing = agents[msg.agentId];
          if (existing) {
            agents[msg.agentId] = {
              ...existing,
              status: "error",
              lastMessage: msg.message,
              lastActiveAt: msg.timestamp,
            };
          }
          break;
        }

        default:
          break;
      }

      return { agents };
    });

    // Log activity for messages and status changes
    if (
      msg.type === "agent_message" ||
      msg.type === "agent_done" ||
      msg.type === "agent_error"
    ) {
      // already handled inline above for messages
    }
  },

  clearLog: () => set({ activityLog: [] }),
}));

// ── Selectors ─────────────────────────────────────────────────────────────

export function selectAgentList(state: AgentStore): Agent[] {
  return Object.values(state.agents);
}

export function selectAgentById(id: string) {
  return (state: AgentStore) => state.agents[id];
}

export const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "#9e9e9e",
  thinking: "#ffeb3b",
  working: "#4caf50",
  done: "#2196f3",
  error: "#f44336",
};

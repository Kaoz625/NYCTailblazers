// ── Agent status ──────────────────────────────────────────────────────────

export type AgentStatus = "idle" | "thinking" | "working" | "done" | "error";

export interface AgentPosition {
  x: number;
  y: number;
  z: number;
}

export interface Agent {
  id: string;
  name: string;
  model: string;
  status: AgentStatus;
  task?: string;
  lastMessage?: string;
  /** ISO timestamp of last activity */
  lastActiveAt: string;
  position: AgentPosition;
  /** Accent color hex for avatar */
  color: string;
}

// ── Gateway protocol messages ─────────────────────────────────────────────

export type GatewayMessageType =
  | "agent_registered"
  | "agent_status"
  | "agent_message"
  | "agent_task"
  | "agent_done"
  | "agent_error"
  | "ping"
  | "pong";

export interface GatewayMessage {
  type: GatewayMessageType;
  agentId?: string;
  agentName?: string;
  model?: string;
  status?: AgentStatus;
  message?: string;
  /** User prompt sent TO an agent (chat input) */
  prompt?: string;
  task?: string;
  /** Desk slot index from agents-config */
  deskIndex?: number;
  /** Agent accent color */
  color?: string;
  /** Agent role label */
  role?: string;
  timestamp: string;
}

// ── Hermes API types ──────────────────────────────────────────────────────

export interface HermesMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface HermesChatRequest {
  model: string;
  messages: HermesMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface HermesChatChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

// ── Office environment ────────────────────────────────────────────────────

export interface OfficeConfig {
  name: string;
  wallColor: string;
  floorColor: string;
  accentColor: string;
}

export const DEFAULT_OFFICE_CONFIG: OfficeConfig = {
  name: "Hermes HQ",
  wallColor: "#1a1a2e",
  floorColor: "#16213e",
  accentColor: "#0f3460",
};

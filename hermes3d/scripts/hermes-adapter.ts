#!/usr/bin/env tsx
/**
 * hermes-adapter.ts
 *
 * Bridges NousResearch Hermes Agent (https://github.com/nousresearch/hermes-agent)
 * to the 3D office gateway WebSocket protocol.
 *
 * Hermes Agent exposes an OpenAI-compatible API at HERMES_API_URL (default: localhost:8642).
 * Each of the 7 agent profiles is spawned as a Hermes subagent with its own skills and
 * system prompt. Chat messages sent to an agent are routed through that agent's context.
 *
 * Usage:
 *   npm run hermes-adapter
 *
 * Prerequisites:
 *   1. Install Hermes Agent:
 *      curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
 *   2. Start Hermes Agent server:
 *      hermes serve  (or configure via `hermes setup`)
 *   3. Set env vars (copy .env.example -> .env.local)
 *   4. npm run hermes-adapter
 */

import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { HERMES_AGENTS, getProfile } from "../src/lib/agents-config";

// ── Config ─────────────────────────────────────────────────────────────────

const HERMES_API_URL = process.env.HERMES_API_URL ?? "http://localhost:8642";
const HERMES_API_KEY = process.env.HERMES_API_KEY ?? "";
const ADAPTER_PORT = parseInt(process.env.HERMES_ADAPTER_PORT ?? "18789", 10);

// Active conversation histories per agent (simple in-memory context window)
const conversationHistory = new Map<
  string,
  Array<{ role: "system" | "user" | "assistant"; content: string }>
>();

// ── Helpers ────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString();
}

function broadcast(clients: Set<WebSocket>, payload: object) {
  const msg = JSON.stringify(payload);
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  }
}

function getHistory(agentId: string) {
  if (!conversationHistory.has(agentId)) {
    const profile = getProfile(agentId);
    conversationHistory.set(agentId, [
      { role: "system", content: profile?.systemPrompt ?? "You are a helpful Hermes agent." },
    ]);
  }
  return conversationHistory.get(agentId)!;
}

// ── HTTP server (health check) ─────────────────────────────────────────────

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      adapter: "hermes-agent",
      hermesApi: HERMES_API_URL,
      agents: HERMES_AGENTS.map((a) => ({
        id: a.id,
        name: a.name,
        subagentName: a.subagentName,
        skills: a.skills,
      })),
      status: "running",
    })
  );
});

// ── Gateway WebSocket server ───────────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("[adapter] Studio connected");

  // Register all 7 Hermes Agent subagents
  for (const agent of HERMES_AGENTS) {
    ws.send(
      JSON.stringify({
        type: "agent_registered",
        agentId: agent.id,
        agentName: agent.name,
        subagentName: agent.subagentName,
        role: agent.role,
        model: `hermes-agent/${agent.subagentName}`,
        color: agent.color,
        deskIndex: agent.deskIndex,
        skills: agent.skills,
        gateways: agent.gateways ?? [],
        timestamp: ts(),
      })
    );
  }

  ws.on("message", async (raw) => {
    let msg: { type?: string; agentId?: string; prompt?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", timestamp: ts() }));
      return;
    }

    if (msg.type === "chat" && msg.prompt) {
      const targetId = msg.agentId;
      if (targetId) {
        await runAgentChat(targetId, msg.prompt, wss.clients);
      } else {
        // Default to PM for coordination tasks
        await runAgentChat("hermes-pm", msg.prompt, wss.clients);
      }
    }

    // Allow PM to spawn subagents for complex tasks
    if (msg.type === "spawn" && msg.agentId && msg.prompt) {
      await runAgentChat(msg.agentId, msg.prompt, wss.clients);
    }
  });

  ws.on("close", () => console.log("[adapter] Studio disconnected"));
});

// ── Streaming chat via Hermes Agent API ───────────────────────────────────

async function runAgentChat(agentId: string, userPrompt: string, clients: Set<WebSocket>) {
  const profile = getProfile(agentId);
  if (!profile) return;

  const history = getHistory(agentId);
  history.push({ role: "user", content: userPrompt });

  broadcast(clients, {
    type: "agent_status",
    agentId: profile.id,
    agentName: profile.name,
    status: "thinking",
    task: userPrompt.slice(0, 120),
    timestamp: ts(),
  });

  const body = JSON.stringify({
    // Hermes Agent uses OpenAI-compatible /v1/chat/completions
    model: process.env.HERMES_MODEL ?? "hermes-3",
    messages: history,
    stream: true,
    temperature: 0.7,
    max_tokens: 2048,
    // Pass agent metadata as extra params (Hermes Agent extensions)
    user: profile.subagentName,
  });

  const url = new URL("/v1/chat/completions", HERMES_API_URL);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (HERMES_API_KEY) headers["Authorization"] = `Bearer ${HERMES_API_KEY}`;

  broadcast(clients, {
    type: "agent_status",
    agentId: profile.id,
    agentName: profile.name,
    status: "working",
    timestamp: ts(),
  });

  let fullText = "";

  try {
    const res = await fetch(url.toString(), { method: "POST", headers, body });

    if (!res.ok || !res.body) {
      throw new Error(`Hermes Agent API error: ${res.status} ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const content: string = parsed.choices?.[0]?.delta?.content ?? "";
          if (content) {
            fullText += content;
            broadcast(clients, {
              type: "agent_message",
              agentId: profile.id,
              agentName: profile.name,
              message: content,
              timestamp: ts(),
            });
          }
          // Check if Hermes Agent is spawning a subagent
          const toolCall = parsed.choices?.[0]?.delta?.tool_calls?.[0];
          if (toolCall?.function?.name === "spawn_subagent") {
            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}");
              broadcast(clients, {
                type: "agent_spawning",
                agentId: profile.id,
                agentName: profile.name,
                targetAgent: args.name,
                task: args.task,
                timestamp: ts(),
              });
            } catch {
              // ignore parse errors
            }
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    // Persist assistant response to conversation history
    if (fullText) {
      history.push({ role: "assistant", content: fullText });
      // Keep context window bounded (system + last 20 turns)
      if (history.length > 22) {
        history.splice(1, history.length - 22);
      }
    }

    broadcast(clients, {
      type: "agent_done",
      agentId: profile.id,
      agentName: profile.name,
      message: fullText,
      status: "idle",
      timestamp: ts(),
    });
  } catch (err) {
    console.error(`[adapter] Error for ${profile.name}:`, err);
    broadcast(clients, {
      type: "agent_error",
      agentId: profile.id,
      agentName: profile.name,
      message: String(err),
      status: "error",
      timestamp: ts(),
    });
  }
}

// ── Idle heartbeats ────────────────────────────────────────────────────────

setInterval(() => {
  for (const agent of HERMES_AGENTS) {
    broadcast(wss.clients, {
      type: "agent_status",
      agentId: agent.id,
      agentName: agent.name,
      status: "idle",
      timestamp: ts(),
    });
  }
}, 15_000);

// ── Start ──────────────────────────────────────────────────────────────────

server.listen(ADAPTER_PORT, () => {
  console.log(`\n🟣  Hermes Agent Adapter (NousResearch)`);
  console.log(`   Gateway WebSocket : ws://localhost:${ADAPTER_PORT}`);
  console.log(`   Hermes Agent API  : ${HERMES_API_URL}`);
  console.log(`   Subagents (${HERMES_AGENTS.length})     : ${HERMES_AGENTS.map((a) => a.subagentName).join(", ")}\n`);
  console.log(`Prereqs:`);
  console.log(`  1. curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash`);
  console.log(`  2. hermes serve`);
  console.log(`  3. Set NEXT_PUBLIC_GATEWAY_URL=ws://localhost:${ADAPTER_PORT} in .env.local\n`);
});

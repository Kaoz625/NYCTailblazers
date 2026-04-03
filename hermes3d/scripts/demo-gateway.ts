#!/usr/bin/env tsx
/**
 * demo-gateway.ts
 *
 * Simulates all 7 Hermes agents locally — no real API needed.
 * Fires random status events so the 3D office springs to life immediately.
 *
 * Usage:
 *   npm run demo-gateway
 */

import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { HERMES_AGENTS } from "../src/lib/agents-config";

const ADAPTER_PORT = parseInt(process.env.HERMES_ADAPTER_PORT ?? "18789", 10);

const TASKS = [
  "Reviewing pull request #42",
  "Drafting technical specification",
  "Analysing test coverage gaps",
  "Summarising standup notes",
  "Refactoring authentication module",
  "Writing unit tests for gateway client",
  "Researching vector DB options",
  "Optimising system prompt templates",
  "Planning sprint backlog",
  "Checking CI/CD pipeline health",
  "Updating infrastructure configs",
  "Coordinating between teams",
];

const DEMO_MESSAGES = [
  "I've analysed the codebase and have three recommendations.",
  "Tests are passing. Coverage is at 87%.",
  "The architecture looks solid. One concern: the gateway timeout is too low.",
  "PR review done — two blocking issues, see comments.",
  "Deployment pipeline updated. Zero-downtime rollout ready.",
  "Blocked on missing API spec. Pinging Architect now.",
  "Sprint plan drafted. 14 story points across 5 epics.",
  "Found 3 similar implementations we can consolidate.",
];

const STATUSES = ["idle", "thinking", "working", "done"] as const;

function ts() {
  return new Date().toISOString();
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function broadcast(clients: Set<WebSocket>, payload: object) {
  const msg = JSON.stringify(payload);
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  }
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ adapter: "demo", agents: HERMES_AGENTS.length, status: "running" }));
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("[demo] Studio connected");

  // Register all 7 agents
  for (const agent of HERMES_AGENTS) {
    ws.send(
      JSON.stringify({
        type: "agent_registered",
        agentId: agent.id,
        agentName: agent.name,
        model: agent.model,
        role: agent.role,
        color: agent.color,
        deskIndex: agent.deskIndex,
        timestamp: ts(),
      })
    );
  }

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", timestamp: ts() }));
      }
    } catch {
      // ignore
    }
  });

  ws.on("close", () => console.log("[demo] Studio disconnected"));
});

// Random status events every 2.5s
setInterval(() => {
  const agent = rand(HERMES_AGENTS);
  const status = rand(STATUSES);
  const payload: Record<string, unknown> = {
    type: "agent_status",
    agentId: agent.id,
    agentName: agent.name,
    status,
    timestamp: ts(),
  };
  if (status === "working" || status === "thinking") {
    payload.task = rand(TASKS);
  }
  broadcast(wss.clients, payload);
}, 2500);

// Demo messages every 4s
setInterval(() => {
  const agent = rand(HERMES_AGENTS);
  broadcast(wss.clients, {
    type: "agent_message",
    agentId: agent.id,
    agentName: agent.name,
    message: rand(DEMO_MESSAGES),
    timestamp: ts(),
  });
}, 4000);

server.listen(ADAPTER_PORT, () => {
  console.log(`\n🟢  Demo Gateway running on ws://localhost:${ADAPTER_PORT}`);
  console.log(
    `   ${HERMES_AGENTS.length} agents: ${HERMES_AGENTS.map((a) => a.name).join(", ")}\n`
  );
  console.log(`Set NEXT_PUBLIC_GATEWAY_URL=ws://localhost:${ADAPTER_PORT} in your .env\n`);
});

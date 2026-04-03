# Hermes Office — 3D Visualization for Hermes Agent

A retro 3D office workspace for watching your [NousResearch Hermes Agent](https://github.com/nousresearch/hermes-agent) team work in real time.

Built on the [Claw3D](https://github.com/iamlukethedev/Claw3D) concept, but wired entirely to Hermes Agent rather than OpenClaw.

---

## What it does

- Renders 7 Hermes Agent subagents as animated avatars sitting at desks in a 3D office
- Shows real-time status (thinking → working → done) with glowing rings and animations
- Live activity feed and per-agent chat panel
- Broadcast tasks to PM who coordinates the full team
- Connects to Hermes Agent's OpenAI-compatible API at `localhost:8642`

---

## The 7 Agents

| Name       | Role                              | Skills                                      |
|------------|-----------------------------------|---------------------------------------------|
| Architect  | System design & planning          | file_read, file_write, search_web           |
| Coder      | Code generation & refactoring     | file_read, file_write, run_command, git     |
| Reviewer   | Code review & QA                  | file_read, search_code, git                 |
| Researcher | Knowledge retrieval & synthesis   | search_web, fetch_url, search_memory        |
| Tester     | Test generation & validation      | file_read, file_write, run_command          |
| DevOps     | Infrastructure & deployment       | run_command, file_write, git                |
| PM         | Project coordination              | create_document, search_memory, file_write  |

---

## Quick start

### 1. Install and start Hermes Agent

```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
source ~/.bashrc
hermes setup   # configure your model / API key
hermes serve   # starts API at localhost:8642
```

### 2. Configure the studio

```bash
cd hermes3d
cp .env.example .env.local
# Edit .env.local — at minimum set:
#   HERMES_API_URL=http://localhost:8642
#   HERMES_API_KEY=<your key if needed>
```

### 3. Start the Hermes adapter (gateway)

```bash
npm install
npm run hermes-adapter
# Starts WebSocket gateway on ws://localhost:18789
```

### 4. Start the 3D studio

```bash
npm run dev
# Open http://localhost:3000
```

---

## Demo mode (no Hermes Agent needed)

```bash
npm run demo-gateway   # simulates all 7 agents with random events
npm run dev
```

---

## Architecture

```
Browser (3D office)
    │  WebSocket (ws://localhost:18789)
    ▼
hermes-adapter.ts  ←── manages 7 agent contexts
    │  HTTP POST /v1/chat/completions (SSE stream)
    ▼
Hermes Agent API (localhost:8642)
    │
    ▼
NousResearch Hermes model
```

### Key files

```
hermes3d/
├── scripts/
│   ├── hermes-adapter.ts   # Gateway adapter (run this first)
│   └── demo-gateway.ts     # Demo mode, no Hermes needed
├── src/
│   ├── lib/
│   │   ├── agents-config.ts  # 7 agent profiles + system prompts
│   │   ├── gateway-client.ts # Browser WebSocket client
│   │   └── types.ts          # Shared TypeScript types
│   ├── store/
│   │   └── agents.ts         # Zustand state (agent status, log)
│   ├── components/
│   │   ├── OfficeScene.tsx   # Three.js / React Three Fiber scene
│   │   ├── OfficeFloor.tsx   # Floor, walls, desks geometry
│   │   ├── AgentAvatar.tsx   # Animated per-agent 3D avatar
│   │   ├── HUD.tsx           # Heads-up display overlay
│   │   └── AgentPanel.tsx    # Per-agent detail + chat panel
│   └── app/
│       ├── layout.tsx
│       ├── page.tsx           # Redirects → /office
│       └── office/page.tsx   # Main office view
└── .env.example
```

---

## Environment variables

See [`.env.example`](.env.example) for the full list.

| Variable | Default | Description |
|---|---|---|
| `HERMES_API_URL` | `http://localhost:8642` | Hermes Agent API URL |
| `HERMES_API_KEY` | — | API key (if required) |
| `HERMES_MODEL` | `hermes-3` | Model name passed to Hermes Agent |
| `HERMES_ADAPTER_PORT` | `18789` | Gateway WebSocket port |
| `NEXT_PUBLIC_GATEWAY_URL` | `ws://localhost:18789` | Browser gateway URL |

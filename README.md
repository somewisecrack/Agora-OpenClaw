# Agora — Multi-Agent Debate System for OpenClaw

A structured multi-agent advisory system built on [OpenClaw](https://openclaw.ai) v2026.5.2.  
Two AI agents — **Socrates** (GPT-5.5) and **Plato** (Gemini 3.1 Flash) — engage in a structured debate before delivering a synthesised advisory to the user.

## Architecture

```
User Question
     │
     ▼
┌─────────────┐    sessions_spawn     ┌─────────────┐
│  Socrates   │ ────────────────────► │    Plato    │
│  (Master)   │                       │ (Disciple)  │
│  GPT-5.5    │ ◄──── auto-announce ──│ Gemini 3.1  │
│             │       (push-based)    │   Flash     │
└─────────────┘                       └─────────────┘
     │
     ▼
🏛️ AGORA ADVISORY
```

### How It Works

1. **User asks Socrates a question** via the OpenClaw chat UI
2. **Socrates frames** an initial position internally
3. **Socrates spawns a Plato subagent session** via `sessions_spawn` with `agentId: "plato"`
4. **Socrates yields** his turn via `sessions_yield` and waits
5. **Plato receives** Socrates' framing and the user's question
6. **Plato challenges** Socrates' position (3–5 sentences, identifies weaknesses/risks/hidden assumptions)
7. **Gateway pushes** Plato's completed response back to Socrates
8. **Socrates synthesises** the debate into a final `🏛️ AGORA ADVISORY` for the user

## File Structure

```
agora-openclaw/
├── openclaw.json                     # Main gateway configuration
├── workspace-socrates/               # Socrates' workspace
│   ├── AGENTS.md                     # Debate protocol instructions
│   ├── IDENTITY.md                   # Agent identity
│   ├── SOUL.md                       # Personality & character
│   ├── TOOLS.md                      # Tool usage guidelines
│   ├── USER.md                       # User context
│   ├── HEARTBEAT.md                  # Heartbeat config
│   └── skills/agora/SKILL.md         # Agora skill definition
└── workspace-plato/                  # Plato's workspace
    ├── AGENTS.md                     # Standing orders (critical analysis)
    ├── IDENTITY.md                   # Agent identity
    ├── SOUL.md                       # Personality & character
    ├── TOOLS.md                      # Tool usage guidelines
    ├── USER.md                       # User context
    └── HEARTBEAT.md                  # Heartbeat config
```

## Setup

### Prerequisites

- [OpenClaw](https://openclaw.ai) v2026.5.2+ installed locally
- OpenAI API key (for Socrates / GPT-5.5)
- Google AI API key (for Plato / Gemini 3.1 Flash)

### Installation

1. Clone this repo:
   ```bash
   git clone https://github.com/somewisecrack/agora-openclaw.git
   ```

2. Copy workspace files to your OpenClaw config directory:
   ```bash
   cp -r workspace-socrates ~/.openclaw/workspace-socrates
   cp -r workspace-plato ~/.openclaw/workspace-plato
   ```

3. Merge `openclaw.json` into your existing `~/.openclaw/openclaw.json`, or replace it entirely if starting fresh. **Replace `<YOUR_TOKEN_HERE>`** with your gateway auth token.

4. Set your API keys in `~/.openclaw/.env`:
   ```bash
   OPENAI_API_KEY=sk-...
   GOOGLE_AI_API_KEY=AI...
   ```

5. Restart the gateway:
   ```bash
   launchctl stop ai.openclaw.gateway
   launchctl start ai.openclaw.gateway
   ```

6. Open the OpenClaw Control UI at `http://127.0.0.1:18789/chat`

## Key Configuration Details

| Setting | Purpose |
|---------|---------|
| `subagents.allowAgents: ["*"]` | Allows Socrates to spawn sessions for any agent (required for cross-agent communication) |
| `tools.agentToAgent.enabled: true` | Enables inter-agent messaging |
| `tools.sessions.visibility: "all"` | Allows agents to read each other's session histories |
| `sessions_yield` in Socrates' tools | Allows Socrates to pause and wait for Plato's push-based response |
| `cleanup: "none"` in AGENTS.md | Preserves Plato's debate session so the user can read it |

## Viewing the Debate

After Socrates delivers his advisory, you can read the full Plato debate:

1. Go to **Sessions** in the left sidebar
2. Check the **Global** checkbox
3. Click the `agent:plato:subagent:...` row (the newest one)
4. You'll see Socrates' framing and Plato's critical response

## Known Limitations

- **Single-round debate**: OpenClaw v2026.5.2 injects a hardcoded `"send that user-facing update now"` instruction when a subagent completes, which forces Socrates to deliver immediately rather than continuing the debate for multiple rounds. Multi-round debates would require a framework-level change.
- **No `exec` tool**: Disabled for Socrates to prevent SSL certificate errors on macOS. Agents rely on internal knowledge only.

## License

MIT

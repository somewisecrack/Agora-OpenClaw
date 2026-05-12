# Agora — Multi-Agent Debate System for OpenClaw

A structured multi-agent advisory system built on [OpenClaw](https://openclaw.ai) v2026.5.2+.  
Two AI agents — **Socrates** as the master advisor and **Plato** as the analytical challenger — engage in a structured debate before delivering a synthesised advisory to the user. The checked-in config uses GPT-5.5 for both agents, but the pattern is model-agnostic: you can swap either agent to another OpenClaw-supported model.

## Architecture

```
User Question
     │
     ▼
┌─────────────┐    sessions_spawn     ┌─────────────┐
│  Socrates   │ ────────────────────► │    Plato    │
│  (Master)   │                       │ (Disciple)  │
│ configurable│ ◄──── auto-announce ──│ configurable│
│             │       (push-based)    │             │
└─────────────┘                       └─────────────┘
     │
     ▼
🏛️ AGORA ADVISORY
```

### How It Works

1. **User asks Socrates a question** via the OpenClaw chat UI
2. **Socrates frames** an initial position internally
3. **Socrates spawns a Plato subagent session** via `sessions_spawn` with `agentId: "plato"`
4. **Socrates yields** his turn via `sessions_yield` and waits for the initial Plato response
5. **Plato receives** Socrates' framing and the user's question
6. **Plato challenges** Socrates' position (3–5 sentences, identifies weaknesses/risks/hidden assumptions)
7. **Gateway pushes** Plato's completed response back to Socrates
8. **Socrates starts a fresh Plato round** via `sessions_spawn` whenever Plato has not signalled `[CONSENSUS]`, carrying the visible transcript forward in the task
9. **The exchange repeats** until Plato explicitly signals `[CONSENSUS]`
10. **Socrates prints the Socrates ↔ Plato exchange in the same chat**, then synthesises it into a final `🏛️ AGORA ADVISORY`

### Document Attachments

When a user attaches a document or media file, OpenClaw first extracts readable context into Socrates' incoming message. Plato's spawned sessions do not automatically inherit the original upload, so Socrates must include a `Document Context` section in every Plato `sessions_spawn` task. That context should contain the attachment name, the user's question, and the relevant extracted text, excerpt, or faithful digest.

If Socrates can tell that a file was attached but cannot see readable extracted content, the protocol instructs Socrates to stop and return an Agora config error instead of letting Plato debate blind.

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
- API keys for whichever model providers you configure for Socrates and Plato

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

4. Set the API keys required by your chosen providers in `~/.openclaw/.env`. For example:
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
| `sessions_yield` in Socrates' tools | Allows Socrates to pause after each Plato round and wait for the push-based response |
| `cleanup: "keep"` in AGENTS.md | Preserves Plato's debate session so the user can read it |

## Choosing Models

The default `openclaw.json` is only a starting point. To try different models, change the `model` field for either agent:

```json
{
  "id": "socrates",
  "model": "openai/gpt-5.5"
}
```

```json
{
  "id": "plato",
  "model": "openai/gpt-5.5"
}
```

You can run both roles on the same model, split them across providers, or use a cheaper/faster model for Plato. For best results, Socrates should be strong at synthesis and instruction-following, while Plato should be strong at critique and disagreement.

## Viewing the Debate

The default user-facing answer includes a compact transcript in the same Socrates chat:

```text
🏛️ AGORA EXCHANGE

Round 1
Socrates: ...
Plato: ...

Round N
Socrates: ...
Plato: ... [CONSENSUS]

🏛️ AGORA ADVISORY
...
```

The Plato subagent session is still preserved for debugging, but users should not need to open the Sessions sidebar to verify that Plato responded.

## Known Limitations

- **Consensus is the stop condition**: Socrates is instructed to ignore OpenClaw's automatic `"send that user-facing update now"` nudge after subagent completion and continue messaging Plato until Plato explicitly signals `[CONSENSUS]`. There is no fixed round count and no expected Round 2 ending.
- **Fresh spawned rounds**: Socrates uses a fresh `sessions_spawn` for each Plato round instead of `sessions_send` follow-ups. The full visible transcript is included in each new task so Plato has context, and each round is independently auditable.
- **Visible same-chat exchange**: Socrates must include the actual round-by-round Socrates and Plato turns before the advisory, so the debate is visible without opening the subagent session.
- **Attachments are forwarded as context**: Plato does not automatically receive the original uploaded file. Socrates forwards extracted document/media context in the spawned task for each round.
- **No `exec` tool**: Disabled for Socrates to prevent SSL certificate errors on macOS. Agents rely on internal knowledge only.

## License

MIT

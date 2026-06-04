# Agora — Multi-Agent Debate System

A structured multi-agent advisory system. Two AI agents — **Socrates** as the master advisor and **Plato** as the analytical challenger — debate a question before delivering a synthesised advisory to the user. The checked-in configuration is model-agnostic: you can run both roles on the same model, split them across providers, or swap either role to another supported model.

## Architecture

```
User Question
     │
     ▼
┌─────────────┐    debate round       ┌─────────────┐
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

Agora supports two runtime paths:

- `agora-telegram-bot.mjs`: a direct Telegram bot that runs the Socrates ↔ Plato debate loop in-process. This is the recommended path for a constantly available mobile bot because it does not depend on subagent resume events.
- `openclaw.json` + workspace files: an OpenClaw-native setup where Socrates uses `sessions_spawn`/`sessions_yield` to consult Plato. This remains useful for local experimentation and debugging.

### Direct Telegram Flow

1. **User sends a Telegram DM** to the bot
2. **Socrates frames** an initial position
3. **Plato challenges** Socrates' position
4. **Socrates revises** and sends the revision back to Plato
5. **The exchange repeats** until Plato explicitly signals `[CONSENSUS]`
6. **The bot prints the Socrates ↔ Plato exchange in the same Telegram chat**, then sends the final `🏛️ AGORA ADVISORY`

### OpenClaw Flow

1. **User asks Socrates a question** via an OpenClaw channel or chat UI
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

The direct Telegram bot forwards supported Telegram document/image attachments to Gemini as inline input, so both Socrates and Plato can evaluate the attached evidence in each round. Very large files may need to be split or sent as smaller scans because Telegram bot downloads have size limits.

In the OpenClaw-native path, OpenClaw first extracts readable context into Socrates' incoming message. Plato's spawned sessions do not automatically inherit the original upload, so Socrates must include a `Document Context` section in every Plato `sessions_spawn` task. That context should contain the attachment name, the user's question, and the relevant extracted text, excerpt, or faithful digest.

If Socrates can tell that a file was attached but cannot see readable extracted content, the protocol instructs Socrates to stop and return an Agora config error instead of letting Plato debate blind.

## File Structure

```
agora-openclaw/
├── openclaw.json                     # Main gateway configuration
├── agora-telegram-bot.mjs            # Direct Telegram debate loop
├── agora-telegram-bot.service        # systemd unit for the direct bot
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

- Node.js 20+ for the direct Telegram bot
- A Telegram bot token
- API keys for whichever model providers you configure for Socrates and Plato
- Optional: [OpenClaw](https://openclaw.ai) v2026.5.2+ for the OpenClaw-native path

### Installation

1. Clone this repo:
   ```bash
   git clone https://github.com/somewisecrack/agora-openclaw.git
   ```

2. For the direct Telegram bot, set the runtime values in your shell or service environment:
   ```bash
   TELEGRAM_BOT_TOKEN=...
   GOOGLE_AI_API_KEY=...
   AGORA_ALLOWED_CHATS=123456789
   ```

3. Run the bot:
   ```bash
   node agora-telegram-bot.mjs
   ```

4. For the OpenClaw-native path, copy workspace files to your OpenClaw config directory:
   ```bash
   cp -r workspace-socrates ~/.openclaw/workspace-socrates
   cp -r workspace-plato ~/.openclaw/workspace-plato
   ```

5. Merge `openclaw.json` into your existing `~/.openclaw/openclaw.json`, or replace it entirely if starting fresh. **Replace `<YOUR_TOKEN_HERE>`** with your gateway auth token.

6. Set the API keys required by your chosen providers in `~/.openclaw/.env`. For example:
   ```bash
   OPENAI_API_KEY=sk-...
   GOOGLE_AI_API_KEY=AI...
   ```

7. Restart the gateway:
   ```bash
   launchctl stop ai.openclaw.gateway
   launchctl start ai.openclaw.gateway
   ```

8. Open the OpenClaw Control UI at `http://127.0.0.1:18789/chat`

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
{ "id": "socrates", "model": "provider/model-name" }
```

```json
{ "id": "plato", "model": "provider/model-name" }
```

You can run both roles on the same model, split them across providers, or use a cheaper/faster model for Plato. For best results, Socrates should be strong at synthesis and instruction-following, while Plato should be strong at critique and disagreement.

## Viewing the Debate

The default user-facing answer includes a compact transcript in the same Socrates chat:

```text
🏛️ AGORA EXCHANGE

Round 1
🟡 Socrates: ...
🟣 Plato: ...

Round N
🟡 Socrates: ...
🟣 Plato: ... [CONSENSUS]

🏛️ AGORA ADVISORY
...
```

The Plato subagent session is still preserved for debugging, but users should not need to open the Sessions sidebar to verify that Plato responded.

## Known Limitations

- **Consensus is the stop condition**: Socrates is instructed to ignore OpenClaw's automatic `"send that user-facing update now"` nudge after subagent completion and continue messaging Plato until Plato explicitly signals `[CONSENSUS]`. There is no fixed round count and no expected Round 2 ending.
- **Fresh spawned rounds**: Socrates uses a fresh `sessions_spawn` for each Plato round instead of `sessions_send` follow-ups. The full visible transcript is included in each new task so Plato has context, and each round is independently auditable.
- **Visible same-chat exchange**: Socrates must include the actual round-by-round Socrates and Plato turns before the advisory, so the debate is visible without opening the subagent session.
- **Long debates are compressed, not hidden**: if a debate runs many rounds, Socrates should summarize each round compactly in `AGORA EXCHANGE`; it must not drop the exchange and send only the advisory.
- **Attachments are forwarded as context**: Plato does not automatically receive the original uploaded file. Socrates forwards extracted document/media context in the spawned task for each round.
- **No `exec` tool**: Disabled for Socrates to prevent SSL certificate errors on macOS. Agents rely on internal knowledge only.

## License

MIT

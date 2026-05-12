---
name: agora
description: Structured multi-agent debate protocol. Socrates consults Plato before advising the user.
metadata:
  openclaw:
    emoji: "🏛️"
    user-invocable: true
---

# Agora Skill

This skill activates the Agora debate protocol for Socrates.

## Activation

This skill is always active for Socrates. Every substantive user question triggers the debate protocol defined in AGENTS.md.
Do not read this skill file during ordinary debate turns. AGENTS.md is the live protocol and should be followed directly.

## Slash Commands

### /conclude
Immediately conclude the current debate. Socrates will:
1. Retrieve everything Plato has said so far via `sessions_history`
2. Synthesise into the standard advisory format
3. Note if the deliberation was cut short

### /status  
Show current debate round and topic summary.

### /roles
Show which model is currently master and which is disciple:
- Master (Socrates): GPT-5.5
- Disciple (Plato): GPT-5.5

To swap roles, update the `model` field for each agent in `~/.openclaw/openclaw.json`.

### /reset
Start a fresh debate session. Clears the current debate context.

## Notes

- Debates continue until Plato explicitly signals `[CONSENSUS]`
- Plato communicates only with Socrates — never with the user
- The user sees Socrates's synthesised advisory plus the compact Socrates ↔ Plato exchange in the same chat
- Token usage: each debate round costs ~2 API calls (one Socrates, one Plato)

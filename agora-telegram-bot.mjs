#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(process.env.HOME || "/root", ".openclaw");
const configPath = process.env.AGORA_CONFIG || path.join(stateDir, "openclaw.json");
const offsetPath = process.env.AGORA_TELEGRAM_OFFSET || path.join(stateDir, "telegram", "agora-direct-offset.json");

loadDotEnv(path.join(stateDir, ".env"));

const config = readJson(configPath);
const telegram = config.channels?.telegram || {};
const botToken = process.env.TELEGRAM_BOT_TOKEN || telegram.botToken || telegram.token;
const googleApiKey =
  process.env.GOOGLE_AI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GEMINI_API_KEY ||
  config.plugins?.entries?.google?.config?.apiKey;

const socratesModel = process.env.AGORA_SOCRATES_MODEL || agentModel("socrates") || "google/gemini-2.5-flash-lite";
const platoModel = process.env.AGORA_PLATO_MODEL || agentModel("plato") || "google/gemini-2.5-flash-lite";
const maxRounds = Number.parseInt(process.env.AGORA_MAX_ROUNDS || "12", 10);
const pollTimeout = Number.parseInt(process.env.AGORA_POLL_TIMEOUT || "50", 10);
const allowedChats = new Set((process.env.AGORA_ALLOWED_CHATS || "").split(",").map((v) => v.trim()).filter(Boolean));

if (!botToken) fail("Telegram bot token not found.");
if (!googleApiKey) fail("Google/Gemini API key not found.");

fs.mkdirSync(path.dirname(offsetPath), { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let offset = readJson(offsetPath, { offset: 0 }).offset || 0;
console.log(`[agora] direct Telegram bot started socrates=${socratesModel} plato=${platoModel}`);

for (;;) {
  try {
    const updates = await telegramApi("getUpdates", {
      offset: offset ? offset + 1 : undefined,
      timeout: pollTimeout,
      allowed_updates: JSON.stringify(["message"]),
    });
    for (const update of updates.result || []) {
      offset = update.update_id;
      writeJson(offsetPath, { offset });
      await handleUpdate(update);
    }
  } catch (error) {
    console.error("[agora] polling failed:", error);
    await sleep(5000);
  }
}

async function handleUpdate(update) {
  const message = update.message;
  if (!message?.chat?.id) return;
  const chatId = String(message.chat.id);
  if (allowedChats.size && !allowedChats.has(chatId)) return;
  if (message.from?.is_bot) return;

  try {
    const text = collectMessageText(message);
    const mediaParts = await collectMediaParts(message);
    if (!text) {
      await sendMessage(chatId, "Send a question with the attachment so Socrates and Plato know what to evaluate.");
      return;
    }

    await sendChatAction(chatId, "typing");
    const result = await runDebate(text, mediaParts);
    await sendLongMessage(chatId, result);
  } catch (error) {
    console.error(`[agora] update ${update.update_id} failed:`, error);
    await sendMessage(chatId, `⚠️ Agora failed: ${cleanError(error.message || String(error))}`);
  }
}

async function runDebate(question, mediaParts = []) {
  const transcript = [];
  let socrates = await complete(socratesModel, socratesPrompt(question, transcript, mediaParts), mediaParts);
  transcript.push({ round: 1, socrates, plato: "" });

  for (let round = 1; round <= maxRounds; round += 1) {
    const plato = await complete(platoModel, platoPrompt(question, transcript, round, mediaParts), mediaParts);
    transcript[transcript.length - 1].plato = plato;

    if (/\[CONSENSUS\]/i.test(plato)) {
      const advisory = await complete(socratesModel, finalPrompt(question, transcript, mediaParts), mediaParts);
      return formatResult(transcript, advisory);
    }

    socrates = await complete(socratesModel, socratesPrompt(question, transcript, mediaParts), mediaParts);
    transcript.push({ round: round + 1, socrates, plato: "" });
  }

  transcript[transcript.length - 1].plato ||= "No consensus within the configured round limit.";
  const advisory = await complete(socratesModel, finalPrompt(question, transcript, mediaParts, true), mediaParts);
  return formatResult(transcript, `${advisory}\n\nConsensus status: unresolved after ${maxRounds} rounds.`);
}

function socratesPrompt(question, transcript, mediaParts = []) {
  const history = formatTranscript(transcript);
  return [
    "You are Socrates, master advisor in Agora.",
    "Produce only the next concise Socrates debate position, 2-4 sentences.",
    "You must revise or defend based on Plato's latest challenge.",
    mediaParts.length ? "The user's attachment is included in this request. Treat it as evidence, not as optional background." : "",
    "Do not write the final advisory yet.",
    "",
    `User question: ${question}`,
    history ? `\nDebate so far:\n${history}` : "",
  ].join("\n");
}

function platoPrompt(question, transcript, round, mediaParts = []) {
  const history = formatTranscript(transcript);
  const firstRound = round === 1
    ? "Challenge this position. Identify what Socrates is missing or getting wrong. Do not signal [CONSENSUS] yet unless truly no material objection remains."
    : "Test this revision against the strongest plausible alternative framing. Raise the strongest remaining material objection. Signal [CONSENSUS] only if no remaining objection would materially change the verdict, recommendation, safety posture, or next action.";
  return [
    "You are Plato, Socrates's analytical challenger in Agora.",
    "Respond in 3-5 sentences. Never address the user.",
    "Do not repeat the same objection unless you can name the concrete material change required.",
    mediaParts.length ? "The user's attachment is included in this request. Evaluate Socrates against both the question and the attachment." : "",
    "",
    `User question: ${question}`,
    `\nDebate so far:\n${history}`,
    "",
    firstRound,
  ].join("\n");
}

function finalPrompt(question, transcript, mediaParts = [], unresolved = false) {
  return [
    "You are Socrates. Synthesize the debate into the final Agora advisory.",
    "Do not repeat the full transcript; it will be printed separately.",
    "Write 1-3 direct conclusion sentences, then 2-4 short bullet points under Reasoning, then Plato noted, then Confidence.",
    mediaParts.length ? "Add a Document basis line naming the attachment type(s) considered." : "",
    unresolved ? "Consensus was not reached. State that plainly and include the unresolved dissent." : "Consensus was reached. State the final answer plainly.",
    "",
    `User question: ${question}`,
    `\nDebate:\n${formatTranscript(transcript)}`,
  ].join("\n");
}

function formatResult(transcript, advisory) {
  return [
    "🏛️ AGORA EXCHANGE",
    "",
    formatTranscript(transcript),
    "",
    "🏛️ AGORA ADVISORY",
    "",
    advisory.trim(),
  ].join("\n");
}

function formatTranscript(transcript) {
  return transcript
    .filter((turn) => turn.socrates || turn.plato)
    .map((turn) => [
      `Round ${turn.round}`,
      `🟡 Socrates: ${clean(turn.socrates)}`,
      turn.plato ? `🟣 Plato: ${clean(turn.plato)}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}

async function complete(modelRef, prompt, mediaParts = []) {
  const model = modelRef.replace(/^google\//, "");
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }, ...mediaParts] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(googleApiKey)}`;
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    if (response.ok) {
      const text = (json.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("").trim();
      if (!text) throw new Error(`Gemini ${model} returned no text.`);
      return text;
    }

    const msg = json.error?.message || `${response.status} ${response.statusText}`;
    lastError = new Error(`Gemini ${model} failed: ${msg}`);
    if (response.status !== 429 || attempt === 6) break;

    const delayMs = quotaRetryDelayMs(json, msg, attempt);
    console.log(`[agora] Gemini quota wait ${Math.round(delayMs / 1000)}s before retry ${attempt + 1}/6`);
    await sleep(delayMs);
  }
  throw lastError;
}

function quotaRetryDelayMs(json, message, attempt) {
  const retryInfo = json.error?.details?.find((item) => item["@type"]?.includes("RetryInfo"));
  const retryDelay = retryInfo?.retryDelay;
  const retrySeconds = typeof retryDelay === "string" ? Number.parseFloat(retryDelay.replace(/s$/, "")) : NaN;
  const messageSeconds = Number.parseFloat(String(message).match(/retry in ([0-9.]+)s/i)?.[1] || "");
  const seconds = Number.isFinite(retrySeconds) ? retrySeconds : Number.isFinite(messageSeconds) ? messageSeconds : 8 * attempt;
  return Math.min(60_000, Math.max(3000, Math.ceil(seconds * 1000) + 1000));
}

function collectMessageText(message) {
  return [message.text, message.caption].filter(Boolean).join("\n").trim();
}

async function collectMediaParts(message) {
  const attachments = [];
  if (message.document?.file_id) {
    attachments.push({
      fileId: message.document.file_id,
      mimeType: message.document.mime_type || "application/octet-stream",
      size: message.document.file_size || 0,
    });
  }
  if (message.photo?.length) {
    const photo = message.photo.at(-1);
    attachments.push({
      fileId: photo.file_id,
      mimeType: "image/jpeg",
      size: photo.file_size || 0,
    });
  }
  if (!attachments.length) return [];

  const parts = [];
  for (const attachment of attachments) {
    if (attachment.size > 20 * 1024 * 1024) {
      throw new Error("Telegram attachment is too large for bot download. Send a smaller scan/image or split the file.");
    }
    const data = await downloadTelegramFile(attachment.fileId);
    parts.push({ inlineData: { mimeType: attachment.mimeType, data: data.toString("base64") } });
  }
  return parts;
}

async function downloadTelegramFile(fileId) {
  const file = await telegramApi("getFile", { file_id: fileId });
  const filePath = file.result?.file_path;
  if (!filePath) throw new Error("Telegram did not return a file path for the attachment.");
  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (!response.ok) throw new Error(`Telegram file download failed: ${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

async function sendLongMessage(chatId, text) {
  const chunks = chunkText(text, 3600);
  for (const chunk of chunks) await sendMessage(chatId, chunk);
}

async function sendMessage(chatId, text) {
  return telegramApi("sendMessage", { chat_id: chatId, text });
}

async function sendChatAction(chatId, action) {
  return telegramApi("sendChatAction", { chat_id: chatId, action });
}

async function telegramApi(method, params) {
  const url = new URL(`https://api.telegram.org/bot${botToken}/${method}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url);
  const json = await response.json();
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description || response.statusText}`);
  return json;
}

function chunkText(text, limit) {
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    let index = remaining.lastIndexOf("\n\n", limit);
    if (index < limit * 0.5) index = remaining.lastIndexOf("\n", limit);
    if (index < limit * 0.5) index = limit;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function agentModel(id) {
  return config.agents?.list?.find((agent) => agent.id === id)?.model || config.agents?.defaults?.model?.primary;
}

function clean(value) {
  return String(value || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?final>/gi, "")
    .trim();
}

function cleanError(value) {
  return String(value)
    .replace(/key=[^&\s]+/gi, "key=<redacted>")
    .slice(0, 800);
}

function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function fail(message) {
  console.error(`[agora] ${message}`);
  process.exit(1);
}

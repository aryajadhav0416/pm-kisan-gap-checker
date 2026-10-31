/**
 * lib/llm.ts
 *
 * Server-side only. Reads provider config from env (never from the client).
 * Supports Gemini (@google/genai), OpenAI, and Groq (groq-sdk).
 * Loads environment variables from the root .env file via dotenv/config.
 * Falls back to data/mock-output.json when MOCK_LLM=true.
 *
 * Rule 4: API keys only in .env / .env.local, only used server-side.
 */

// Load .env (and .env.local if present) before anything else reads process.env
import "dotenv/config";

import fs from "fs";
import path from "path";
import { LlmOutputSchema } from "./schema";
import type { LlmOutput } from "./schema";
import type { LlmMessage } from "./prompt";
import { estimateTokens } from "./excerpts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`[llm] Missing required environment variable: ${name}`);
  return val;
}

function readMock(): LlmOutput {
  const mockPath = path.join(process.cwd(), "data", "mock-output.json");
  const raw = fs.readFileSync(mockPath, "utf-8");
  return LlmOutputSchema.parse(JSON.parse(raw));
}

/**
 * Scrub API keys from error messages while preserving HTTP status codes
 * and enough context to diagnose the problem.
 */
function sanitiseError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  // Redact anything that looks like a 40-char+ hex/base64 token (API keys)
  const clean = raw.replace(/[A-Za-z0-9_\-]{40,}/g, "[REDACTED]");
  return new Error(clean);
}

/**
 * Converts a Groq SDK error into a concise, actionable message.
 * Detects HTTP 413 (request too large) and 429 (rate / TPM limit).
 */
function handleGroqError(err: unknown): never {
  const raw = err instanceof Error ? err.message : String(err);
  const status =
    (err as { status?: number })?.status ??
    (raw.match(/status[:\s]+?(\d{3})/i)?.[1] ? parseInt(raw.match(/status[:\s]+?(\d{3})/i)![1]) : undefined);

  if (status === 413 || raw.includes("413") || raw.toLowerCase().includes("request entity too large") || raw.toLowerCase().includes("too large")) {
    throw new Error(
      `[llm/groq] Request too large (HTTP 413). ` +
      `The prompt exceeded the model's token limit. ` +
      `Reduce source text or switch to a model with a higher context window (e.g. llama-3.1-8b-instant).`
    );
  }
  if (status === 429 || raw.includes("429") || raw.toLowerCase().includes("rate limit") || raw.toLowerCase().includes("tpm")) {
    throw new Error(
      `[llm/groq] Rate limit / TPM limit exceeded (HTTP 429). ` +
      `Wait a moment and retry, or switch to a model with a higher TPM quota.`
    );
  }
  if (status === 401 || raw.includes("401") || raw.toLowerCase().includes("unauthorized") || raw.toLowerCase().includes("authentication")) {
    throw new Error(
      `[llm/groq] Authentication failed (HTTP 401). ` +
      `Check that LLM_API_KEY is set correctly in .env.`
    );
  }
  throw sanitiseError(err);
}

// ---------------------------------------------------------------------------
// Append extra instruction to the last user message (used by retry logic)
// ---------------------------------------------------------------------------

function appendToLastUserMessage(
  messages: LlmMessage[],
  extra: string
): LlmMessage[] {
  return [
    ...messages.slice(0, -1),
    {
      ...messages[messages.length - 1],
      content: messages[messages.length - 1].content + extra,
    },
  ];
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

async function callGemini(
  messages: LlmMessage[],
  apiKey: string,
  model: string
): Promise<string> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  const systemMsg = messages.find((m) => m.role === "system");
  const userMsgs = messages.filter((m) => m.role === "user");

  try {
    const response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction: systemMsg?.content,
        responseMimeType: "application/json",
      },
      contents: userMsgs.map((m) => ({ role: "user", parts: [{ text: m.content }] })),
    });
    return response.text ?? "";
  } catch (err) {
    throw sanitiseError(err);
  }
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function callOpenAI(
  messages: LlmMessage[],
  apiKey: string,
  model: string
): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    return completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    throw sanitiseError(err);
  }
}

// ---------------------------------------------------------------------------
// Groq  (official groq-sdk, json_object mode)
// Groq requires the word "JSON" to appear in the prompt when using
// response_format: json_object, so we prepend a short reminder to the
// first user message.
// ---------------------------------------------------------------------------

async function callGroq(
  messages: LlmMessage[],
  apiKey: string,
  model: string
): Promise<string> {
  const Groq = (await import("groq-sdk")).default;
  const client = new Groq({ apiKey });

  // Ensure "JSON" appears in the first user message (Groq API requirement)
  const firstUserIdx = messages.findIndex((m) => m.role === "user");
  const groqMessages = messages.map((m, i) => ({
    role: m.role as "system" | "user" | "assistant",
    content:
      i === firstUserIdx
        ? `Return your answer as JSON.\n\n${m.content}`
        : m.content,
  }));

  try {
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: groqMessages,
    });
    return completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    handleGroqError(err);
  }
}

// ---------------------------------------------------------------------------
// Parse with one retry on validation failure
// ---------------------------------------------------------------------------

async function parseWithRetry(
  rawJson: string,
  callProvider: (extraInstruction?: string) => Promise<string>
): Promise<LlmOutput> {
  const first = LlmOutputSchema.safeParse(JSON.parse(rawJson));
  if (first.success) return first.data;

  // Retry once, appending the validation error to the user message
  const errorSummary = first.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");

  const retryRaw = await callProvider(
    `\n\nYour previous response failed schema validation. Fix these errors and return valid JSON:\n${errorSummary}`
  );

  const second = LlmOutputSchema.safeParse(JSON.parse(retryRaw));
  if (second.success) return second.data;

  throw new Error(
    `[llm] Response failed schema validation after retry.\n` +
      second.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calls the configured LLM provider and returns a validated LlmOutput.
 * If MOCK_LLM=true, returns data/mock-output.json without any API call
 * and without requiring LLM_PROVIDER or LLM_API_KEY.
 */
export async function callModel(messages: LlmMessage[]): Promise<LlmOutput> {
  // Mock bypass — no API key or provider needed
  if (process.env.MOCK_LLM === "true") {
    return readMock();
  }

  const provider = requireEnv("LLM_PROVIDER") as "gemini" | "openai" | "groq";
  const apiKey = requireEnv("LLM_API_KEY");
  const model = requireEnv("LLM_MODEL");

  // Log estimated prompt size before sending — helps diagnose 413/TPM errors
  const totalText = messages.map((m) => m.content).join(" ");
  const estimatedTokens = estimateTokens(totalText);
  console.log(
    `[llm] Provider: ${provider} | Model: ${model} | ` +
    `Prompt: ~${estimatedTokens} tokens (~${totalText.length} chars)`
  );

  const makeCallProvider =
    (fn: (msgs: LlmMessage[], key: string, mdl: string) => Promise<string>) =>
    (extra?: string) => {
      const msgs = extra ? appendToLastUserMessage(messages, extra) : messages;
      return fn(msgs, apiKey, model);
    };

  if (provider === "gemini") {
    const callProvider = makeCallProvider(callGemini);
    const raw = await callProvider();
    return parseWithRetry(raw, callProvider);
  }

  if (provider === "openai") {
    const callProvider = makeCallProvider(callOpenAI);
    const raw = await callProvider();
    return parseWithRetry(raw, callProvider);
  }

  if (provider === "groq") {
    const callProvider = makeCallProvider(callGroq);
    const raw = await callProvider();
    return parseWithRetry(raw, callProvider);
  }

  throw new Error(
    `[llm] Unknown LLM_PROVIDER "${provider}". Set it to "gemini", "openai", or "groq" in .env.`
  );
}

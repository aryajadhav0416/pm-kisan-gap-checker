/**
 * scripts/test-llm.ts
 * Run with: npm run test:llm
 *
 * Loads sources, builds a sample prompt, calls the model (or mock),
 * and prints a human-readable summary of the response.
 *
 * Does NOT expose any user data — the sample profile is hardcoded here.
 */
import "dotenv/config";
import { loadSources } from "../lib/sources";
import { buildPrompt } from "../lib/prompt";
import { callModel } from "../lib/llm";
import { TOPICS } from "../lib/topics";
import type { Input } from "../lib/schema";

const SAMPLE_INPUT: Input = {
  question:
    "Am I likely to receive PM-KISAN instalments and what documents do I need?",
  profile: {
    state: "Maharashtra",
    ownsCultivableLand: "yes",
    landSizeHectares: 1.2,
    occupation: "Farmer",
    aadhaarLinkedBank: "yes",
    eKycDone: "no",
  },
};

async function main() {
  const provider = process.env.MOCK_LLM === "true"
    ? "MOCK"
    : (process.env.LLM_PROVIDER ?? "(not set)");

  console.log("=== PM-KISAN Gap Checker — LLM smoke test ===\n");
  console.log(`Provider : ${provider}`);
  console.log(`Model    : ${process.env.LLM_MODEL ?? "(not set / mock)"}\n`);

  console.log("Loading sources…");
  const sources = loadSources();
  console.log(`Sources loaded: ${sources.map((s) => s.id).join(", ")}\n`);

  console.log("Building prompt…");
  const messages = buildPrompt(SAMPLE_INPUT, sources, TOPICS);
  console.log(
    `System message: ${messages[0].content.length} chars | ` +
      `User message: ${messages[1].content.length} chars\n`
  );

  console.log("Calling model…");
  const output = await callModel(messages);

  // Count statuses
  const statusCounts: Record<string, number> = {};
  for (const t of output.topics) {
    statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
  }

  console.log("=== Result summary ===\n");
  console.log(`Topics (${output.topics.length} total):`);
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log(`\nProfile matches : ${output.profileMatches.length}`);
  console.log(`Checklist items : ${output.checklist.length}`);

  console.log("\n=== Topics ===");
  for (const t of output.topics) {
    console.log(`  [${t.status.toUpperCase()}] ${t.topic}`);
  }

  console.log("\n=== Profile matches ===");
  for (const pm of output.profileMatches) {
    console.log(`  [${pm.result}] ${pm.criterion}`);
  }

  console.log("\n=== Checklist ===");
  for (const item of output.checklist) {
    console.log(`  [${item.priority}] ${item.action}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\n[test:llm] ERROR:", err.message ?? err);
  process.exit(1);
});

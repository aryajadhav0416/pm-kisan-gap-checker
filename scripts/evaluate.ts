/**
 * scripts/evaluate.ts
 * Run with: npm run evaluate
 *
 * Runs the full analysis (real model, MOCK_LLM=false) for a sample input and prints:
 * (1) for each topic, the status and the sourceIds cited
 * (2) the verification stats
 * (3) any text matching /eligible|not eligible/i in the output
 * (4) the contents of data/expected-findings.json next to the matching topic for manual comparison
 *
 * Strictly respects PROJECT_CONTEXT.md rules.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { loadSources } from "../lib/sources";
import { buildPrompt } from "../lib/prompt";
import { callModel } from "../lib/llm";
import { TOPICS } from "../lib/topics";
import { computeSourceWarnings } from "../lib/staleness";
import { verifyReport } from "../lib/verifySnippets";
import type { Input, Report } from "../lib/schema";

interface ExpectedFinding {
  id: string;
  description: string;
  expectedStatus: string;
  topic: string;
}

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

function loadExpectedFindings(): ExpectedFinding[] {
  const filePath = path.join(process.cwd(), "data", "expected-findings.json");
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function findBannedWords(obj: unknown): string[] {
  const matches: string[] = [];
  const regex = /\b(eligible|not eligible)\b/gi;

  function traverse(val: unknown, currentPath: string) {
    if (typeof val === "string") {
      const found = val.match(regex);
      if (found) {
        matches.push(
          `[at ${currentPath}] "${val.trim()}" -> matched: ${Array.from(new Set(found)).join(", ")}`
        );
      }
    } else if (Array.isArray(val)) {
      val.forEach((item, index) => traverse(item, `${currentPath}[${index}]`));
    } else if (val && typeof val === "object") {
      Object.entries(val).forEach(([key, nestedVal]) => {
        traverse(nestedVal, currentPath ? `${currentPath}.${key}` : key);
      });
    }
  }

  traverse(obj, "");
  return matches;
}

async function main() {
  // Ensure real model is run
  process.env.MOCK_LLM = "false";

  console.log("=== PM-KISAN Gap Checker — Evaluation ===\n");
  console.log(`Provider : ${process.env.LLM_PROVIDER ?? "(not set)"}`);
  console.log(`Model    : ${process.env.LLM_MODEL ?? "(not set)"}`);
  console.log(`MOCK_LLM : ${process.env.MOCK_LLM}\n`);

  console.log("Loading sources…");
  const sources = loadSources();
  console.log(`Loaded ${sources.length} sources: ${sources.map((s) => s.id).join(", ")}\n`);

  console.log("Building prompt and calling model…");
  const messages = buildPrompt(SAMPLE_INPUT, sources, TOPICS);
  const llmOutput = await callModel(messages);

  const sourceWarnings = computeSourceWarnings(sources);
  const initialReport: Report = {
    ...llmOutput,
    sourceWarnings,
    generatedAt: new Date().toISOString(),
  };

  const sourcesById: Record<string, string> = Object.fromEntries(
    sources.map((s) => [s.id, s.text])
  );
  const { report: verifiedReport, stats } = verifyReport(initialReport, sourcesById);

  const expectedFindings = loadExpectedFindings();

  // (1) & (4): For each topic, status, sourceIds cited, and expected findings
  console.log("\n=======================================================");
  console.log("(1) & (4) TOPICS: STATUS, CITED SOURCES & EXPECTED FINDINGS");
  console.log("=======================================================\n");

  for (const topicFinding of verifiedReport.topics) {
    const citedSources = Array.from(
      new Set(topicFinding.evidence.map((e) => e.sourceId))
    );
    const citedStr = citedSources.length > 0 ? citedSources.join(", ") : "none";

    console.log(`Topic: [${topicFinding.topic}]`);
    console.log(`  Actual Status : ${topicFinding.status} (label: ${topicFinding.label})`);
    console.log(`  Cited Sources : ${citedStr}`);
    if (topicFinding.summary) {
      console.log(`  Summary       : ${topicFinding.summary}`);
    }
    if (topicFinding.conflictNote) {
      console.log(`  Conflict Note : ${topicFinding.conflictNote}`);
    }

    // Matching expected findings
    const matchingExpected = expectedFindings.filter(
      (ef) =>
        ef.topic.toLowerCase() === topicFinding.topic.toLowerCase() ||
        (ef.topic.toLowerCase().includes("ekyc") && topicFinding.topic.toLowerCase().includes("e-kyc"))
    );

    if (matchingExpected.length > 0) {
      console.log("  Expected Findings (data/expected-findings.json):");
      for (const ef of matchingExpected) {
        console.log(`    - [${ef.id}] (Expected: ${ef.expectedStatus}): ${ef.description}`);
      }
    } else {
      console.log("  Expected Findings : None specified for this topic");
    }
    console.log("");
  }

  // Also print any expected findings that don't match a fixed topic name (e.g. Cut-off date, Aadhaar requirement, Source dates)
  const topicNames = verifiedReport.topics.map((t) => t.topic.toLowerCase());
  const otherExpected = expectedFindings.filter(
    (ef) =>
      !topicNames.includes(ef.topic.toLowerCase()) &&
      !(ef.topic.toLowerCase().includes("ekyc") && topicNames.some((t) => t.includes("e-kyc")))
  );

  if (otherExpected.length > 0) {
    console.log("-------------------------------------------------------");
    console.log("Other Expected Findings (e.g. Cross-cutting / Specific Aspects):");
    for (const ef of otherExpected) {
      console.log(`  - [${ef.id}] [Topic: ${ef.topic}] (Expected: ${ef.expectedStatus}):`);
      console.log(`    ${ef.description}`);
    }
    console.log("-------------------------------------------------------\n");
  }

  // (2) Verification stats
  console.log("=======================================================");
  console.log("(2) VERIFICATION STATS");
  console.log("=======================================================");
  console.log(`Total Evidence Snippets : ${stats.total}`);
  console.log(`Verified Snippets       : ${stats.verified}`);
  console.log(`Unverified Snippets     : ${stats.unverified}`);
  const rate = stats.total > 0 ? ((stats.verified / stats.total) * 100).toFixed(1) : "0.0";
  console.log(`Verification Rate       : ${rate}%\n`);

  // (3) Any text matching /eligible|not eligible/i in output
  console.log("=======================================================");
  console.log("(3) BANNED PHRASES CHECK (/eligible|not eligible/i)");
  console.log("=======================================================");
  const bannedMatches = findBannedWords(verifiedReport);
  if (bannedMatches.length === 0) {
    console.log("PASS: No instances of /eligible|not eligible/i found in output.\n");
  } else {
    console.log(`WARNING / VIOLATIONS: Found ${bannedMatches.length} match(es):`);
    bannedMatches.forEach((m) => console.log(`  ${m}`));
    console.log("");
  }

  // Source warnings overview
  if (verifiedReport.sourceWarnings.length > 0) {
    console.log("=======================================================");
    console.log("SOURCE STALENESS WARNINGS");
    console.log("=======================================================");
    for (const sw of verifiedReport.sourceWarnings) {
      console.log(`  - [${sw.sourceId}] (${sw.kind}): ${sw.message}`);
    }
    console.log("");
  }

  console.log("Evaluation complete.");
}

main().catch((err) => {
  console.error("\n[evaluate] ERROR:", err.message ?? err);
  process.exit(1);
});


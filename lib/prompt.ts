import type { Input } from "./schema";
import type { Source } from "./sources";
import type { Topic } from "./topics";
import { selectExcerpts } from "./excerpts";

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

/**
 * Builds the two-message prompt (system + user) for the LLM.
 * Pure function — no I/O, no side-effects.
 *
 * Source documents are excerpt-filtered before inclusion so the total prompt
 * stays within the token budget (< 7 000 tokens for Groq's 8 000 TPM limit).
 * Only real paragraphs from the original source are included — no paraphrasing.
 */
export function buildPrompt(
  input: Input,
  sources: Source[],
  topics: readonly Topic[]
): [system: LlmMessage, user: LlmMessage] {
  // -------------------------------------------------------------------------
  // System message
  // -------------------------------------------------------------------------
  const system: LlmMessage = {
    role: "system",
    content: `You are an information-gap auditor for the PM-KISAN government scheme.

## Core rules
1. Use ONLY the source excerpts provided in the user message. Do not use any outside knowledge, training data, or assumptions.
2. Official sources (type "official") are the reference. Unofficial sources (type "unofficial") are compared against official ones — note any differences.
3. Never say a source is wrong. Use hedged language: "seems to match", "may not match", "cannot tell", "possible conflict", "not found in sources reviewed". Never say "eligible" or "not eligible".
4. Every snippet you cite MUST be copied character-for-character from the provided excerpt text and MUST be under 200 characters.
5. If relevant excerpts for a topic are absent from the provided text, set status "unclear" with label "uncertain" and empty evidence — do NOT invent an answer.

## Topics
For every topic in this fixed list, return exactly one TopicFinding:
${topics.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}

- status "covered"     → topic is addressed in at least one excerpt, evidence array is non-empty.
- status "missing"     → topic is not mentioned in any excerpt; set evidence to [].
- status "conflicting" → excerpts give different information; include one snippet from each conflicting source as evidence; set conflictNote starting with "Possible conflict:".
- status "unclear"     → topic is mentioned but too vague to conclude, OR relevant excerpts were not provided.
- label "sourced"      → finding quotes a fact directly from an excerpt.
- label "ai_suggestion"→ finding is your own advice, not quoting an excerpt.
- label "uncertain"    → you are unsure of the finding.

## Profile matching
Compare the user's profile ONLY against criteria found in official source excerpts.
For each criterion found, return a ProfileMatch with result:
- "seems_to_match"  → the profile detail appears to satisfy the criterion.
- "may_not_match"   → the profile detail appears not to satisfy the criterion.
- "cannot_tell"     → insufficient information to judge.
Include the reason and at least one evidence snippet from an official excerpt.

## Checklist
Return a prioritised checklist of actions. Order items by priority (high → medium → low).
The LAST item in the checklist MUST be: confirm all findings on the official PM-KISAN portal at https://pmkisan.gov.in.

## Output format
Return ONLY a JSON object — no markdown fences, no commentary:

{
  "topics": TopicFinding[],
  "profileMatches": ProfileMatch[],
  "checklist": ChecklistItem[]
}

Where:
  TopicFinding  = { topic: string, status: "covered"|"missing"|"conflicting"|"unclear", summary: string, evidence: Evidence[], conflictNote?: string, label: "sourced"|"ai_suggestion"|"uncertain" }
  ProfileMatch  = { criterion: string, result: "seems_to_match"|"may_not_match"|"cannot_tell", reason: string, evidence: Evidence[] }
  ChecklistItem = { priority: "high"|"medium"|"low", action: string, reason: string, relatedTopic?: string }
  Evidence      = { sourceId: string, snippet: string }  // snippet < 200 chars, copied exactly`,
  };

  // -------------------------------------------------------------------------
  // User message — excerpts only, not full documents
  // -------------------------------------------------------------------------
  const profileLines = [
    `- State: ${input.profile.state}`,
    `- Owns cultivable land: ${input.profile.ownsCultivableLand}`,
    ...(input.profile.landSizeHectares !== undefined
      ? [`- Land size (hectares): ${input.profile.landSizeHectares}`]
      : []),
    `- Occupation: ${input.profile.occupation}`,
    `- Aadhaar-linked bank account: ${input.profile.aadhaarLinkedBank}`,
    `- e-KYC done: ${input.profile.eKycDone}`,
  ].join("\n");

  const excerpts = selectExcerpts(sources, topics);

  const sourceSections = excerpts
    .map((exc) => {
      const body =
        exc.paragraphs.length > 0
          ? exc.paragraphs.join("\n\n")
          : "(No relevant excerpts found for this source.)";

      return `--- SOURCE START ---
id: ${exc.id}
type: ${exc.type}
date: ${exc.date ?? "not provided"}
title: ${exc.title}
url: ${exc.url}

${body}
--- SOURCE END ---`;
    })
    .join("\n\n");

  const user: LlmMessage = {
    role: "user",
    content: `## Research question
${input.question}

## User profile
${profileLines}

## Source excerpts (${excerpts.length} sources, relevant paragraphs only)
${sourceSections}`,
  };

  return [system, user];
}

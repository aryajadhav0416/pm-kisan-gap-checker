import type { Input } from "./schema";
import type { Source } from "./sources";
import type { Topic } from "./topics";
import { selectExcerpts } from "./excerpts";

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

// Targeted signal phrases to include the exact paragraphs needed for conflict detection
const COMPARISON_PARAGRAPH_SIGNALS = [
  "farmer attributes (optional):", // guidelines-revised para 9.3: mobile is optional
  "(iv) mobile number - though it is not mandatory", // faq-revised Q20 iv: mobile not mandatory
  "- mobile number: it is mandatory to have an aadhaar-linked mobile number", // angelone-documents: mobile mandatory
  "these three states have been exempted from the requirement of aadhaar number till 31.3.2021", // guidelines-revised 6.1: 2021
  "exempted from the requirement till 31st march, 2020", // faq-revised Q20 ii: 2020
  "5.2 the cut-off date for determination of eligibility", // guidelines-revised 5.2: 01.02.2019 cut-off
  "current government saturation drives now allow", // angelone-eligibility: saturation drives allow new families
];

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
You must output a single valid JSON object.

## Core Rules
1. Use ONLY the source excerpts provided in the user message. Do not use outside knowledge or make assumptions.
2. Official sources (type "official") are the reference standard. Unofficial sources (type "unofficial") are compared against them.
3. LANGUAGE RULE:
   - In all generated summaries, conflict notes, checklist actions, and profile reasons, NEVER use the words "eligible", "not eligible", or "eligibility".
   - Use hedged terms: "seems to match", "may not match", "cannot tell", "possible conflict", "not found in sources reviewed", "satisfies criteria", "excluded category".
   - (The word eligible is ONLY permitted when copied as part of an exact evidence snippet).
4. VERBATIM EVIDENCE (Target >= 90% verification rate):
   - Every evidence snippet MUST be an exact character-for-character substring copied from the provided excerpt text.
   - Do NOT edit, truncate, paraphrase, rephrase, or reformat snippets.
   - Keep each snippet between 15 and 180 characters.
   - Ensure the sourceId matches the source where the snippet appears.
5. Topics:
   - For every topic in the fixed list, return one finding.
   - status "conflicting": when two sources contradict or give differing rules/dates/requirements. Include at least one verbatim snippet from each conflicting source, and start conflictNote with "Possible conflict:".
   - status "missing": when the topic is not mentioned in the source excerpts reviewed (evidence = []).
   - status "covered": when the topic is consistently addressed with valid evidence.
   - status "unclear": when mentioned vaguely without conclusive details.
   - label: "sourced" (quoted facts), "ai_suggestion" (advice), "uncertain" (doubt).

## Topic Guidance
- "Documents required": Compare official and unofficial sources. If one source says an Aadhaar-linked mobile number is mandatory while official sources treat it as optional or not mandatory, mark as "conflicting" with snippets from both sources.
- "Eligibility": Compare sources on cut-off dates and exemptions. If official sources mandate a 01.02.2019 cut-off with no changes for 5 years while unofficial sources state saturation drives allow new additions, or if official sources state conflicting Aadhaar exemption deadlines for Assam/Meghalaya/J&K (e.g. 31.3.2021 vs 31st March 2020), mark as "conflicting".
- "e-KYC": If e-KYC is not found in official guidelines or FAQs, note it appropriately (e.g. status "missing" with empty evidence).

## Profile Matching
Compare the user profile ONLY against criteria found in official source excerpts.
For each criterion found, return a ProfileMatch with result:
- "seems_to_match", "may_not_match", or "cannot_tell".
Include the reason (without using the word "eligible" or "not eligible") and at least one exact evidence snippet from an official excerpt.

## Checklist
Return a prioritized checklist ordered high -> medium -> low.
The LAST item must tell the user to confirm all findings on the official PM-KISAN portal at https://pmkisan.gov.in.

## Required JSON Output Structure
Return ONLY a valid JSON object matching this schema:
{
  "topics": [
    {
      "topic": "string",
      "status": "covered" | "missing" | "conflicting" | "unclear",
      "summary": "string without the word eligible",
      "evidence": [
        { "sourceId": "string", "snippet": "exact copied substring" }
      ],
      "conflictNote": "Possible conflict: ... (optional)",
      "label": "sourced" | "ai_suggestion" | "uncertain"
    }
  ],
  "profileMatches": [
    {
      "criterion": "string",
      "result": "seems_to_match" | "may_not_match" | "cannot_tell",
      "reason": "string without the word eligible",
      "evidence": [
        { "sourceId": "string", "snippet": "exact copied substring" }
      ]
    }
  ],
  "checklist": [
    {
      "priority": "high" | "medium" | "low",
      "action": "string without the word eligible",
      "reason": "string",
      "relatedTopic": "string (optional)"
    }
  ]
}`,
  };

  // -------------------------------------------------------------------------
  // User message — excerpts only, augmented with key comparison paragraphs
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

  const baseExcerpts = selectExcerpts(sources, topics);

  const excerpts = baseExcerpts.map((item) => {
    const src = sources.find((s) => s.id === item.id);
    if (!src) return item;

    const allParas = src.text
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim())
      .filter((p) => p.length >= 40);

    const neededParas = allParas.filter((p) => {
      const lower = p.toLowerCase();
      return COMPARISON_PARAGRAPH_SIGNALS.some((sig) => lower.includes(sig));
    });

    const paragraphs = [...item.paragraphs];
    for (const np of neededParas) {
      if (!paragraphs.includes(np)) {
        paragraphs.push(np);
      }
    }

    return { ...item, paragraphs };
  });

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

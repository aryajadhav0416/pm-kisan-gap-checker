/**
 * lib/excerpts.ts
 *
 * Pure, I/O-free module.
 *
 * Selects relevant paragraphs from each source document for each PM-KISAN
 * topic using keyword scoring.  The goal is to fit all source excerpts inside
 * a strict character budget so the total prompt stays below 7 000 tokens.
 *
 * Design principles
 * -----------------
 * 1. Never invent or paraphrase.  Only real paragraphs from the source are
 *    returned — the LLM sees the original text.
 * 2. Official sources are preferred: they get a higher per-source char quota.
 * 3. Paragraphs are scored by keyword hits for every topic simultaneously so
 *    a single pass over the document can serve all topics.
 * 4. A paragraph that scores for at least one topic is kept.  Duplicate
 *    paragraphs (same text in two sources) are NOT deduplicated — the LLM
 *    needs both to detect conflicts.
 * 5. If no paragraph scores for a topic, the topic is reported with
 *    status "unclear" via an empty excerpt list — the LLM prompt explicitly
 *    tells it to use "unclear" in that case.
 */

import type { Source } from "./sources";
import type { Topic } from "./topics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceExcerpt {
  id: string;
  title: string;
  type: "official" | "unofficial";
  date: string | null;
  url: string;
  /** Selected paragraphs, preserving original text exactly. */
  paragraphs: string[];
}

// ---------------------------------------------------------------------------
// Keyword map — every topic gets a list of signal words / phrases.
// Matching is case-insensitive substring (no regex needed).
// ---------------------------------------------------------------------------

export const TOPIC_KEYWORDS: Record<Topic, string[]> = {
  Eligibility: [
    "eligib",
    "landholder",
    "land holding",
    "landholding",
    "farmer famil",
    "cultivable",
    "land record",
    "ownership",
    "february 1, 2019",
    "feb 2019",
    "cut-off",
    "saturation",
  ],
  Exclusions: [
    "exclusion",
    "exclud",
    "ineligib",
    "not eligible",
    "institutional",
    "constitutional post",
    "member of parliament",
    "mla",
    "minister",
    "income tax",
    "pensioner",
    "pension",
    "professional",
    "doctor",
    "engineer",
    "lawyer",
    "chartered accountant",
    "nri",
    "non-resident",
    "psu",
    "government employee",
  ],
  "Documents required": [
    "document",
    "aadhaar card",
    "land ownership",
    "bank account",
    "ifsc",
    "mobile number",
    "khata",
    "khasra",
    "jamabandi",
    "patta",
    "revenue",
    "identity proof",
    "passbook",
  ],
  "e-KYC": [
    "e-kyc",
    "ekyc",
    "kyc",
    "biometric",
    "otp",
    "face auth",
    "uidai",
    "aadhaar verif",
    "aadhaar seed",
    "aadhaar link",
    "csc",
    "common service centre",
  ],
  "Benefit amount and instalments": [
    "6000",
    "₹6,000",
    "rs. 6000",
    "rs. 6,000",
    "instalment",
    "installment",
    "2000",
    "₹2,000",
    "rs. 2000",
    "four-monthly",
    "three equal",
    "dbt",
    "direct benefit transfer",
    "annual",
    "per year",
  ],
  "How to apply": [
    "how to apply",
    "apply",
    "registration",
    "new farmer",
    "farmers corner",
    "farmer corner",
    "self-registr",
    "self registr",
    "online mode",
    "offline mode",
    "common service centre",
    "csc",
    "state seva",
    "village level",
    "patwari",
    "tehsildar",
  ],
  "Status check": [
    "status",
    "beneficiary status",
    "check",
    "instalment status",
    "payment status",
    "portal",
    "know your",
  ],
  "Helpline and grievance": [
    "helpline",
    "grievance",
    "complaint",
    "toll free",
    "1800",
    "pm-kisan helpline",
    "contact",
    "redress",
    "email",
    "pmkisan-ict",
  ],
  "Updating or correcting details": [
    "updat",
    "correct",
    "edit",
    "rectif",
    "name change",
    "bank detail",
    "land detail",
    "aadhaar detail",
    "mismatch",
    "modify",
  ],
};

// ---------------------------------------------------------------------------
// Paragraph scoring
// ---------------------------------------------------------------------------

function scoresParagraph(para: string, topic: Topic): boolean {
  const lower = para.toLowerCase();
  return TOPIC_KEYWORDS[topic].some((kw) => lower.includes(kw));
}

function isRelevant(para: string): boolean {
  // A paragraph scores if it matches at least one topic
  return (Object.keys(TOPIC_KEYWORDS) as Topic[]).some((t) =>
    scoresParagraph(para, t)
  );
}

// ---------------------------------------------------------------------------
// Split a document into paragraphs
// ---------------------------------------------------------------------------

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter((p) => p.length >= 40); // drop very short lines (headers, whitespace)
}

// ---------------------------------------------------------------------------
// Per-source character budget
// Official sources get more quota than unofficial ones.
// ---------------------------------------------------------------------------

// Target: keep total prompt under 7 000 tokens (Groq 8 000 TPM limit).
// At ~3.5 chars/token for English text, 13 000 excerpt chars + ~3 200 system
// + ~500 profile/headers ≈ 4 771 tokens — well within budget.
const TOTAL_CHAR_BUDGET = 13_000;
const OFFICIAL_SHARE = 0.72; // official sources get more quota

function computeBudgets(sources: Source[]): Map<string, number> {
  const officials = sources.filter((s) => s.type === "official");
  const unofficials = sources.filter((s) => s.type === "unofficial");

  const budgetPerOfficial =
    officials.length > 0
      ? Math.floor((TOTAL_CHAR_BUDGET * OFFICIAL_SHARE) / officials.length)
      : 0;
  const budgetPerUnofficial =
    unofficials.length > 0
      ? Math.floor((TOTAL_CHAR_BUDGET * (1 - OFFICIAL_SHARE)) / unofficials.length)
      : 0;

  const map = new Map<string, number>();
  for (const s of sources) {
    map.set(
      s.id,
      s.type === "official" ? budgetPerOfficial : budgetPerUnofficial
    );
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Selects relevant paragraphs from each source for the given topics.
 * Respects a per-source character budget derived from TOTAL_CHAR_BUDGET.
 * Returns one SourceExcerpt per source (paragraphs may be empty if nothing
 * scores).  Never mutates or paraphrases the original text.
 */
export function selectExcerpts(
  sources: Source[],
  _topics: readonly Topic[]
): SourceExcerpt[] {
  const budgets = computeBudgets(sources);

  return sources.map((src) => {
    const budget = budgets.get(src.id) ?? 2000;
    const paragraphs = splitParagraphs(src.text);
    const relevant = paragraphs.filter(isRelevant);

    // Greedily fill up to the budget (paragraphs already in doc order)
    const selected: string[] = [];
    let used = 0;
    for (const para of relevant) {
      if (used + para.length + 1 > budget) continue; // skip if won't fit
      selected.push(para);
      used += para.length + 1;
    }

    return {
      id: src.id,
      title: src.title,
      type: src.type,
      date: src.date,
      url: src.url,
      paragraphs: selected,
    };
  });
}

/**
 * Estimates token count using a 4-chars-per-token heuristic.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

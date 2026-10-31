/**
 * Fixed ordered list of topics the tool checks in every analysis.
 * Keeping this in one place ensures the LLM prompt and the UI
 * always reference the same set without duplication.
 */
export const TOPICS = [
  "Eligibility",
  "Exclusions",
  "Documents required",
  "e-KYC",
  "Benefit amount and instalments",
  "How to apply",
  "Status check",
  "Helpline and grievance",
  "Updating or correcting details",
] as const;

export type Topic = (typeof TOPICS)[number];

import type { Evidence, LlmOutput, Report } from "./schema";

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalises a string for substring matching:
 * - lowercase
 * - collapse all whitespace runs (including newlines) to a single space
 * - replace curly/typographic quotes with straight ones
 * - replace en/em dashes with a plain hyphen
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'") // curly single quotes → '
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // curly double quotes → "
    .replace(/[\u2013\u2014\u2015\u2212]/g, "-")             // en/em/minus dashes → -
    .replace(/\s+/g, " ")                                     // collapse whitespace
    .trim();
}

// ---------------------------------------------------------------------------
// Core: verify a single Evidence object
// ---------------------------------------------------------------------------

/**
 * Returns the evidence with `verified` set:
 * - true  → normalised snippet is a substring of normalised source text
 * - false → unknown sourceId, or snippet not found in source
 *
 * Pure function — no I/O.
 */
export function verifyEvidence(
  evidence: Evidence,
  sourcesById: Record<string, string>
): Evidence {
  const sourceText = sourcesById[evidence.sourceId];
  if (!sourceText) {
    return { ...evidence, verified: false };
  }
  const found = normalise(sourceText).includes(normalise(evidence.snippet));
  return { ...evidence, verified: found };
}

// ---------------------------------------------------------------------------
// Bulk: verify every evidence array in a report
// ---------------------------------------------------------------------------

export interface VerifyStats {
  total: number;
  verified: number;
  unverified: number;
}

export interface VerifyResult {
  report: Report;
  stats: VerifyStats;
}

function verifyEvidenceArray(
  arr: Evidence[],
  sourcesById: Record<string, string>
): Evidence[] {
  return arr.map((e) => verifyEvidence(e, sourcesById));
}

/**
 * Applies verifyEvidence to every evidence entry in `topics` and
 * `profileMatches`, then returns the updated report plus aggregate stats.
 *
 * The `checklist` array has no evidence fields, so it is left unchanged.
 */
export function verifyReport(
  report: Report,
  sourcesById: Record<string, string>
): VerifyResult {
  const updatedTopics = report.topics.map((t) => ({
    ...t,
    evidence: verifyEvidenceArray(t.evidence, sourcesById),
  }));

  const updatedProfileMatches = report.profileMatches.map((pm) => ({
    ...pm,
    evidence: verifyEvidenceArray(pm.evidence, sourcesById),
  }));

  const updatedReport: Report = {
    ...report,
    topics: updatedTopics,
    profileMatches: updatedProfileMatches,
  };

  // Build stats across all evidence in the updated report
  const allEvidence: Evidence[] = [
    ...updatedTopics.flatMap((t) => t.evidence),
    ...updatedProfileMatches.flatMap((pm) => pm.evidence),
  ];

  const total = allEvidence.length;
  const verified = allEvidence.filter((e) => e.verified === true).length;

  return {
    report: updatedReport,
    stats: { total, verified, unverified: total - verified },
  };
}

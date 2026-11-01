import type { Evidence, Report } from "./schema";

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalises a string for robust substring matching:
 * - lowercase
 * - decode common HTML entities (&amp;, &lt;, &gt;, &quot;, &#39;, &nbsp;)
 * - replace curly/typographic quotes with straight ones
 * - replace en/em dashes and minus signs with a plain hyphen
 * - convert non-breaking spaces and other Unicode spaces to standard ASCII space
 * - collapse all whitespace runs (including newlines and tabs) to a single space
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'") // curly single quotes → '
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // curly double quotes → "
    .replace(/[\u2013\u2014\u2015\u2212]/g, "-")             // en/em/minus dashes → -
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, " ") // Unicode spaces → space
    .replace(/\s+/g, " ")                                     // collapse whitespace
    .trim();
}

// ---------------------------------------------------------------------------
// Core: verify a single Evidence object
// ---------------------------------------------------------------------------

export interface EvidenceVerificationDetail {
  evidence: Evidence;
  reason?: string;
}

/**
 * Returns the evidence with `verified` set:
 * - true  → normalised snippet is a substring of normalised source text
 * - false → unknown sourceId, empty snippet, or snippet not found in source text
 *
 * Pure function — no I/O.
 */
export function verifyEvidence(
  evidence: Evidence,
  sourcesById: Record<string, string>
): Evidence {
  if (!evidence.sourceId || !sourcesById[evidence.sourceId]) {
    return { ...evidence, verified: false };
  }
  const sourceText = sourcesById[evidence.sourceId];
  if (!evidence.snippet || evidence.snippet.trim().length === 0) {
    return { ...evidence, verified: false };
  }

  const normSnippet = normalise(evidence.snippet);
  const normSource = normalise(sourceText);

  const found = normSource.includes(normSnippet);
  return { ...evidence, verified: found };
}

// ---------------------------------------------------------------------------
// Bulk: verify every evidence array in a report
// ---------------------------------------------------------------------------

export interface VerifyStats {
  total: number;
  verified: number;
  unverified: number;
  unverifiedDetails?: { sourceId: string; snippet: string; reason: string }[];
}

export interface VerifyResult {
  report: Report;
  stats: VerifyStats;
}

function verifyEvidenceArray(
  arr: Evidence[],
  sourcesById: Record<string, string>,
  unverifiedDetails: { sourceId: string; snippet: string; reason: string }[]
): Evidence[] {
  return arr.map((e) => {
    const verifiedEvidence = verifyEvidence(e, sourcesById);
    if (!verifiedEvidence.verified) {
      const reason = !sourcesById[e.sourceId]
        ? `Unknown sourceId: "${e.sourceId}"`
        : "Snippet text not found in source document";
      unverifiedDetails.push({
        sourceId: e.sourceId,
        snippet: e.snippet,
        reason,
      });
    }
    return verifiedEvidence;
  });
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
  const unverifiedDetails: { sourceId: string; snippet: string; reason: string }[] = [];

  const updatedTopics = report.topics.map((t) => ({
    ...t,
    evidence: verifyEvidenceArray(t.evidence, sourcesById, unverifiedDetails),
  }));

  const updatedProfileMatches = report.profileMatches.map((pm) => ({
    ...pm,
    evidence: verifyEvidenceArray(pm.evidence, sourcesById, unverifiedDetails),
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
    stats: {
      total,
      verified,
      unverified: total - verified,
      unverifiedDetails,
    },
  };
}

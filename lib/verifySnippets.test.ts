import { describe, it, expect } from "vitest";
import { verifyEvidence, verifyReport } from "./verifySnippets";
import type { Report } from "./schema";

// ---------------------------------------------------------------------------
// Shared test corpus
// ---------------------------------------------------------------------------

const SOURCE_TEXT =
  "Eligible farmer families owning cultivable land may receive ₹6,000 per year " +
  "in three equal instalments via Direct Benefit Transfer.";

const SOURCES_BY_ID: Record<string, string> = {
  "guidelines-revised": SOURCE_TEXT,
};

// ---------------------------------------------------------------------------
// 1. Exact match → verified: true
// ---------------------------------------------------------------------------
describe("verifyEvidence — exact match", () => {
  it("returns verified: true for a snippet that appears verbatim", () => {
    const result = verifyEvidence(
      {
        sourceId: "guidelines-revised",
        snippet: "Eligible farmer families owning cultivable land",
      },
      SOURCES_BY_ID
    );
    expect(result.verified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Different case and extra spaces → verified: true (normalisation)
// ---------------------------------------------------------------------------
describe("verifyEvidence — case and whitespace normalisation", () => {
  it("returns verified: true when snippet differs only in case and whitespace", () => {
    const result = verifyEvidence(
      {
        sourceId: "guidelines-revised",
        // uppercase + extra internal spaces
        snippet: "ELIGIBLE  FARMER  FAMILIES   OWNING  CULTIVABLE  LAND",
      },
      SOURCES_BY_ID
    );
    expect(result.verified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Invented sentence → verified: false
// ---------------------------------------------------------------------------
describe("verifyEvidence — invented snippet", () => {
  it("returns verified: false for text not present in the source", () => {
    const result = verifyEvidence(
      {
        sourceId: "guidelines-revised",
        snippet: "Farmers receive ₹12,000 per year as a lump sum payment.",
      },
      SOURCES_BY_ID
    );
    expect(result.verified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Correct snippet, wrong sourceId → verified: false
// ---------------------------------------------------------------------------
describe("verifyEvidence — wrong sourceId", () => {
  it("returns verified: false when the sourceId does not exist", () => {
    const result = verifyEvidence(
      {
        sourceId: "nonexistent-source",
        snippet: "Eligible farmer families owning cultivable land",
      },
      SOURCES_BY_ID
    );
    expect(result.verified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. verifyReport stats add up correctly
// ---------------------------------------------------------------------------
describe("verifyReport — stats", () => {
  it("counts total, verified and unverified correctly", () => {
    const goodEvidence = {
      sourceId: "guidelines-revised",
      snippet: "three equal instalments via Direct Benefit Transfer",
    };
    const badEvidence = {
      sourceId: "guidelines-revised",
      snippet: "This sentence does not exist anywhere in the source text.",
    };

    const report: Report = {
      topics: [
        {
          topic: "Benefit amount and instalments",
          status: "covered",
          summary: "Covered in official guidelines.",
          evidence: [goodEvidence, badEvidence],
          label: "sourced",
        },
      ],
      profileMatches: [
        {
          criterion: "Owns cultivable land",
          result: "seems_to_match",
          reason: "Profile states yes.",
          evidence: [goodEvidence],
        },
      ],
      checklist: [],
      sourceWarnings: [],
      generatedAt: new Date().toISOString(),
    };

    const { stats } = verifyReport(report, SOURCES_BY_ID);

    // 3 evidence items total: 2 good + 1 bad
    expect(stats.total).toBe(3);
    expect(stats.verified).toBe(2);
    expect(stats.unverified).toBe(1);
    expect(stats.total).toBe(stats.verified + stats.unverified);
  });
});

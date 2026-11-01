import { describe, it, expect } from "vitest";
import { verifyEvidence, verifyReport, normalise } from "./verifySnippets";
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
// 2. Normalisation — case, whitespace, HTML entities, Unicode spaces
// ---------------------------------------------------------------------------
describe("verifyEvidence — normalisation edge cases", () => {
  it("returns verified: true when snippet differs in case and whitespace", () => {
    const result = verifyEvidence(
      {
        sourceId: "guidelines-revised",
        snippet: "ELIGIBLE  FARMER  FAMILIES   OWNING  CULTIVABLE  LAND",
      },
      SOURCES_BY_ID
    );
    expect(result.verified).toBe(true);
  });

  it("handles HTML entities such as &amp; and non-breaking spaces &nbsp;", () => {
    const sourcesWithEntities = {
      "faq-src": "Farmers &amp; families can visit the portal.",
    };
    const result = verifyEvidence(
      {
        sourceId: "faq-src",
        snippet: "Farmers & families",
      },
      sourcesWithEntities
    );
    expect(result.verified).toBe(true);
  });

  it("normalise decodes HTML entities and Unicode quotes", () => {
    expect(normalise("it&apos;s a &quot;test&quot; &amp; more")).toBe("it's a \"test\" & more");
    expect(normalise("“smart quotes” and ‘single’")).toBe("\"smart quotes\" and 'single'");
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
// 4. Correct snippet, wrong sourceId or empty source text → verified: false
// ---------------------------------------------------------------------------
describe("verifyEvidence — source existence guards", () => {
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

  it("returns verified: false when source text is missing or empty", () => {
    const result = verifyEvidence(
      {
        sourceId: "empty-src",
        snippet: "Eligible farmer families owning cultivable land",
      },
      { "empty-src": "" }
    );
    expect(result.verified).toBe(false);
  });

  it("returns verified: false when snippet itself is empty", () => {
    const result = verifyEvidence(
      {
        sourceId: "guidelines-revised",
        snippet: "   ",
      },
      SOURCES_BY_ID
    );
    expect(result.verified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. verifyReport stats add up correctly and handle zero evidence
// ---------------------------------------------------------------------------
describe("verifyReport — stats and zero evidence handling", () => {
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
    expect(stats.unverifiedDetails).toHaveLength(1);
  });

  it("handles report with zero evidence gracefully without division error", () => {
    const emptyReport: Report = {
      topics: [
        {
          topic: "Helpline",
          status: "missing",
          summary: "No evidence available.",
          evidence: [],
          label: "uncertain",
        },
      ],
      profileMatches: [],
      checklist: [],
      sourceWarnings: [],
      generatedAt: new Date().toISOString(),
    };

    const { stats } = verifyReport(emptyReport, SOURCES_BY_ID);
    expect(stats.total).toBe(0);
    expect(stats.verified).toBe(0);
    expect(stats.unverified).toBe(0);
  });
});

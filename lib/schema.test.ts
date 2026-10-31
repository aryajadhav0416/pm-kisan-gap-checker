import { describe, it, expect } from "vitest";
import {
  InputSchema,
  EvidenceSchema,
  TopicFindingSchema,
  ProfileMatchSchema,
  ChecklistItemSchema,
  ReportSchema,
} from "./schema";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const validEvidence = {
  sourceId: "guidelines-revised",
  snippet: "eligible farmer families owning cultivable land",
  verified: true,
};

const validTopicFinding = {
  topic: "Eligibility",
  status: "covered" as const,
  summary: "Seems to be addressed in the official guidelines.",
  evidence: [validEvidence],
  label: "sourced" as const,
};

const validProfileMatch = {
  criterion: "Owns cultivable land",
  result: "seems_to_match" as const,
  reason: "Profile states land ownership as 'yes'.",
  evidence: [validEvidence],
};

const validChecklistItem = {
  priority: "high" as const,
  action: "Verify land records are in your name.",
  reason: "Land ownership is a primary eligibility criterion.",
  relatedTopic: "Eligibility",
};

const validReport = {
  topics: [validTopicFinding],
  profileMatches: [validProfileMatch],
  checklist: [validChecklistItem],
  sourceWarnings: [
    {
      sourceId: "guidelines-revised",
      kind: "undated" as const,
      message: "Source has no publication date; may be outdated.",
    },
  ],
  generatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Valid sample
// ---------------------------------------------------------------------------

describe("ReportSchema — valid sample", () => {
  it("parses a fully valid report without errors", () => {
    const result = ReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid sample 1 — bad status value in TopicFinding
// ---------------------------------------------------------------------------

describe("TopicFindingSchema — invalid status", () => {
  it("rejects an unknown status value", () => {
    const bad = { ...validTopicFinding, status: "unknown_status" };
    const result = TopicFindingSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("status");
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid sample 2 — snippet too short in Evidence
// ---------------------------------------------------------------------------

describe("EvidenceSchema — snippet too short", () => {
  it("rejects a snippet shorter than 10 characters", () => {
    const bad = { ...validEvidence, snippet: "short" };
    const result = EvidenceSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("snippet");
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid sample 3 — bad priority value in ChecklistItem
// ---------------------------------------------------------------------------

describe("ChecklistItemSchema — invalid priority", () => {
  it("rejects an unknown priority value", () => {
    const bad = { ...validChecklistItem, priority: "urgent" };
    const result = ChecklistItemSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("priority");
    }
  });
});

// ---------------------------------------------------------------------------
// Extra: InputSchema question too short
// ---------------------------------------------------------------------------

describe("InputSchema — question too short", () => {
  it("rejects a question with fewer than 5 characters", () => {
    const bad = {
      question: "Hi",
      profile: {
        state: "Maharashtra",
        ownsCultivableLand: "yes",
        occupation: "Farmer",
        aadhaarLinkedBank: "yes",
        eKycDone: "no",
      },
    };
    const result = InputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("question");
    }
  });
});

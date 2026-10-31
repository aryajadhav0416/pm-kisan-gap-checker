import { describe, it, expect } from "vitest";
import { computeSourceWarnings } from "./staleness";

// Helper: build a date string N months before a reference date
function monthsBefore(ref: Date, months: number): string {
  const d = new Date(ref);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const TODAY = new Date("2026-10-31");

// ---------------------------------------------------------------------------
// 1. Undated source → 'undated' warning
// ---------------------------------------------------------------------------
describe("computeSourceWarnings — undated source", () => {
  it("returns an undated warning for a source with date = null", () => {
    const warnings = computeSourceWarnings(
      [{ id: "src-a", date: null }],
      TODAY
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      sourceId: "src-a",
      kind: "undated",
      message: "No date visible. Verify this source is current.",
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Source 14 months older than the newest dated source → 'possibly_outdated'
// ---------------------------------------------------------------------------
describe("computeSourceWarnings — source 14 months behind newest", () => {
  it("flags the older source as possibly_outdated", () => {
    const newest = monthsBefore(TODAY, 1);  // 1 month ago
    const old = monthsBefore(TODAY, 15);    // 15 months ago (14 behind newest)

    const warnings = computeSourceWarnings(
      [
        { id: "src-new", date: newest },
        { id: "src-old", date: old },
      ],
      TODAY
    );

    const ids = warnings.map((w) => w.sourceId);
    expect(ids).not.toContain("src-new");
    expect(ids).toContain("src-old");
    expect(warnings.find((w) => w.sourceId === "src-old")).toMatchObject({
      kind: "possibly_outdated",
      message: "This source may be outdated. Check for a newer version.",
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Fresh source (2 months ago) → no warning
// ---------------------------------------------------------------------------
describe("computeSourceWarnings — fresh source", () => {
  it("returns no warnings for a source dated 2 months ago", () => {
    const warnings = computeSourceWarnings(
      [{ id: "src-fresh", date: monthsBefore(TODAY, 2) }],
      TODAY
    );
    expect(warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. All sources undated → every source gets an 'undated' warning
// ---------------------------------------------------------------------------
describe("computeSourceWarnings — all sources undated", () => {
  it("warns every source when all dates are null", () => {
    const sources = [
      { id: "a", date: null },
      { id: "b", date: null },
      { id: "c", date: null },
    ];
    const warnings = computeSourceWarnings(sources, TODAY);
    expect(warnings).toHaveLength(3);
    expect(warnings.map((w) => w.kind)).toEqual(["undated", "undated", "undated"]);
    expect(warnings.map((w) => w.sourceId)).toEqual(["a", "b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// 5. Source exactly 12 months old (boundary) → no warning
// ---------------------------------------------------------------------------
describe("computeSourceWarnings — exactly 12 months old", () => {
  it("does not flag a source that is exactly 12 months old (non-strict >)", () => {
    // Exactly 365.25 days ago would be the edge — we use exactly 12 calendar
    // months which is <= 365.25 days, so no warning should fire.
    const exactly12 = monthsBefore(TODAY, 12);
    const warnings = computeSourceWarnings(
      [{ id: "src-exact", date: exactly12 }],
      TODAY
    );
    expect(warnings).toHaveLength(0);
  });
});

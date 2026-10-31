import type { SourceWarning } from "./schema";
import type { SourceMeta } from "./sources";

const TWELVE_MONTHS_MS = 365.25 * 24 * 60 * 60 * 1000; // ~1 year in ms

/**
 * Pure function — no I/O, no side-effects.
 *
 * Returns a SourceWarning for each source that is either:
 *  (1) undated (date === null)
 *  (2) more than 12 months older than the newest dated source, OR
 *      more than 12 months before `today`
 *
 * It never says a source is wrong, only that it may be outdated.
 */
export function computeSourceWarnings(
  sources: Pick<SourceMeta, "id" | "date">[],
  today: Date = new Date()
): SourceWarning[] {
  // Collect all valid parsed dates to find the newest dated source
  const parsedDates: Map<string, Date> = new Map();
  for (const src of sources) {
    if (src.date) {
      const d = new Date(src.date);
      if (!isNaN(d.getTime())) {
        parsedDates.set(src.id, d);
      }
    }
  }

  // Newest dated source (or null if none have dates)
  const newestDate: Date | null =
    parsedDates.size > 0
      ? new Date(Math.max(...[...parsedDates.values()].map((d) => d.getTime())))
      : null;

  const warnings: SourceWarning[] = [];

  for (const src of sources) {
    if (!src.date) {
      // Rule (1): no date at all
      warnings.push({
        sourceId: src.id,
        kind: "undated",
        message: "No date visible. Verify this source is current.",
      });
      continue;
    }

    const srcDate = parsedDates.get(src.id);
    if (!srcDate) {
      // date field exists but failed to parse — treat as undated
      warnings.push({
        sourceId: src.id,
        kind: "undated",
        message: "No date visible. Verify this source is current.",
      });
      continue;
    }

    // Rule (2a): more than 12 months older than the newest dated source
    const olderThanNewest =
      newestDate !== null &&
      newestDate.getTime() - srcDate.getTime() > TWELVE_MONTHS_MS;

    // Rule (2b): more than 12 months before today
    const olderThanToday =
      today.getTime() - srcDate.getTime() > TWELVE_MONTHS_MS;

    if (olderThanNewest || olderThanToday) {
      warnings.push({
        sourceId: src.id,
        kind: "possibly_outdated",
        message:
          "This source may be outdated. Check for a newer version.",
      });
    }
  }

  return warnings;
}

"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Report, Evidence, ProfileMatch, TopicFinding, ChecklistItem, SourceWarning } from "@/lib/schema";
import type { SourceMeta } from "@/lib/sources";

interface ReportData {
  report: Report;
  sources: SourceMeta[];
  meta: {
    verifiedCount: number;
    totalEvidence: number;
    mock: boolean;
  };
}

export default function ReportPage() {
  const router = useRouter();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  // Side drawer state for evidence inspection
  const [selectedEvidence, setSelectedEvidence] = useState<{
    evidence: Evidence;
    sourceMeta?: SourceMeta;
  } | null>(null);

  // Checked state for checklist items
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("pmkisan_report_data");
      if (!stored) {
        router.replace("/");
        return;
      }
      const parsed: ReportData = JSON.parse(stored);
      if (!parsed || !parsed.report) {
        router.replace("/");
        return;
      }
      setData(parsed);
    } catch {
      router.replace("/");
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedEvidence) {
        setSelectedEvidence(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEvidence]);

  // Map of sources by ID for quick metadata lookup in evidence drawer
  const sourcesById = useMemo(() => {
    if (!data?.sources) return new Map<string, SourceMeta>();
    return new Map(data.sources.map((s) => [s.id, s]));
  }, [data]);

  // Summary counts
  const summary = useMemo(() => {
    if (!data?.report) {
      return {
        coveredCount: 0,
        missingCount: 0,
        conflictingCount: 0,
        warningCount: 0,
        verifiedPercent: 0,
      };
    }
    const topics = data.report.topics || [];
    const coveredCount = topics.filter((t) => t.status === "covered").length;
    const missingCount = topics.filter((t) => t.status === "missing").length;
    const conflictingCount = topics.filter((t) => t.status === "conflicting").length;
    const warningCount = data.report.sourceWarnings?.length || 0;

    const totalEv = data.meta?.totalEvidence ?? 0;
    const verEv = data.meta?.verifiedCount ?? 0;
    // Calculate verified percentage: (verified / total) * 100, or 0% when there is no evidence
    const verifiedPercent = totalEv > 0 ? Math.round((verEv / totalEv) * 100) : 0;

    return {
      coveredCount,
      missingCount,
      conflictingCount,
      warningCount,
      verifiedPercent,
    };
  }, [data]);

  // Earliest retrievedOn date from sources metadata
  const retrievedOnDate = useMemo(() => {
    if (!data?.sources || data.sources.length === 0) return null;
    return data.sources[0].retrievedOn || null;
  }, [data]);

  const toggleCheck = (idx: number) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const openEvidenceDrawer = (evidence: Evidence) => {
    const meta = sourcesById.get(evidence.sourceId);
    setSelectedEvidence({ evidence, sourceMeta: meta });
  };

  const closeEvidenceDrawer = () => {
    setSelectedEvidence(null);
  };

  if (loading || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading analysis findings...</p>
      </main>
    );
  }

  const { report } = data;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              ← Back to checker
            </Link>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
              Gap Checker Findings
            </h1>
          </div>
          <span className="self-start rounded-full bg-zinc-200/70 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 sm:self-auto">
            Generated: {new Date(report.generatedAt).toLocaleDateString()}
          </span>
        </div>

        {/* Section 1: Summary Strip */}
        <section aria-label="Summary strip" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Covered</div>
            <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {summary.coveredCount}
            </div>
            <div className="text-[11px] text-zinc-400">topics addressed</div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Missing</div>
            <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
              {summary.missingCount}
            </div>
            <div className="text-[11px] text-zinc-400">topics omitted</div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Possible conflicts</div>
            <div className="mt-1 text-2xl font-bold text-rose-600 dark:text-rose-400">
              {summary.conflictingCount}
            </div>
            <div className="text-[11px] text-zinc-400">source discrepancies</div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Source warnings</div>
            <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
              {summary.warningCount}
            </div>
            <div className="text-[11px] text-zinc-400">undated / outdated</div>
          </div>

          <div className="col-span-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:col-span-1 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Snippet verification</div>
            <div className="mt-1 text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {summary.verifiedPercent}%
            </div>
            <div className="text-[11px] text-zinc-400">
              {data.meta.verifiedCount}/{data.meta.totalEvidence} verified
            </div>
          </div>
        </section>

        {/* Collapsible: How to read this report */}
        <details className="group rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 transition">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <span className="flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400">ℹ️</span>
              How to read this report (Status chips &amp; labels guide)
            </span>
            <span className="text-xs text-zinc-400 transition-transform group-open:rotate-180">
              ▼
            </span>
          </summary>
          <div className="mt-4 border-t border-zinc-100 pt-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-300 space-y-3">
            <div>
              <h4 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-1">Status Chips</h4>
              <ul className="space-y-1 pl-1">
                <li>
                  <strong className="text-emerald-700 dark:text-emerald-400">Covered:</strong> The requirement or topic is consistently documented in the reviewed sources with factual citations.
                </li>
                <li>
                  <strong className="text-amber-700 dark:text-amber-400">Not found in sources reviewed:</strong> The topic was not found in the reviewed documents, representing an information gap to verify independently.
                </li>
                <li>
                  <strong className="text-rose-700 dark:text-rose-400">Possible conflict:</strong> Contrasting statements, deadlines, or rules were detected between sources (e.g. between official guidelines and secondary summaries).
                </li>
                <li>
                  <strong className="text-zinc-700 dark:text-zinc-300">Unclear:</strong> The topic is mentioned ambiguously or with insufficient detail to determine criteria satisfaction.
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-1">Label Chips</h4>
              <ul className="space-y-1 pl-1">
                <li>
                  <strong className="text-blue-700 dark:text-blue-400">From source:</strong> Directly supported by exact quoted evidence from a referenced document.
                </li>
                <li>
                  <strong className="text-purple-700 dark:text-purple-400">AI suggestion:</strong> Advisory insight synthesized to help guide follow-up steps.
                </li>
                <li>
                  <strong className="text-zinc-700 dark:text-zinc-300">Uncertain:</strong> Flagged when sources leave reasonable doubt or ambiguity.
                </li>
              </ul>
            </div>
          </div>
        </details>

        {/* Section 2: Your profile vs official criteria */}
        <section className="space-y-4">
          <div className="border-b border-zinc-200 pb-2 dark:border-zinc-800">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Your profile vs official criteria
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Evaluated against requirements directly found in official PM-KISAN reference sources.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {report.profileMatches.map((pm: ProfileMatch, idx: number) => {
              const chipConfig = {
                seems_to_match: {
                  label: "Seems to match",
                  style: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60",
                },
                may_not_match: {
                  label: "May not match",
                  style: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60",
                },
                cannot_tell: {
                  label: "Cannot tell",
                  style: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
                },
              }[pm.result];

              return (
                <div
                  key={idx}
                  className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {pm.criterion}
                    </h3>
                    <span
                      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${chipConfig.style}`}
                    >
                      {chipConfig.label}
                    </span>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {pm.reason}
                  </p>

                  {pm.evidence && pm.evidence.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 pt-2">
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Evidence cited:
                      </span>
                      {pm.evidence.map((ev, eIdx) => (
                        <button
                          key={eIdx}
                          type="button"
                          onClick={() => openEvidenceDrawer(ev)}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-left text-xs font-medium text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-900 dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40"
                          title="Click or press enter to view snippet and verification details"
                        >
                          <span className="shrink-0 text-emerald-600 dark:text-emerald-400">🔍</span>
                          <span className="truncate">
                            [{ev.sourceId}] “{ev.snippet.slice(0, 50)}...”
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 3: Topic findings */}
        <section className="space-y-4">
          <div className="border-b border-zinc-200 pb-2 dark:border-zinc-800">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Topic findings
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Analysis across official guidelines and comparative unofficial materials.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {report.topics.map((tf: TopicFinding, idx: number) => {
              const statusChip = {
                covered: {
                  label: "Covered",
                  style: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60",
                },
                missing: {
                  label: "Not found in sources reviewed",
                  style: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60",
                },
                conflicting: {
                  label: "Possible conflict",
                  style: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60",
                },
                unclear: {
                  label: "Unclear",
                  style: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
                },
              }[tf.status];

              const labelChip = {
                sourced: {
                  label: "From source",
                  style: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60",
                },
                ai_suggestion: {
                  label: "AI suggestion",
                  style: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60",
                },
                uncertain: {
                  label: "Uncertain",
                  style: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
                },
              }[tf.label];

              return (
                <div
                  key={idx}
                  className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {tf.topic}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${statusChip.style}`}
                      >
                        {statusChip.label}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${labelChip.style}`}
                      >
                        {labelChip.label}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {tf.summary}
                  </p>

                  {tf.conflictNote && (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                      <span className="font-semibold">Conflict details:</span> {tf.conflictNote}
                    </div>
                  )}

                  {tf.evidence && tf.evidence.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Evidence cited:
                      </span>
                      {tf.evidence.map((ev, eIdx) => (
                        <button
                          key={eIdx}
                          type="button"
                          onClick={() => openEvidenceDrawer(ev)}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-left text-xs font-medium text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-900 dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40"
                          title="Click or press enter to view snippet and verification details"
                        >
                          <span className="shrink-0 text-emerald-600 dark:text-emerald-400">🔍</span>
                          <span className="truncate">
                            [{ev.sourceId}] “{ev.snippet.slice(0, 50)}...”
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 4: Source warnings */}
        <section className="space-y-4">
          <div className="border-b border-zinc-200 pb-2 dark:border-zinc-800">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Source warnings
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Signals indicating undated publication or potential staleness.
            </p>
          </div>

          {report.sourceWarnings.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              No date or staleness warnings detected for the reviewed sources.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {report.sourceWarnings.map((sw: SourceWarning, idx: number) => {
                const srcMeta = sourcesById.get(sw.sourceId);
                const title = srcMeta?.title || sw.sourceId;
                const isUndated = sw.kind === "undated";

                return (
                  <div
                    key={idx}
                    className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:flex-row sm:items-start sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/30"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {title}
                        </span>
                        <span className="rounded bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:bg-amber-900/80 dark:text-amber-200">
                          {isUndated ? "Undated" : "Possibly outdated"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
                        {sw.message}
                      </p>
                    </div>

                    {srcMeta?.url && srcMeta.url.startsWith("http") && (
                      <a
                        href={srcMeta.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                      >
                        Check source →
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 5: Verify next */}
        <section className="space-y-4">
          <div className="border-b border-zinc-200 pb-2 dark:border-zinc-800">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Verify next
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Prioritized checklist of recommended verification actions.
            </p>
          </div>

          <div className="space-y-3">
            {report.checklist.map((item: ChecklistItem, idx: number) => {
              const priorityStyle = {
                high: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900/50",
                medium: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900/50",
                low: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
              }[item.priority];

              const isChecked = !!checkedItems[idx];

              return (
                <div
                  key={idx}
                  role="checkbox"
                  aria-checked={isChecked}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggleCheck(idx);
                    }
                  }}
                  onClick={() => toggleCheck(idx)}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    isChecked
                      ? "border-zinc-200 bg-zinc-100/60 opacity-60 dark:border-zinc-800 dark:bg-zinc-900/40"
                      : "border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    tabIndex={-1}
                    onChange={() => toggleCheck(idx)}
                    className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800"
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${priorityStyle}`}
                      >
                        {item.priority}
                      </span>
                      {item.relatedTopic && (
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          Topic: {item.relatedTopic}
                        </span>
                      )}
                    </div>
                    <div
                      className={`mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100 ${
                        isChecked ? "line-through text-zinc-500 dark:text-zinc-500" : ""
                      }`}
                    >
                      {item.action}
                    </div>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      {item.reason}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 6: Footer */}
        <footer className="border-t border-zinc-200 pt-6 pb-12 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 space-y-2">
          <p>
            Information-checking tool. Findings are potential gaps and signals, not facts. Confirm on the{" "}
            <a
              href="https://pmkisan.gov.in"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-600 underline underline-offset-2 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              official portal
            </a>
            .
          </p>
          {retrievedOnDate && (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              Source snapshots taken on {retrievedOnDate}
            </p>
          )}
        </footer>
      </div>

      {/* Side Drawer for Evidence Details */}
      {selectedEvidence && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Evidence details drawer"
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity"
        >
          {/* Backdrop click dismiss */}
          <div className="fixed inset-0" onClick={closeEvidenceDrawer} />

          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-2xl dark:bg-zinc-900">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                Evidence Details
              </h3>
              <button
                type="button"
                autoFocus
                onClick={closeEvidenceDrawer}
                aria-label="Close drawer"
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="mt-5 space-y-5">
              {/* Source Info */}
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Source Reference
                </span>
                <h4 className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedEvidence.sourceMeta?.title || selectedEvidence.evidence.sourceId}
                </h4>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {selectedEvidence.sourceMeta?.type && (
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                        selectedEvidence.sourceMeta.type === "official"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                      }`}
                    >
                      {selectedEvidence.sourceMeta.type === "official" ? "Official" : "Unofficial"}
                    </span>
                  )}

                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Date: {selectedEvidence.sourceMeta?.date && selectedEvidence.sourceMeta.date !== "TODO"
                      ? selectedEvidence.sourceMeta.date
                      : "No date visible"}
                  </span>
                </div>

                {selectedEvidence.sourceMeta?.url && selectedEvidence.sourceMeta.url.startsWith("http") && (
                  <div className="mt-2">
                    <a
                      href={selectedEvidence.sourceMeta.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-emerald-600 underline underline-offset-2 hover:text-emerald-700 dark:text-emerald-400"
                    >
                      Open original source document ↗
                    </a>
                  </div>
                )}
              </div>

              {/* Verification status badge */}
              <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Verification Status
                </span>
                <div className="mt-1">
                  {selectedEvidence.evidence.verified ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60">
                      ✓ Found in source text
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60">
                      ✗ Could not verify in source text
                    </span>
                  )}
                </div>
              </div>

              {/* Exact Snippet */}
              <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Quoted Snippet
                </span>
                <blockquote className="mt-2 rounded-lg border-l-4 border-emerald-500 bg-zinc-50 p-3 text-xs leading-relaxed italic text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  “{selectedEvidence.evidence.snippet}”
                </blockquote>
              </div>
            </div>

            {/* Close Button */}
            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={closeEvidenceDrawer}
                className="w-full rounded-lg bg-zinc-200 py-2.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Close drawer (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

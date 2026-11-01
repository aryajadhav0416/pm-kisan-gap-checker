"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SourceMeta } from "@/lib/sources";
import type { Input } from "@/lib/schema";

export default function Home() {
  const router = useRouter();

  // Form state prefilled according to requirements
  const [question, setQuestion] = useState(
    "What should I verify before applying for PM-KISAN?"
  );
  const [state, setState] = useState("Maharashtra");
  const [ownsCultivableLand, setOwnsCultivableLand] = useState<
    "yes" | "no" | "unsure"
  >("yes");
  const [landSizeHectares, setLandSizeHectares] = useState<string>("1.2");
  const [occupation, setOccupation] = useState("Farmer");
  const [aadhaarLinkedBank, setAadhaarLinkedBank] = useState<
    "yes" | "no" | "unsure"
  >("yes");
  const [eKycDone, setEKycDone] = useState<"yes" | "no" | "unsure">("no");

  // Sources and submission state
  const [sources, setSources] = useState<SourceMeta[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSources() {
      try {
        const res = await fetch("/api/sources");
        if (!res.ok) {
          throw new Error(`Failed to fetch sources (${res.status})`);
        }
        const data: SourceMeta[] = await res.json();
        setSources(data);
      } catch (err: unknown) {
        setSourcesError(
          err instanceof Error ? err.message : "Error loading sources"
        );
      } finally {
        setSourcesLoading(false);
      }
    }
    fetchSources();
  }, []);

  const runAnalysis = async () => {
    setSubmitError(null);
    setAnalyzing(true);

    const payload: Input = {
      question: question.trim(),
      profile: {
        state: state.trim(),
        ownsCultivableLand,
        ...(landSizeHectares.trim() !== "" && !isNaN(Number(landSizeHectares))
          ? { landSizeHectares: Number(landSizeHectares) }
          : {}),
        occupation: occupation.trim(),
        aadhaarLinkedBank,
        eKycDone,
      },
    };

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Analysis failed");
      }

      // Save result in sessionStorage and navigate to /report
      if (typeof window !== "undefined") {
        sessionStorage.setItem("pmkisan_report_data", JSON.stringify(data));
      }
      router.push("/report");
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      setAnalyzing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runAnalysis();
  };

  const sourceCount = sources.length;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Title and Disclaimer */}
        <header className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-zinc-900 dark:text-zinc-50">
            PM-KISAN Gap Checker
          </h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Information-checking tool. Findings are potential gaps and signals,
            not facts. Confirm on the{" "}
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
        </header>

        {/* Error banner with Retry button if submission failed */}
        {submitError && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/60 dark:bg-red-950/50"
          >
            <div className="flex items-start gap-2.5">
              <span className="text-base text-red-600 dark:text-red-400">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                  Analysis could not be completed
                </p>
                <p className="text-xs text-red-700 dark:text-red-400">{submitError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={runAnalysis}
              disabled={analyzing}
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:opacity-60 dark:bg-red-700 dark:hover:bg-red-600"
            >
              {analyzing ? "Retrying..." : "Retry Analysis"}
            </button>
          </div>
        )}

        {/* Sources included Card */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Sources included
            </h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {sources.length > 0 ? `${sources.length} sources loaded` : "Loading sources..."}
            </span>
          </div>

          {sourcesLoading ? (
            <p className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Loading knowledge sources...
            </p>
          ) : sourcesError ? (
            <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-400">
              {sourcesError}
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {sources.map((src) => {
                const isOfficial = src.type === "official";
                const dateDisplay =
                  src.date && src.date !== "TODO"
                    ? src.date
                    : "No date visible";

                return (
                  <li
                    key={src.id}
                    className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                          isOfficial
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50"
                            : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50"
                        }`}
                      >
                        {isOfficial ? "Official" : "Unofficial"}
                      </span>
                      <a
                        href={src.url.startsWith("http") ? src.url : "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-zinc-800 hover:text-emerald-600 dark:text-zinc-200 dark:hover:text-emerald-400 underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-700"
                      >
                        {src.title}
                      </a>
                    </div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 sm:text-right">
                      {dateDisplay}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Main Input & Profile Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          {/* Research Question */}
          <div className="space-y-2">
            <label
              htmlFor="question"
              className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Research question
            </label>
            <textarea
              id="question"
              rows={3}
              required
              minLength={5}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What should I verify before applying for PM-KISAN?"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="border-t border-zinc-100 pt-5 dark:border-zinc-800">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Farmer Profile
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* State */}
              <div>
                <label
                  htmlFor="state"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  State
                </label>
                <input
                  id="state"
                  type="text"
                  required
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* Occupation */}
              <div>
                <label
                  htmlFor="occupation"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Occupation
                </label>
                <input
                  id="occupation"
                  type="text"
                  required
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* Owns cultivable land */}
              <div>
                <label
                  htmlFor="ownsCultivableLand"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Owns cultivable land
                </label>
                <select
                  id="ownsCultivableLand"
                  value={ownsCultivableLand}
                  onChange={(e) =>
                    setOwnsCultivableLand(
                      e.target.value as "yes" | "no" | "unsure"
                    )
                  }
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                  <option value="unsure">Unsure</option>
                </select>
              </div>

              {/* Land size in hectares (optional) */}
              <div>
                <label
                  htmlFor="landSize"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Land size (hectares, optional)
                </label>
                <input
                  id="landSize"
                  type="number"
                  step="any"
                  min="0"
                  value={landSizeHectares}
                  onChange={(e) => setLandSizeHectares(e.target.value)}
                  placeholder="e.g. 1.5"
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* Aadhaar-linked bank account */}
              <div>
                <label
                  htmlFor="aadhaarBank"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Aadhaar-linked bank account
                </label>
                <select
                  id="aadhaarBank"
                  value={aadhaarLinkedBank}
                  onChange={(e) =>
                    setAadhaarLinkedBank(
                      e.target.value as "yes" | "no" | "unsure"
                    )
                  }
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                  <option value="unsure">Unsure</option>
                </select>
              </div>

              {/* e-KYC done */}
              <div>
                <label
                  htmlFor="eKycDone"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  e-KYC done
                </label>
                <select
                  id="eKycDone"
                  value={eKycDone}
                  onChange={(e) =>
                    setEKycDone(e.target.value as "yes" | "no" | "unsure")
                  }
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                  <option value="unsure">Unsure</option>
                </select>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={analyzing}
              className="flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            >
              {analyzing ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Reading {sourceCount > 0 ? `${sourceCount} sources` : "sources"}...
                </span>
              ) : (
                "Analyze"
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

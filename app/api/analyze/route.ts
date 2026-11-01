import { NextRequest, NextResponse } from "next/server";
import { InputSchema, ReportSchema, type Report } from "@/lib/schema";
import { loadSources, type SourceMeta } from "@/lib/sources";
import { TOPICS } from "@/lib/topics";
import { buildPrompt } from "@/lib/prompt";
import { callModel } from "@/lib/llm";
import { verifyReport } from "@/lib/verifySnippets";
import { computeSourceWarnings } from "@/lib/staleness";

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    // Step 1: Validate input with InputSchema
    const parseResult = InputSchema.safeParse(body);
    if (!parseResult.success) {
      const issueMessages = parseResult.error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ");
      return NextResponse.json(
        { error: `Invalid request payload: ${issueMessages}` },
        { status: 400 }
      );
    }

    const input = parseResult.data;

    // Step 2: loadSources() with diagnostic logging
    let sources;
    try {
      sources = loadSources();
      console.log(
        `[analyze] Sources loaded successfully: ${sources.length} sources (${sources
          .map((s) => `${s.id}: ${s.text.length} chars`)
          .join(", ")})`
      );
    } catch (sourceErr: unknown) {
      const msg = sourceErr instanceof Error ? sourceErr.message : String(sourceErr);
      console.error(`[analyze] Failed to load sources: ${msg}`);
      throw sourceErr;
    }

    // Step 3: buildPrompt and callModel
    const messages = buildPrompt(input, sources, TOPICS);
    const llmOutput = await callModel(messages);

    // Step 4: computeSourceWarnings
    const sourceWarnings = computeSourceWarnings(sources);

    // Initial report structure following ReportSchema
    const initialReport: Report = {
      ...llmOutput,
      sourceWarnings,
      generatedAt: new Date().toISOString(),
    };

    // Step 5: verifyReport with diagnostics
    const sourcesById: Record<string, string> = Object.fromEntries(
      sources.map((s) => [s.id, s.text])
    );
    const { report: verifiedReport, stats } = verifyReport(
      initialReport,
      sourcesById
    );

    console.log(
      `[analyze] Evidence verification: ${stats.verified}/${stats.total} verified (${stats.unverified} unverified)`
    );
    if (stats.unverifiedDetails && stats.unverifiedDetails.length > 0) {
      stats.unverifiedDetails.forEach((u, i) => {
        console.log(
          `[analyze] Unverified #${i + 1}: [${u.sourceId}] Reason: ${u.reason} | Snippet: "${u.snippet.slice(0, 80)}"`
        );
      });
    }

    // Validate verifiedReport against ReportSchema
    const validatedReport = ReportSchema.parse(verifiedReport);

    // Step 6: Format sources metadata without full text
    const sourcesMeta: SourceMeta[] = sources.map(
      ({ id, title, url, type, date, retrievedOn, file }) => ({
        id,
        title,
        url,
        type,
        date,
        retrievedOn,
        file,
      })
    );

    // Return JSON { report, sources, meta }
    return NextResponse.json({
      report: validatedReport,
      sources: sourcesMeta,
      meta: {
        verifiedCount: stats.verified,
        totalEvidence: stats.total,
        mock: process.env.MOCK_LLM === "true",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { describe, it, expect } from "vitest";
import { selectExcerpts, estimateTokens, TOPIC_KEYWORDS } from "./excerpts";
import { buildPrompt } from "./prompt";
import { TOPICS } from "./topics";
import type { Source } from "./sources";

// ---------------------------------------------------------------------------
// Shared fixture: minimal in-memory sources
// ---------------------------------------------------------------------------

const OFFICIAL_TEXT = `
Pradhan Mantri Kisan Samman Nidhi (PM-KISAN) provides financial support to eligible farmer families owning cultivable land as per land records.

The scheme offers Rs. 6000 per year in three equal instalments of Rs. 2000 each through Direct Benefit Transfer (DBT).

e-KYC is mandatory for all PM-KISAN beneficiaries. Farmers who have not completed e-KYC may not receive the instalment.

Institutional landholders are not eligible under the scheme. Families with members holding constitutional posts are excluded.

Documents required include: Aadhaar card for identity verification, bank account details with IFSC code, land ownership record such as Khata or Khasra.

For grievance redressal, farmers may contact the PM-KISAN helpline at 1800 115 526 or email pmkisan-ict@gov.in.

Farmers can check their beneficiary status on the official portal. The instalment payment status can be verified online.

To apply, visit the Farmers Corner on the official PM-KISAN portal and click New Farmer Registration. Complete e-KYC using OTP or biometric authentication at a Common Service Centre (CSC).

For updating or correcting details such as bank details or Aadhaar mismatch, contact the local revenue office or use the self-registration portal.
`.trim();

const UNOFFICIAL_TEXT = `
PM Kisan scheme is an income assistance scheme for land-holding farmer families in India.

Eligible farmers receive Rs. 6,000 annually in two instalments. This differs from the official three-instalment structure.

e-KYC and Aadhaar-seeding of bank accounts are mandatory for Direct Benefit Transfer.

Documents required for PM-Kisan registration: Aadhaar card, bank account details, land ownership record, mobile number.
`.trim();

function makeSource(
  id: string,
  type: "official" | "unofficial",
  text: string
): Source {
  return { id, title: id, url: "https://example.com", type, date: null, retrievedOn: "2026-10-31", file: `${id}.txt`, text };
}

const officialSrc = makeSource("official-src", "official", OFFICIAL_TEXT);
const unofficialSrc = makeSource("unofficial-src", "unofficial", UNOFFICIAL_TEXT);
const sources: Source[] = [officialSrc, unofficialSrc];

// ---------------------------------------------------------------------------
// 1. Excerpt selection returns one entry per source
// ---------------------------------------------------------------------------
describe("selectExcerpts — structure", () => {
  it("returns one SourceExcerpt per source", () => {
    const excerpts = selectExcerpts(sources, TOPICS);
    expect(excerpts).toHaveLength(sources.length);
    expect(excerpts.map((e) => e.id)).toEqual(sources.map((s) => s.id));
  });

  it("preserves source metadata (type, date, url)", () => {
    const excerpts = selectExcerpts(sources, TOPICS);
    const off = excerpts.find((e) => e.id === "official-src")!;
    expect(off.type).toBe("official");
    expect(off.date).toBeNull();
    expect(off.url).toBe("https://example.com");
  });
});

// ---------------------------------------------------------------------------
// 2. Paragraphs are real text — no paraphrasing
// ---------------------------------------------------------------------------
describe("selectExcerpts — no invented content", () => {
  it("every returned paragraph is a substring of the original source text", () => {
    const excerpts = selectExcerpts(sources, TOPICS);
    for (const exc of excerpts) {
      const src = sources.find((s) => s.id === exc.id)!;
      for (const para of exc.paragraphs) {
        // The paragraph (after whitespace normalisation used internally)
        // must appear in the source (using a relaxed check across newline collapsing)
        const normSrc = src.text.replace(/\n/g, " ").replace(/\s{2,}/g, " ");
        const normPara = para.replace(/\n/g, " ").replace(/\s{2,}/g, " ");
        expect(normSrc).toContain(normPara);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Relevant paragraphs are selected for key topics
// ---------------------------------------------------------------------------
describe("selectExcerpts — relevance", () => {
  it("official source includes a paragraph relevant to Eligibility", () => {
    const excerpts = selectExcerpts(sources, TOPICS);
    const off = excerpts.find((e) => e.id === "official-src")!;
    const eligibilityKw = TOPIC_KEYWORDS["Eligibility"];
    const hasEligibility = off.paragraphs.some((p) =>
      eligibilityKw.some((kw) => p.toLowerCase().includes(kw))
    );
    expect(hasEligibility).toBe(true);
  });

  it("official source includes a paragraph relevant to e-KYC", () => {
    const excerpts = selectExcerpts(sources, TOPICS);
    const off = excerpts.find((e) => e.id === "official-src")!;
    const kycKw = TOPIC_KEYWORDS["e-KYC"];
    const hasKyc = off.paragraphs.some((p) =>
      kycKw.some((kw) => p.toLowerCase().includes(kw))
    );
    expect(hasKyc).toBe(true);
  });

  it("official source includes a paragraph relevant to helpline/grievance", () => {
    const excerpts = selectExcerpts(sources, TOPICS);
    const off = excerpts.find((e) => e.id === "official-src")!;
    const kw = TOPIC_KEYWORDS["Helpline and grievance"];
    const found = off.paragraphs.some((p) =>
      kw.some((k) => p.toLowerCase().includes(k))
    );
    expect(found).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Token budget: full prompt stays below 7 000 tokens
// ---------------------------------------------------------------------------
describe("buildPrompt — token budget", () => {
  const sampleInput = {
    question: "Am I likely to receive PM-KISAN instalments and what documents do I need?",
    profile: {
      state: "Maharashtra",
      ownsCultivableLand: "yes" as const,
      landSizeHectares: 1.2,
      occupation: "Farmer",
      aadhaarLinkedBank: "yes" as const,
      eKycDone: "no" as const,
    },
  };

  it("total prompt is under 7 000 tokens", () => {
    const [system, user] = buildPrompt(sampleInput, sources, TOPICS);
    const totalChars = system.content.length + user.content.length;
    // Use conservative 3.5 chars/token (English prose) rather than 4
    const estimatedTokens = Math.ceil(totalChars / 3.5);
    expect(estimatedTokens).toBeLessThan(7_000);
    // Also report for debugging
    console.log(`Prompt size: ${totalChars} chars ≈ ${estimatedTokens} tokens (at 3.5 ch/tok)`);
  });

  it("user message contains all source IDs", () => {
    const [, user] = buildPrompt(sampleInput, sources, TOPICS);
    for (const src of sources) {
      expect(user.content).toContain(`id: ${src.id}`);
    }
  });

  it("user message contains source type labels", () => {
    const [, user] = buildPrompt(sampleInput, sources, TOPICS);
    expect(user.content).toContain("type: official");
    expect(user.content).toContain("type: unofficial");
  });
});

// ---------------------------------------------------------------------------
// 5. Budget holds with the full real-world sources (if loaded)
// ---------------------------------------------------------------------------
describe("selectExcerpts — budget with large sources", () => {
  it("total excerpt characters across all sources stay within budget", () => {
    const excerpts = selectExcerpts(sources, TOPICS);
    const totalChars = excerpts
      .flatMap((e) => e.paragraphs)
      .reduce((sum, p) => sum + p.length, 0);
    // 13 000 char budget + margin for source headers
    expect(totalChars).toBeLessThan(14_000);
  });
});

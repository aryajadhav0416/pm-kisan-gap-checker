# PM-KISAN Gap Checker

**An AI-assisted information gap detector for PM-KISAN.** Instead of just summarizing what the sources say, it tells you what the sources do *not* say, where they may disagree, which ones look undated or old, and what you should verify next.

Built for the **Shinchan Online Hackathon 2026** (organizer: DEVENGERS), problem statement **Digital Dark Spot: AI-Assisted Information Gap Detection Platform**. Individual entry by Arya Jadhav.

> **Disclaimer:** This is an information-checking tool, not an official service. Findings are *potential gaps and signals*, not facts, and the tool never decides whether someone is eligible. Always confirm details on the official PM-KISAN portal (https://pmkisan.gov.in).

**Live demo:** https://pm-kisan-gap-checker.vercel.app (uses the 3 official sources; the Angel One pages are not bundled)

---

## 1. The problem

People depend on online information to apply for government schemes, but that information is scattered across official PDFs, portals and third-party explainers. Sources can be outdated, can differ from each other, or can leave important questions unanswered. Search tools help you *find* information and summarizers condense what is *there*, but neither tells you **what is missing or needs checking**.

## 2. The solution

The user enters a research question and a short profile (state, land holding, occupation, Aadhaar-linked bank account, e-KYC status). The app reviews a fixed set of sources about PM-KISAN and produces a report that shows:

- **Profile vs. official criteria:** each criterion is marked *seems to match*, *may not match* or *cannot tell*.
- **Topic findings:** for 9 fixed PM-KISAN topics, whether each is *covered*, *not found in sources reviewed*, a *possible conflict*, or *unclear*, with evidence.
- **Source warnings:** sources with no visible date, or that may be outdated.
- **Verify-next checklist:** prioritized actions, always ending with confirming everything on the official portal.
- **Evidence you can inspect:** every finding links to a source ID and an exact snippet, and each snippet is checked against the original source text.

The tool is deliberately careful with wording. It uses phrases like "seems to match" and "possible conflict" and never says "eligible" or "not eligible".

## 3. How it works

```
Research question + profile
          |
          v
 Load 5 sources (data/sources.json + text files)
          |
          v
 Select relevant excerpts per topic (keyword scoring, fits free-tier token limits)
          |
          v
 Build prompt -> LLM (Gemini / OpenAI / Groq, or mock mode)
          |
          v
 Validate JSON output with zod (retry once with the error if invalid)
          |
          v
 Verify every evidence snippet against the original source text
          |
          v
 Add staleness warnings (rule-based, not AI)
          |
          v
 Report: profile match, topic findings, warnings, verify-next checklist
```

### The 9 fixed topics

Eligibility, Exclusions, Documents required, e-KYC, Benefit amount and instalments, How to apply, Status check, Helpline and grievance, Updating or correcting details.

### Sources used

Three official and two unofficial sources about PM-KISAN:

| ID | Type | Description |
|---|---|---|
| `guidelines-revised` | official | PM-KISAN Revised Operational Guidelines (pmkisan.gov.in) |
| `faq-revised` | official | PM-KISAN Revised FAQ (pmkisan.gov.in) |
| `myscheme` | official | myScheme page for PM-KISAN (myscheme.gov.in) |
| `angelone-documents` | unofficial | Angel One explainer on documents required |
| `angelone-eligibility` | unofficial | Angel One explainer on eligibility |

Official sources are treated as the reference. The unofficial ones are compared against them. URLs, dates and retrieval dates are recorded in [`data/sources.json`](data/sources.json). The sources are **snapshots** taken at the retrieval date, so they may have changed on the original sites.

## 4. Key features and design choices

- **Gap detection, not just summarization:** every topic gets an explicit status, including "not found in sources reviewed".
- **Evidence you can trace:** each finding cites a `sourceId` and an exact snippet. After the model answers, the app checks each snippet against the original text (case, spacing, quotes and dashes are normalized) and flags any it cannot find.
- **Official-first comparison:** the profile is compared only against criteria found in official sources.
- **Labelled output:** findings are marked as *from source*, *AI suggestion* or *uncertain*.
- **Rule-based staleness checks:** a source with no date is flagged as undated. A source more than 12 months older than the newest dated source (or more than 12 months before today) is flagged as possibly outdated. This is plain code, so it does not depend on the AI.
- **Strict output validation:** responses are validated with zod. On a validation failure the model is retried once with the error attached.
- **Works within free-tier limits:** the full source text is about 66,000 characters. A keyword-based excerpt selector picks the most relevant paragraphs for each topic, which brought the source text in the prompt down to roughly 14,000 characters while keeping original wording, source IDs, types and dates. If relevant evidence cannot fit, the topic is reported as unclear instead of being invented.
- **Multiple LLM providers:** Gemini, OpenAI and Groq, plus a mock mode that needs no API key.
- **Privacy:** no database, and the profile is not stored or logged.

## 5. Tech stack

- Next.js (App Router), TypeScript, Tailwind CSS
- zod for schema validation
- vitest for unit tests, tsx for scripts
- LLM SDKs: `@google/genai`, `openai`, `groq-sdk`; `dotenv` for configuration

## 6. Setup

**Requirements:** Node.js 18 or newer and npm.

```bash
git clone https://github.com/aryajadhav0416/pm-kisan-gap-checker.git
cd pm-kisan-gap-checker
npm install
cp .env.example .env
```

Edit `.env`:

```
LLM_PROVIDER=groq        # gemini, openai or groq
LLM_API_KEY=your_key_here
LLM_MODEL=model_name     # a model available on your provider
MOCK_LLM=false           # true = use sample output, no key needed
```

To try the app **without any API key**, set `MOCK_LLM=true`. The mock data uses clearly fake snippets, so snippet verification will mark them as unverified, which is expected.

### Source files

The official source texts are included in `data/sources/`. The two Angel One text files are **not included** in the repository, because they are a private company's article text. To use them:

1. Open the Angel One URLs listed in `data/sources.json`.
2. Copy each page's text into `data/sources/angelone-documents.txt` and `data/sources/angelone-eligibility.txt`.
3. Check everything is in place:

```bash
npm run check:sources
```

This prints one row per source (ID, type, date, character count, status). A source shows `PLACEHOLDER` or an error if its text file is empty, still the placeholder, or shorter than 500 characters.

### Run

```bash
npm run dev
```

Open http://localhost:3000, enter a question and profile, and run the analysis. A real-model analysis can take up to about a minute, depending on the provider and model.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app |
| `npm test` | Run unit tests |
| `npx tsc --noEmit` | Type-check |
| `npm run check:sources` | Check source files and metadata |
| `npm run test:llm` | Smoke-test the LLM call with the loaded sources and print a summary |

## 7. Project structure

```
app/               Next.js pages and API route
lib/
  schema.ts        zod schemas and types (input, findings, report)
  topics.ts        the 9 fixed topics
  sources.ts       loads sources.json and the source text files
  excerpts.ts      relevant-excerpt selection and token budgeting
  prompt.ts        builds the system and user messages
  llm.ts           Gemini / OpenAI / Groq calls, retry, mock mode
  verifySnippets.ts  checks evidence snippets against source text
  staleness.ts     undated / possibly outdated warnings
data/
  sources.json     source metadata
  sources/         source text files
  mock-output.json sample output for mock mode
scripts/           check-sources.ts, test-llm.ts
PROJECT_CONTEXT.md Project rules used while building
```

## 8. Limitations

- Findings are **potential gaps and signals**, not verified facts. The AI can miss things or be wrong, which is why every finding shows its evidence.
- The report covers **one scheme (PM-KISAN)** and **five fixed sources**. The sources are snapshots and may be outdated by the time you read this.
- Excerpt selection is keyword-based, so it can miss a relevant passage that uses unusual wording.
- Source dates are recorded by hand in `sources.json`. Where a page shows no date, the source is flagged as undated.
- Free-tier providers have token and rate limits, and responses can be slow.
- The tool does not decide eligibility and is not an official government service.

## 9. Future scope

- Let users add their own URLs or paste source text, and fetch pages automatically.
- Cover more schemes (pension, housing, small business) using the same engine.
- Automatically extract publication dates from pages and PDFs.
- Replace keyword excerpt selection with semantic search.
- Hindi and Marathi support.
- Cache results and deploy a hosted demo.

## 10. Attribution

Source text comes from official PM-KISAN documents and pages and from the third-party explainers listed above, each linked in `data/sources.json`. All rights remain with the original publishers.

# PM-KISAN Gap Checker — Project Context

**Event:** Shinchan Online Hackathon 2026
**Problem Statement:** Digital Dark Spot — AI-assisted information gap detection

---

## Purpose

Given a research question, a user profile, and 4 sources about PM-KISAN, the tool shows:

- **(a)** Which official criteria the profile **seems to match**, **may not match**, or **cannot be judged**
- **(b)** Topics **missing** from the sources
- **(c)** Possible **conflicts** between sources
- **(d)** **Undated or possibly outdated** sources
- **(e)** A **prioritized verify-next checklist**

---

## Rules

1. **Never present findings as facts.** Use wording like *"seems to match"*, *"may not match"*, *"cannot tell"*, *"possible conflict"*, *"not found in sources reviewed"*. Never say *"eligible"* or *"not eligible"*.

2. **Every finding must cite a `sourceId` and an exact snippet** copied from that source's text.

3. **Official sources are the reference.** Unofficial sources are compared against them.

4. **API keys only in `.env.local`** and only used server-side. Never hardcode keys.

5. **Do not store user profile data anywhere** (no database, no logs).

6. **Never invent source content.** Source text files are provided by the user.

7. **Stack:** Next.js App Router, TypeScript, Tailwind, `zod` for validation, `vitest` for tests.

8. **Keep changes small.** Only touch files needed for the current task.

# specmatch — Truthful Job‑Matcher (MVP)

> **Goal:** Given a Job Description (JD) and a user’s self‑reported skills/experience, produce **job‑specific, truthful** application assets (tailored resume bullets, cover letter, key talking points, risk flags) optimized for **ATS + recruiter skim** — **never fabricating** experience.

---

## ✨ Why specmatch?

* Most AI cover letters **hallucinate** and **overpromise**. Recruiters detect fluff.
* specmatch forces **evidence‑backed** claims: every bullet must tie to a real project/skill the user provided.
* Output is concise, JD‑aligned, and **interview‑ready** (includes gaps/risks + mitigations).

---

## 🧩 Core Features (MVP)

* **JD Parser**: Extracts title, must‑haves, nice‑to‑haves, responsibilities, ATS keywords.
* **Candidate Profiler**: Structured profile from user input (skills, stacks, projects, quantifiable wins, constraints).
* **Truth Engine**: Aligns JD requirements to user evidence. **No evidence ⇒ no claim.**
* **Generators**:

  * Tailored **resume bullets** (STAR‑style, metric‑first)
  * **Cover letter** (≤ 180 words)
  * **Why me / Talking points** (3–5 bullets)
  * **Gaps & Risk flags** with mitigation suggestions
* **Scoring**: Fit score with transparent rationale (exact matches, adjacent skills, gaps).
* **Export**: JSON + Markdown blocks ready for copy‑paste.

---

## 🔭 Non‑Goals (MVP)

* Auto‑apply, scraping, or multi‑site orchestration.
* PDF rendering and full resume rewrite.
* Long‑term profile enrichment.

---

## 🏗️ Architecture (MVP)

```
Next.js API (TypeScript)
├─ /api/match (core endpoint)
│   ├─ jd-parser.ts        # heuristics + LLM assist
│   ├─ profile-parser.ts   # strict schema + validation (zod)
│   ├─ aligner.ts          # evidence ↔ requirement mapping
│   ├─ truth-guard.ts      # “no evidence, no claim” rules
│   ├─ generators/
│   │   ├─ bullets.ts      # metric-first STAR bullets
│   │   ├─ cover-letter.ts # ≤180w
│   │   └─ talking.ts
│   ├─ scoring.ts          # transparent fit score
│   └─ formatters.ts       # JSON & Markdown
└─ ui/ (optional minimal UI)
```

* **LLM layer**: OpenAI compatible (function‑calling), with **system prompts** enforcing honesty & evidence linking.
* **Persistence**: Not required for MVP; in‑memory. (Adapters ready for SQLite/Supabase if needed.)
* **Testing**: Jest + snapshot tests for prompt outputs; rule tests for truth guard.

---

## 📦 Data Schemas

```ts
// Job Description (normalized)
export type JobSpec = {
  title: string
  seniority?: "junior"|"mid"|"senior"|"lead"|"principal"
  responsibilities: string[]
  mustHaves: string[]           // hard requirements
  niceToHaves: string[]
  keywords: string[]            // ATS keywords
  location?: string
  employmentType?: string       // full-time, contract, etc.
};

// Candidate profile (user-provided, validated)
export type CandidateProfile = {
  name?: string
  title?: string
  years?: number
  skills: string[]              // canonical skills (e.g., React, PHP, Tailwind)
  tools?: string[]
  industries?: string[]
  projects: Array<{
    name: string
    summary: string
    skills: string[]            // skills demonstrated here
    outcomes?: string[]         // quantified wins
    links?: string[]
  }>
  constraints?: string[]        // e.g., relocation, time zone, visas
};

// Evidence unit used by Truth Engine
export type Evidence = {
  skill: string
  project?: string
  snippet: string               // concrete description to cite
  metric?: string               // e.g., +18% conversion
}

// Final package
export type MatchOutput = {
  fitScore: number              // 0..100
  rationale: string[]           // why the score
  bullets: string[]             // resume bullets
  coverLetter: string
  talkingPoints: string[]
  risks: Array<{gap: string, mitigation: string}>
  trace: Array<{requirement: string, matched: Evidence[]}> // transparency
};
```

---

## 🔒 Truth Guard (Rules)

1. **No Evidence ⇒ No Claim.**
2. **Verbatim Mapping**: Each bullet must reference at least one `Evidence` item.
3. **Hedging**: If adjacent skill (e.g., Vue vs React), mark as **adjacent** and propose a mitigation plan.
4. **Quantification**: Prefer metrics from user; if absent, use neutral framing (scope/scale) — never invent numbers.
5. **Tone**: Concise, specific, no buzzwords.

---

## 🧠 Prompt Contracts (LLM)

**System**

```
You write job application assets that are TRUE and EVIDENCE-BASED.
- Use only skills/projects supplied in CandidateProfile.
- If a requirement lacks evidence, either (a) suggest a mitigation, or (b) propose a learning plan.
- Never invent metrics, employers, dates, or titles.
- Output MUST include a `trace` mapping each requirement to the evidence used.
```

**Function Signature**

```json
{
  "name": "build_match_output",
  "parameters": {
    "type": "object",
    "properties": {
      "fitScore": {"type":"number"},
      "rationale": {"type":"array", "items":{"type":"string"}},
      "bullets": {"type":"array", "items":{"type":"string"}},
      "coverLetter": {"type":"string"},
      "talkingPoints": {"type":"array", "items":{"type":"string"}},
      "risks": {"type":"array", "items":{"type":"object", "properties": {"gap": {"type":"string"}, "mitigation": {"type":"string"}}}},
      "trace": {"type":"array", "items":{"type":"object", "properties": {"requirement": {"type":"string"}, "matched": {"type":"array", "items":{"type":"object", "properties": {"skill":{"type":"string"}, "project":{"type":"string"}, "snippet":{"type":"string"}, "metric":{"type":"string"}}}}}}}
    },
    "required": ["fitScore","rationale","bullets","coverLetter","talkingPoints","risks","trace"]
  }
}
```

---

## 🧪 Scoring (transparent)

* +3 per must‑have matched (capped)
* +1 per nice‑to‑have matched
* −2 per must‑have gap
* +0..5 bonus for quantified impact
* Normalize to 0–100; include bullet‑point rationale.

---

## 🖥️ API

### `POST /api/match`

**Body**

```json
{
  "jobSpecRaw": "<paste JD>",
  "candidateProfileRaw": "<paste skills/projects>"
}
```

**Response** → `MatchOutput` (above)

**Notes**

* `jobSpecRaw` and `candidateProfileRaw` are parsed/validated server‑side; invalid inputs return 422 with reasons.

---

## ▶️ Quickstart (Local)

```bash
# 1) Clone
git clone https://github.com/yourname/specmatch
cd specmatch

# 2) Install
pnpm i  # or npm/yarn

# 3) Env
cp .env.example .env.local
# Set: OPENAI_API_KEY=...

# 4) Dev
pnpm dev
# POST to http://localhost:3000/api/match
```

**`.env.example`**

```
OPENAI_API_KEY=
OPENAI_BASE_URL=
MODEL=gpt-4o-mini
```

---

## 🧩 Minimal UI (optional)

* Two textareas (JD, Profile) + **Generate** button.
* Show Fit Score, bullets, cover letter, risks, trace (accordion).
* Copy buttons for each block.

---

## ✅ Example Outputs

**Bullets**

* Grew paywall trial‑start rate by **18%** by shipping A/B‑tested copy and CTA timing in a React + Next.js flow. *(Evidence: Paywall Builder project)*
* Built mobile‑first dashboards with **Tailwind** and **React**, improving time‑to‑insight for product ops. *(Evidence: Dashboards project)*

**Risks**

* **Gap:** No production Kubernetes
  **Mitigation:** Highlight Docker experience; propose 30‑60‑90 learning plan; focus on app‑layer delivery.

---

## 🧱 Testing

* **Rule tests** for Truth Guard.
* **Snapshot tests** for generators (stable formatting).
* **Red team set** of JDs to ensure no fabrication.

---

## 🗺️ Roadmap

* v0.1: Core API + minimal UI + tests
* v0.2: SQLite persistence + user history
* v0.3: Resume section composer (safe reuse of bullets)
* v0.4: Multi‑model fallback & cost controls

---

## 🤝 Contributing

PRs welcome. Open issues with a minimal repro. Please keep outputs **truthful** and **traceable**.

## 📄 License

MIT

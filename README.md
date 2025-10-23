# specmatch v2.0 — Truthful Resume Rewriter

specmatch v2.0 ingests a resume + job description, rewrites the resume truthfully for the target role, and surfaces an emoji-friendly, explainable fit breakdown. Upload a PDF, view the original and optimized versions side-by-side, and export the improved resume — all without inventing experience.

## ✨ Features
- **Instant rewrite**: `/api/rewrite-resume` produces a truthful, role-aware resume rewrite automatically after each run — no extra button click required.
- **Explainable scoring**: `/api/match` blends LLM reasoning with normalized keyword overlap to deliver balanced scores (🟢 fit, 💡 highlights, ⚠️ gaps, 🧭 verdict).
- **Dark mode UX**: Theme toggle (light/dark) with neutral/emerald palette, emoji callouts, and dual-column resume view for readability.
- **Resume export**: `/api/export-pdf` outputs a one-page PDF using the improved framing while preserving truthful evidence.
- **Mock-friendly**: If `OPENAI_API_KEY` is unset, the API routes return deterministic placeholder data so the UI flows without live calls.

## 🧱 Tech Stack
- Next.js 15 (App Router, TypeScript, Tailwind)
- shadcn/ui components (button, input, textarea, label, card, form, theme toggle)
- `react-hook-form` + `@hookform/resolvers` for controlled forms
- OpenAI Node SDK (chat completions with JSON schema)
- `zod` schemas shared between client and server
- `pdf-parse` for resume extraction, `pdfkit` for PDF generation

## 📁 Key Directories
```
src/
├─ app/
│  ├─ page.tsx                  # Target role flow, resume rewrite + breakdown UI
│  └─ api/
│     ├─ parse-pdf/route.ts     # PDF → CandidateProfile (OpenAI-backed)
│     ├─ match/route.ts         # Truth-guarded JD ↔ profile matcher
│     ├─ export-pdf/route.ts    # Resume PDF generator
│     └─ rewrite-resume/route.ts# Truthful resume rewrite engine
├─ components/ui/               # shadcn/ui components, theme toggle, barrel exports
├─ lib/
│  ├─ normalizers.ts            # Sanitizers for profiles and job specs
│  ├─ pdf.ts                    # pdfkit resume layout helper
│  └─ truth-guard.ts            # Prompt contract for OpenAI matching
└─ types/index.ts               # Zod schemas + shared TypeScript types
```

## ⚙️ Setup
1. **Install dependencies**
   ```bash
   pnpm install
   ```
2. **Configure environment**
   ```bash
   cp .env.example .env.local
   # fill in OPENAI_API_KEY if you want live completions
   ```
3. **Run the app**
   ```bash
   pnpm dev
   ```
   Visit `http://localhost:3000`, enter the target role + JD, upload a resume, and watch the optimized version appear beside the original.

## 🔌 API Reference
### `POST /api/parse-pdf`
- **Input**: `multipart/form-data` with `file` (PDF)
- **Output**: `CandidateProfile` JSON (contact info, skills, projects)

### `POST /api/match`
- **Input**: `{ jobSpecRaw, candidateProfileRaw }`
- **Output**: `MatchOutput` (`fit_score`, `highlights[]`, `gaps[]`, `verdict`, plus diagnostics like `llm_fit_score`, `keyword_overlap`)
- **Safety**: Enforced truth guard (no fabricated evidence; gaps and adjacent skills flagged).

### `POST /api/export-pdf`
- **Input**: `{ candidateProfile, matchOutput }`
- **Output**: PDF stream (`Content-Type: application/pdf`) — ready to download.

### `POST /api/rewrite-resume`
- **Input**: `{ candidateProfile, jobSpec, matchOutput }`
- **Output**: `{ rewrite }` plain-text guidance to tighten the resume around the JD.

## 🧪 Development Notes
- Lint: `pnpm lint`
- The UI and APIs work without an OpenAI key using mocked responses, so you can iterate on styling and PDF rendering offline.
- Jest & Testing Library are installed and ready for future truth-guard rule tests (configure `jest.config.ts` when needed).

Happy matching!

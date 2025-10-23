# specmatch v1.5 — Truthful AI Resume Matcher

specmatch v1.5 turns an existing resume and a target job description into an honest, JD-aligned resume pack. Upload a PDF (or fill the structured form), review the truth-guarded match output, and export a refreshed one-page resume PDF — all without fabricating experience.

## ✨ Features
- **Resume ingestion**: Upload a PDF resume, parse it with `pdf-parse`, and structure the data via OpenAI JSON mode + Zod validation.
- **Manual editing**: shadcn/ui form backed by `react-hook-form` lets candidates edit contact info, skills, and project evidence.
- **Truth guard matching**: `/api/match` normalizes inputs, applies strict evidence rules, and asks OpenAI (gpt-4o-mini) for the match output (fit score, bullets, cover letter, risks, trace).
- **Resume export**: `/api/export-pdf` renders a new one-page PDF with pdfkit including contact header, aligned bullets, talking points, risks, and optional cover letter snapshot.
- **Mock-friendly**: If `OPENAI_API_KEY` is unset, the API routes return deterministic placeholder data so the UI flows without live calls.

## 🧱 Tech Stack
- Next.js 15 (App Router, TypeScript, Tailwind)
- shadcn/ui components (button, input, textarea, label, card, progress, accordion, form)
- `react-hook-form` + `@hookform/resolvers` for controlled forms
- OpenAI Node SDK (chat completions with JSON schema)
- `zod` schemas shared between client and server
- `pdf-parse` for resume extraction, `pdfkit` for PDF generation

## 📁 Key Directories
```
src/
├─ app/
│  ├─ page.tsx                  # Upload/form UI, JD input, match + export controls
│  └─ api/
│     ├─ parse-pdf/route.ts     # PDF → CandidateProfile (OpenAI-backed)
│     ├─ match/route.ts         # Truth-guarded JD ↔ profile matcher
│     └─ export-pdf/route.ts    # Resume PDF generator
├─ components/ui/               # shadcn/ui components + barrel exports
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
   Visit `http://localhost:3000` and upload a resume or fill the form, then paste the JD to generate a match.

## 🔌 API Reference
### `POST /api/parse-pdf`
- **Input**: `multipart/form-data` with `file` (PDF)
- **Output**: `CandidateProfile` JSON (contact info, skills, projects)

### `POST /api/match`
- **Input**: `{ jobSpecRaw, candidateProfileRaw }`
- **Output**: `MatchOutput` (`fitScore`, `rationale[]`, `bullets[]`, `coverLetter`, `talkingPoints[]`, `risks[]`, `trace[]`)
- **Safety**: Enforced truth guard (no fabricated evidence; gaps and adjacent skills flagged).

### `POST /api/export-pdf`
- **Input**: `{ candidateProfile, matchOutput }`
- **Output**: PDF stream (`Content-Type: application/pdf`) — ready to download.

## 🧪 Development Notes
- Lint: `pnpm lint`
- The UI and APIs work without an OpenAI key using mocked responses, so you can iterate on styling and PDF rendering offline.
- Jest & Testing Library are installed and ready for future truth-guard rule tests (configure `jest.config.ts` when needed).

Happy matching!

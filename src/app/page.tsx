"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropZone,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
  ThemeToggle,
} from "@/components/ui"
import type { CandidateProfile, JobSpec, MatchOutput } from "@/types"
import { extractPdfText } from "@/lib/client/pdfExtractor"
import { cn } from "@/lib/utils"

const optionalEmail = z.string().email("Enter a valid email.").or(z.literal("")).optional()
const optionalUrl = z.string().url("Enter a valid URL.").or(z.literal("")).optional()

const projectFormSchema = z.object({
  name: z.string().optional(),
  summary: z.string().optional(),
  skills: z.string().optional(),
  outcomes: z.string().optional(),
})

const manualProfileSchema = z.object({
  jobTitle: z.string().min(1, "Target role is required."),
  jobDescription: z.string().min(1, "Paste the job description so we can tailor outputs."),
  name: z.string().min(1, "Name is required."),
  email: optionalEmail,
  phone: z.string().optional(),
  linkedin: optionalUrl,
  portfolio: optionalUrl,
  title: z.string().optional(),
  location: z.string().optional(),
  skills: z.string().optional(),
  tools: z.string().optional(),
  projects: z.array(projectFormSchema).min(1, "Add at least one project (or remove empty entries)."),
  additionalContext: z.string().max(2000, "Keep it under 2000 characters.").optional(),
})

type ManualProfileFormValues = z.infer<typeof manualProfileSchema>

const defaultProjectRow = { name: "", summary: "", skills: "", outcomes: "" }

const splitList = (value?: string) =>
  (value ?? "")
    .split(/,|\r?\n/)
    .map((item) => item.replace(/^[-*•]\s*/g, "").trim())
    .filter(Boolean)

const toCandidateProfile = (values: ManualProfileFormValues): CandidateProfile => {
  const projects = values.projects
    .map((project) => ({
      name: project.name?.trim(),
      summary: project.summary?.trim(),
      skills: splitList(project.skills),
      outcomes: splitList(project.outcomes),
    }))
    .filter((project) => project.name || project.summary)
    .map((project) => ({
      name: project.name || "Untitled Project",
      summary: project.summary || "Summary forthcoming.",
      skills: project.skills,
      outcomes: project.outcomes,
    }))

  return {
    contact: {
      name: values.name.trim(),
      email: values.email?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      linkedin: values.linkedin?.trim() || undefined,
      portfolio: values.portfolio?.trim() || undefined,
    },
    title: values.title?.trim() || undefined,
    location: values.location?.trim() || undefined,
    skills: splitList(values.skills),
    tools: splitList(values.tools),
    projects,
    additionalContext: values.additionalContext?.trim() || undefined,
  }
}

const toFormValues = (
  profile: CandidateProfile,
  jobTitle: string,
  jobDescription: string,
): ManualProfileFormValues => ({
  jobTitle,
  jobDescription,
  name: profile.contact.name ?? "",
  email: profile.contact.email ?? "",
  phone: profile.contact.phone ?? "",
  linkedin: profile.contact.linkedin ?? "",
  portfolio: profile.contact.portfolio ?? "",
  title: profile.title ?? "",
  location: profile.location ?? "",
  skills: profile.skills.join(", "),
  tools: profile.tools.join(", "),
  projects:
    profile.projects.length > 0
      ? profile.projects.map((project) => ({
          name: project.name,
          summary: project.summary,
          skills: project.skills.join(", "),
          outcomes: project.outcomes.join("\n"),
        }))
      : [defaultProjectRow],
  additionalContext: profile.additionalContext ?? "",
})

const buildJobSpec = (values: ManualProfileFormValues) => {
  const lines = values.jobDescription
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/g, "").trim())
    .filter(Boolean)

  return {
    title: values.jobTitle.trim(),
    responsibilities: lines.length ? lines : [values.jobTitle.trim()],
    mustHaves: [],
    niceToHaves: [],
    keywords: [],
  }
}

const clampScore = (score?: number) => {
  if (typeof score !== "number" || Number.isNaN(score)) return 0
  return Math.min(100, Math.max(0, score))
}

export default function Home() {
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [parseLoading, setParseLoading] = useState(false)
  const [pdfExtractLoading, setPdfExtractLoading] = useState(false)
  const [matchLoading, setMatchLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [pdfExtractError, setPdfExtractError] = useState<string | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null)
  const [matchResult, setMatchResult] = useState<MatchOutput | null>(null)
  const [pdfText, setPdfText] = useState("")
  const [pdfTextSource, setPdfTextSource] = useState<"client" | "ocr" | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [rewriteLoading, setRewriteLoading] = useState(false)
  const [improvedResume, setImprovedResume] = useState<string | null>(null)
  const [resumeReady, setResumeReady] = useState(false)
  const [lastSubmittedSignature, setLastSubmittedSignature] = useState<string | null>(null)
  const [rewriteError, setRewriteError] = useState<string | null>(null)

  const form = useForm<ManualProfileFormValues>({
    resolver: zodResolver(manualProfileSchema),
    defaultValues: {
      jobTitle: "Target Role",
      jobDescription: "",
      name: "",
      email: "",
      phone: "",
      linkedin: "",
      portfolio: "",
      title: "",
      location: "",
      skills: "",
      tools: "",
      projects: [defaultProjectRow],
      additionalContext: "",
    },
    mode: "onChange",
  })

  const { control, handleSubmit, reset, watch, getValues } = form
  const projects = useFieldArray({ control, name: "projects" })

  const watchedValues = watch()
  const previewProfile = toCandidateProfile({
    ...watchedValues,
    projects:
      watchedValues.projects?.length === 0 ? [defaultProjectRow] : watchedValues.projects,
  })
  const targetRoleLabel = watchedValues.jobTitle?.trim() || "your target role"

  const originalResumeView = useMemo(() => {
    if (pdfText.trim()) {
      return pdfText.trim()
    }

    const profile = candidateProfile ?? previewProfile
    if (!profile) {
      return "Original resume text will appear here after upload."
    }

    const lines: string[] = []
    lines.push(profile.contact.name)
    if (profile.title) lines.push(`Current Title: ${profile.title}`)
    if (profile.location) lines.push(`Location: ${profile.location}`)
    if (profile.additionalContext) lines.push(profile.additionalContext)
    if (profile.skills.length) lines.push(`Skills: ${profile.skills.join(", ")}`)
    if (profile.tools.length) lines.push(`Tools: ${profile.tools.join(", ")}`)

    if (profile.projects.length) {
      lines.push("Experience:")
      profile.projects.forEach((project) => {
        lines.push(`- ${project.name}: ${project.summary}`)
        if (project.outcomes.length) {
          lines.push(`  Outcomes: ${project.outcomes.join("; ")}`)
        }
      })
    }

    return lines.filter(Boolean).join("\n")
  }, [pdfText, candidateProfile, previewProfile])

  useEffect(() => {
    if (!resumeReady || !lastSubmittedSignature) {
      return
    }

    const currentSignature = JSON.stringify(watchedValues)
    if (currentSignature !== lastSubmittedSignature) {
      setResumeReady(false)
      setMatchResult(null)
      setImprovedResume(null)
      setRewriteError(null)
    }
  }, [resumeReady, lastSubmittedSignature, watchedValues])

  const handleResumeUpload = useCallback(
    async (file: File | null) => {
      if (!file) return

      setPdfText("")
      setPdfTextSource(null)
      setPdfExtractError(null)
      setOcrError(null)
      setResumeReady(false)
      setMatchResult(null)
      setLastSubmittedSignature(null)
      setImprovedResume(null)
      setRewriteError(null)
      setRewriteLoading(false)

      setPdfExtractLoading(true)
      try {
        const text = await extractPdfText(file)
        if (!text.trim()) {
          throw new Error("No extractable text found.")
        }
        setPdfText(text.trim())
        setPdfTextSource("client")
      } catch (error) {
        console.warn("[client/pdf-extract] failed", error)
        setPdfText("")
        setPdfTextSource(null)
        setPdfExtractError("Could not extract PDF text in-browser. Try OCR (server-side).")
      } finally {
        setPdfExtractLoading(false)
      }

      setParseLoading(true)
      setParseError(null)
      try {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch("/api/parse-pdf", {
          method: "POST",
          body: formData,
        })

        if (!res.ok) {
          const details = await res.json().catch(() => ({}))
          throw new Error(details.error ?? "Failed to parse resume.")
        }

        const parsed = (await res.json()) as CandidateProfile
        setCandidateProfile(parsed)

        const current = getValues()
        const nextValues = toFormValues(parsed, current.jobTitle, current.jobDescription)
        const persistedAdditional = current.additionalContext?.trim()
          ? current.additionalContext
          : nextValues.additionalContext

        reset({
          ...nextValues,
          additionalContext: persistedAdditional ?? "",
        })
      } catch (error) {
        setParseError(error instanceof Error ? error.message : "Unexpected error while parsing PDF.")
      } finally {
        setParseLoading(false)
      }
    },
    [getValues, reset],
  )

  useEffect(() => {
    if (resumeFile) {
      void handleResumeUpload(resumeFile)
    }
  }, [resumeFile, handleResumeUpload])

  const handleOcrFallback = useCallback(async () => {
    if (!resumeFile) return

    setOcrError(null)
    setOcrLoading(true)

    try {
      const formData = new FormData()
      formData.append("file", resumeFile)

      const res = await fetch("/api/pdf-ocr", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const details = await res.json().catch(() => ({}))
        throw new Error(details.error ?? "OCR service failed to extract text.")
      }

      const payload = (await res.json()) as { text?: string }
      const text = payload.text?.trim()

      if (!text) {
        throw new Error("OCR response did not include text.")
      }

      setImprovedResume(null)
      setRewriteError(null)
      setResumeReady(false)
      setMatchResult(null)

      setPdfText(text)
      setPdfTextSource("ocr")
      setPdfExtractError(null)
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : "Failed to run OCR fallback.")
    } finally {
      setOcrLoading(false)
    }
  }, [resumeFile])

  const onGenerateMatch = handleSubmit(async (values) => {
    setMatchLoading(true)
    setMatchError(null)
    setMatchResult(null)
    setImprovedResume(null)
    setRewriteError(null)

    try {
      const profile = toCandidateProfile(values)
      const jobSpec = buildJobSpec(values)
      setResumeReady(false)

      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobSpecRaw: jobSpec,
          candidateProfileRaw: profile,
        }),
      })

      if (!res.ok) {
        const details = await res.json().catch(() => ({}))
        throw new Error(details.error ?? "Unable to generate match output.")
      }

      const data = (await res.json()) as MatchOutput
      setCandidateProfile(profile)
      setMatchResult(data)

      const rewriteSuccess = await runRewrite(profile, jobSpec, data)
      setResumeReady(rewriteSuccess)
      setLastSubmittedSignature(JSON.stringify(values))
    } catch (error) {
      setMatchResult(null)
      setMatchError(error instanceof Error ? error.message : "Unexpected error while generating match.")
      setResumeReady(false)
    } finally {
      setMatchLoading(false)
    }
  })

  const handleExportPdf = async () => {
    if (!candidateProfile || !matchResult) {
      setMatchError("Generate a match before exporting the resume.")
      return
    }

    setExportLoading(true)
    setMatchError(null)

    try {
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateProfile,
          matchOutput: matchResult,
        }),
      })

      if (!res.ok) {
        const details = await res.json().catch(() => ({}))
        throw new Error(details.error ?? "Failed to create resume PDF.")
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = "specmatch-resume.pdf"
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : "Unexpected error while exporting PDF.")
      setResumeReady(false)
    } finally {
      setExportLoading(false)
    }
  }

  const handleDownloadMatchText = () => {
    if (!matchResult) {
      setMatchError("Generate a resume summary before downloading the match output.")
      return
    }
    setMatchError(null)

    const lines: string[] = []
    lines.push(`Fit Score: ${clampScore(matchResult.fit_score)}`)
    if (typeof matchResult.llm_fit_score === "number") {
      lines.push(`LLM Score: ${clampScore(matchResult.llm_fit_score)}`)
    }
    if (typeof matchResult.keyword_overlap === "number") {
      lines.push(`Keyword Overlap: ${matchResult.keyword_overlap}%`)
    }

    lines.push("")

    if (matchResult.highlights.length) {
      lines.push("Highlights:")
      matchResult.highlights.forEach((item) => lines.push(`- ${item}`))
      lines.push("")
    }

    if (matchResult.gaps.length) {
      lines.push("Gaps:")
      matchResult.gaps.forEach((item) => lines.push(`- ${item}`))
      lines.push("")
    }

    lines.push(`Verdict: ${matchResult.verdict}`)

    const blob = new Blob([lines.join("\n")], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "specmatch-match-output.txt"
    link.click()
    URL.revokeObjectURL(url)
  }

  const runRewrite = async (profile: CandidateProfile, jobSpec: JobSpec, result: MatchOutput) => {
    setRewriteLoading(true)
    setRewriteError(null)
    setImprovedResume(null)

    try {
      const res = await fetch("/api/rewrite-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateProfile: profile,
          jobSpec,
          matchOutput: result,
        }),
      })

      if (!res.ok) {
        const details = await res.json().catch(() => ({}))
        throw new Error(details.error ?? "Failed to generate optimized resume.")
      }

      const payload = (await res.json()) as { rewrite?: string }
      const text = payload.rewrite?.trim()
      if (!text) {
        throw new Error("Rewrite response was empty.")
      }

      setImprovedResume(text)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error while optimizing resume."
      setRewriteError(message)
      return false
    } finally {
      setRewriteLoading(false)
    }
  }
  return (
    <Form {...form}>
      <form className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 p-6 pb-12" onSubmit={onGenerateMatch}>
        <header className="flex flex-col gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-gray-100">
                specmatch v2.0 — Truthful Resume Rewriter
              </h1>
              <p className="max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">
                Paste the job description, drop in your current resume, and receive an honest, role-aware rewrite with an
                explainable fit breakdown. No fabrication—just optimized framing of your real experience.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <div className="space-y-6">
          <Card className="border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <CardHeader>
              <CardTitle>Step 1 — Target Role &amp; Job Description</CardTitle>
              <CardDescription>Tell us the role you’re aiming for and paste the responsibilities.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={control}
                name="jobTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Role</FormLabel>
                    <FormControl>
                      <Input placeholder="Senior Product Designer" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="jobDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Description</FormLabel>
                    <FormControl>
                      <Textarea rows={8} placeholder="Paste the JD content (responsibilities, must-haves, etc.)" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs">Irrelevant benefits text is stripped automatically.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="border border-dashed border-neutral-300 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
            <CardHeader>
              <CardTitle>Step 2 — Upload Your Resume (PDF)</CardTitle>
              <CardDescription>We extract text locally before sending anything to the server.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
            <DropZone onFile={setResumeFile} disabled={parseLoading || pdfExtractLoading || ocrLoading} />
            {resumeFile && (
              <p className="text-muted-foreground text-xs">Selected file: {resumeFile.name}</p>
            )}
            {pdfExtractLoading && <p className="text-muted-foreground text-sm">Extracting text in browser...</p>}
            {pdfText && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">
                  Extracted Text {pdfTextSource === "ocr" ? "(OCR fallback)" : "(local)"}
                </p>
                <Textarea
                  value={pdfText}
                  readOnly
                  rows={8}
                  className="max-h-64 whitespace-pre-wrap"
                  aria-label="Extracted PDF text"
                />
              </div>
            )}
            {pdfExtractError && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="font-medium">Could not extract PDF text locally.</p>
                <p className="mt-1">Try OCR (server-side) to handle scanned or image-based resumes.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOcrFallback}
                    disabled={ocrLoading || !resumeFile}
                  >
                    {ocrLoading ? "Running OCR..." : "Run OCR fallback"}
                  </Button>
                  {ocrError && <span className="text-destructive text-xs">{ocrError}</span>}
                </div>
              </div>
            )}
            {parseError && <p className="text-destructive text-sm">{parseError}</p>}
            <div className="rounded-md border border-neutral-200 bg-neutral-100 p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Local Preview</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Adjust any fields below before generating the optimized version.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <CardHeader>
            <CardTitle>Candidate Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {parseLoading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/80 backdrop-blur-sm">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Filling in details from your resume…</p>
                </div>
              )}
              <div className={cn("grid gap-6", parseLoading ? "pointer-events-none opacity-50" : "")}>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Alex Developer" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Lead Frontend Engineer" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="alex@email.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="+1 555 0100" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="linkedin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>LinkedIn</FormLabel>
                      <FormControl>
                        <Input placeholder="https://www.linkedin.com/in/username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="portfolio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Portfolio / Website</FormLabel>
                      <FormControl>
                        <Input placeholder="https://portfolio.dev" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input placeholder="Remote (US)" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="skills"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Core Skills (comma separated)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="React, TypeScript, Tailwind, Accessibility" rows={2} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="tools"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Tools / Platforms</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Next.js, GraphQL, Jest, Playwright" rows={2} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">Projects</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => projects.append(defaultProjectRow)}
                  >
                    Add Project
                  </Button>
                </div>

                {projects.fields.map((field, index) => (
                  <div key={field.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Project {index + 1}</h4>
                      {projects.fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => projects.remove(index)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <FormField
                        control={control}
                        name={`projects.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Project Atlas" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={control}
                        name={`projects.${index}.skills`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Stack (comma separated)</FormLabel>
                            <FormControl>
                              <Input placeholder="Next.js, GraphQL, Tailwind" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={control}
                      name={`projects.${index}.summary`}
                      render={({ field }) => (
                        <FormItem className="mt-3">
                          <FormLabel>Summary</FormLabel>
                          <FormControl>
                            <Textarea placeholder="One-line project summary focused on scope and impact..." rows={3} {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name={`projects.${index}.outcomes`}
                      render={({ field }) => (
                        <FormItem className="mt-3">
                          <FormLabel>Outcomes (one per line)</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Increased retention by 12%\nReduced build time from 30m to 10m" rows={2} {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
              </div>

              <FormField
                control={control}
                name="additionalContext"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Context</FormLabel>
                    <FormDescription>
                      Optional space to highlight experience or strengths that are not covered in your resume. Included
                      when generating AI outputs.
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        placeholder="e.g. Led UI/UX initiatives for 3 SaaS products, delivering component libraries and usability research."
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {matchError && <p className="text-destructive text-sm">{matchError}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={matchLoading || rewriteLoading || resumeReady}>
                  {matchLoading || rewriteLoading
                    ? "Optimizing resume..."
                    : resumeReady
                      ? "Resume Ready"
                      : "Generate Optimized Resume"}
                </Button>
                <Button
                  type="button"
                  variant={matchResult ? "default" : "secondary"}
                  disabled={!matchResult || exportLoading}
                  onClick={handleExportPdf}
                >
                  {exportLoading ? "Preparing PDF..." : "Export Improved Resume (PDF)"}
                </Button>
                <Button type="button" variant="outline" disabled={!matchResult} onClick={handleDownloadMatchText}>
                  Download Match Output (.txt)
                </Button>
              </div>
              </div>
            </div>
          </CardContent>
        </Card>

      {matchResult && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-neutral-900 dark:text-gray-100">
                  Original Resume
                </CardTitle>
                <CardDescription className="text-xs text-neutral-500 dark:text-neutral-400">
                  Raw text from your uploaded resume.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-md bg-neutral-100 p-4 text-sm leading-relaxed text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
                  {originalResumeView || "Original resume text will appear here after upload."}
                </pre>
              </CardContent>
            </Card>

            <Card className="border border-emerald-500/40 bg-white shadow-sm dark:border-emerald-400/40 dark:bg-neutral-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-emerald-600 dark:text-emerald-400">
                  Optimized Resume
                </CardTitle>
                <CardDescription className="text-xs text-neutral-500 dark:text-neutral-400">
                  Truthful rewrite tailored to {targetRoleLabel}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {rewriteLoading ? (
                  <div className="space-y-3">
                    <div className="h-4 w-5/6 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                    <div className="h-4 w-4/6 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                    <div className="h-4 w-3/6 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                  </div>
                ) : rewriteError ? (
                  <p className="text-sm text-red-500 dark:text-red-400">{rewriteError}</p>
                ) : improvedResume ? (
                  <pre className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-md bg-neutral-100 p-4 text-sm leading-relaxed text-neutral-800 dark:bg-neutral-950 dark:text-neutral-100">
                    {improvedResume}
                  </pre>
                ) : (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Optimized resume will appear here once generated.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Match Breakdown</CardTitle>
              <CardDescription className="text-xs text-neutral-500 dark:text-neutral-400">
                Balanced scorecard combining language model reasoning and keyword alignment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed">
              <p className="text-lg font-semibold text-emerald-500 dark:text-emerald-400">
                🟢 Fit Score: {clampScore(matchResult.fit_score)}/100
              </p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                📊 LLM Score: {typeof matchResult.llm_fit_score === "number" ? clampScore(matchResult.llm_fit_score) : "n/a"}/100 · Keyword overlap: {typeof matchResult.keyword_overlap === "number" ? `${matchResult.keyword_overlap}%` : "n/a"}
              </p>
              <p className="text-sm text-neutral-800 dark:text-neutral-200">
                💡 Highlights: {matchResult.highlights.length ? matchResult.highlights.join(", ") : "No standout highlights detected yet."}
              </p>
              <p className="text-sm text-neutral-800 dark:text-neutral-200">
                ⚠️ Gaps: {matchResult.gaps.length ? matchResult.gaps.join(", ") : "No critical gaps flagged."}
              </p>
              <p className="text-base font-medium text-sky-600 dark:text-sky-300">🧭 Verdict: {matchResult.verdict}</p>
            </CardContent>
          </Card>
        </div>
      )}
        </div>
      </form>
    </Form>
  )
}

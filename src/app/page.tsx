"use client"

import { useCallback, useEffect, useState } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Card,
  CardContent,
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
  Progress,
  Textarea,
} from "@/components/ui"
import type { CandidateProfile, MatchOutput } from "@/types"
import { extractPdfText } from "@/lib/client/pdfExtractor"

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

const extractMatchedEvidence = (matches: unknown[]) =>
  matches
    .map((item) => {
      if (typeof item === "string") return item
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>
        return (
          (typeof record.skill === "string" && record.skill) ||
          (typeof record.project === "string" && record.project) ||
          (typeof record.snippet === "string" && record.snippet) ||
          undefined
        )
      }
      return undefined
    })
    .filter((entry): entry is string => Boolean(entry))

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

  const handleResumeUpload = useCallback(
    async (file: File | null) => {
      if (!file) return

      setPdfText("")
      setPdfTextSource(null)
      setPdfExtractError(null)
      setOcrError(null)

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

    try {
      const profile = toCandidateProfile(values)
      const jobSpec = buildJobSpec(values)

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
    } catch (error) {
      setMatchResult(null)
      setMatchError(error instanceof Error ? error.message : "Unexpected error while generating match.")
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
    } finally {
      setExportLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form className="mx-auto flex max-w-5xl flex-col gap-8 p-8" onSubmit={onGenerateMatch}>
        <header>
          <h1 className="text-3xl font-bold tracking-tight">specmatch v1.5 — Truthful Resume Optimizer</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Upload an existing resume or fill in the form, paste the job description, then generate evidence-backed
            bullets and a fresh one-page PDF tailored to the role.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Upload your resume (.pdf)</CardTitle>
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
              <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
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
            <div className="rounded-md bg-muted/40 p-4">
              <h3 className="text-sm font-semibold">Preview</h3>
                <p className="mt-2 text-sm">
                  <span className="font-medium">{previewProfile.contact.name}</span>
                  {previewProfile.title ? ` — ${previewProfile.title}` : ""}
                </p>
                <p className="text-muted-foreground text-xs">
                  {[previewProfile.contact.email, previewProfile.contact.phone, previewProfile.contact.linkedin]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
                <div className="mt-3 space-y-2 text-xs">
                  <p>
                    <span className="font-medium">Skills:</span> {previewProfile.skills.join(", ") || "Add skills"}
                  </p>
                  <p>
                    <span className="font-medium">Projects:</span>{" "}
                    {previewProfile.projects.length
                      ? previewProfile.projects.map((project) => project.name).join(", ")
                      : "Add project experience"}
                  </p>
                  {previewProfile.additionalContext && (
                    <p>
                      <span className="font-medium">Additional:</span> {previewProfile.additionalContext}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Job Description</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={control}
                name="jobTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Role Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Senior Frontend Engineer" {...field} />
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
                    <FormLabel>Paste Job Description</FormLabel>
                    <FormControl>
                      <Textarea rows={8} placeholder="Paste the JD content..." {...field} />
                    </FormControl>
                    <FormDescription>Include responsibilities and must-have skills for the best alignment.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Candidate Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6">
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
                <FormField
                  control={control}
                  name="additionalContext"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
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

              {matchError && <p className="text-destructive text-sm">{matchError}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={matchLoading}>
                  {matchLoading ? "Generating match..." : "Generate Match"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!matchResult || exportLoading}
                  onClick={handleExportPdf}
                >
                  {exportLoading ? "Preparing PDF..." : "Download New Resume (PDF)"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

      {matchResult && (
        <Card>
          <CardHeader>
            <CardTitle>Match Output</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Fit Score: {clampScore(matchResult.fitScore)}</h2>
              <Progress value={clampScore(matchResult.fitScore)} />
            </div>
            <Accordion type="multiple" className="space-y-2">
              <AccordionItem value="rationale">
                <AccordionTrigger>Fit Rationale</AccordionTrigger>
                <AccordionContent className="space-y-2">
                  {matchResult.rationale.map((item, index) => (
                    <p key={index}>• {item}</p>
                  ))}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="bullets">
                <AccordionTrigger>Resume Bullets</AccordionTrigger>
                <AccordionContent className="space-y-2">
                  {matchResult.bullets.map((item, index) => (
                    <p key={index}>• {item}</p>
                  ))}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="talking">
                <AccordionTrigger>Talking Points</AccordionTrigger>
                <AccordionContent className="space-y-2">
                  {matchResult.talkingPoints.map((item, index) => (
                    <p key={index}>• {item}</p>
                  ))}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="cover">
                <AccordionTrigger>Cover Letter</AccordionTrigger>
                <AccordionContent>
                  <p className="whitespace-pre-line text-sm leading-relaxed">{matchResult.coverLetter}</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="risks">
                <AccordionTrigger>Risks &amp; Mitigations</AccordionTrigger>
                <AccordionContent className="space-y-2">
                  {matchResult.risks.map((risk, index) => (
                    <p key={index}>
                      ⚠️ {risk.type === "adjacent" ? "Adjacent skill" : risk.type === "soft" ? "Soft gap" : "Gap"} — {risk.gap} →
                      {` ${risk.mitigation}`}
                    </p>
                  ))}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="trace">
                <AccordionTrigger>Requirement Trace</AccordionTrigger>
                <AccordionContent className="space-y-3 text-sm">
                  {matchResult.trace.map((entry, index) => {
                    const matches = extractMatchedEvidence(entry.matched)
                    return (
                      <div key={index} className="rounded-md border p-3">
                        <p className="font-medium">{entry.requirement}</p>
                        {matches.length ? (
                          <p className="text-muted-foreground text-xs">Matched evidence: {matches.join(", ")}</p>
                        ) : (
                          <p className="text-muted-foreground text-xs">No direct evidence supplied.</p>
                        )}
                      </div>
                    )
                  })}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}
      </form>
    </Form>
  )
}

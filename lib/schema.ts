import { z } from "zod";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const ProfileSchema = z.object({
  state: z.string(),
  ownsCultivableLand: z.enum(["yes", "no", "unsure"]),
  landSizeHectares: z.number().optional(),
  occupation: z.string(),
  aadhaarLinkedBank: z.enum(["yes", "no", "unsure"]),
  eKycDone: z.enum(["yes", "no", "unsure"]),
});

export const InputSchema = z.object({
  question: z.string().min(5),
  profile: ProfileSchema,
});

export type Profile = z.infer<typeof ProfileSchema>;
export type Input = z.infer<typeof InputSchema>;

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export const EvidenceSchema = z.object({
  sourceId: z.string(),
  snippet: z.string().min(10),
  verified: z.boolean().optional(),
});

export type Evidence = z.infer<typeof EvidenceSchema>;

// ---------------------------------------------------------------------------
// LLM output components
// ---------------------------------------------------------------------------

export const TopicFindingSchema = z.object({
  topic: z.string(),
  status: z.enum(["covered", "missing", "conflicting", "unclear"]),
  summary: z.string(),
  evidence: z.array(EvidenceSchema),
  conflictNote: z.string().optional(),
  label: z.enum(["sourced", "ai_suggestion", "uncertain"]),
});

export type TopicFinding = z.infer<typeof TopicFindingSchema>;

export const ProfileMatchSchema = z.object({
  criterion: z.string(),
  result: z.enum(["seems_to_match", "may_not_match", "cannot_tell"]),
  reason: z.string(),
  evidence: z.array(EvidenceSchema),
});

export type ProfileMatch = z.infer<typeof ProfileMatchSchema>;

export const ChecklistItemSchema = z.object({
  priority: z.enum(["high", "medium", "low"]),
  action: z.string(),
  reason: z.string(),
  relatedTopic: z.string().optional(),
});

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

// ---------------------------------------------------------------------------
// LLM output (what we ask the model to return)
// ---------------------------------------------------------------------------

export const LlmOutputSchema = z.object({
  topics: z.array(TopicFindingSchema),
  profileMatches: z.array(ProfileMatchSchema),
  checklist: z.array(ChecklistItemSchema),
});

export type LlmOutput = z.infer<typeof LlmOutputSchema>;

// ---------------------------------------------------------------------------
// Source warnings (derived server-side, not from LLM)
// ---------------------------------------------------------------------------

export const SourceWarningSchema = z.object({
  sourceId: z.string(),
  kind: z.enum(["undated", "possibly_outdated"]),
  message: z.string(),
});

export type SourceWarning = z.infer<typeof SourceWarningSchema>;

// ---------------------------------------------------------------------------
// Final report (LLM output + server-side additions)
// ---------------------------------------------------------------------------

export const ReportSchema = LlmOutputSchema.extend({
  sourceWarnings: z.array(SourceWarningSchema),
  generatedAt: z.string(),
});

export type Report = z.infer<typeof ReportSchema>;

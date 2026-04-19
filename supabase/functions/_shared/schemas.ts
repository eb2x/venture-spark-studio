// Canonical domain schemas for the venture concept evaluation pipeline.
//
// This file is the single source of truth for the shapes that flow through
// intake → triage → sizing → memo → verification. It is imported both by:
//   • Supabase edge functions (Deno) — via relative path
//   • Frontend (Vite) — via the "@shared/*" tsconfig + vite alias
//
// Keep this file environment-agnostic: import only from "zod". No Deno-only
// or Node-only modules.

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Primitive enums
// ────────────────────────────────────────────────────────────────────────────

export const Band = z.enum(["low", "medium", "high"]);
export type Band = z.infer<typeof Band>;

export const Confidence = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof Confidence>;

export const DecisionBucket = z.enum(["kill", "investigate", "validate"]);
export type DecisionBucket = z.infer<typeof DecisionBucket>;

export const ReadinessState = z.enum([
  "ready_for_triage",
  "needs_clarification",
  "insufficiently_specified",
]);
export type ReadinessState = z.infer<typeof ReadinessState>;

export const PipelineStage = z.enum([
  "intake",
  "triage",
  "sizing",
  "memo",
  "verification",
]);
export type PipelineStage = z.infer<typeof PipelineStage>;

export const PipelineStatus = z.enum([
  "not_started",
  "running",
  "ready",
  "failed",
  "needs_clarification",
]);
export type PipelineStatus = z.infer<typeof PipelineStatus>;

// ────────────────────────────────────────────────────────────────────────────
// Concept (intake)
// ────────────────────────────────────────────────────────────────────────────

export const ConceptInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(40).max(2000),
  target_customer: z.string().trim().min(8).max(400),
  problem: z.string().trim().min(20).max(800),
  buyer_user: z.string().trim().min(4).max(300),
  business_model: z.string().trim().min(4).max(300),
  why_now: z.string().trim().min(10).max(600),
  alternatives: z.string().trim().min(4).max(600),
});
export type ConceptInput = z.infer<typeof ConceptInput>;

// ────────────────────────────────────────────────────────────────────────────
// Evidence — a URL that supports a specific claim. Verified separately.
// ────────────────────────────────────────────────────────────────────────────

export const EvidenceStatus = z.enum([
  "unverified",
  "verified",
  "unreachable",
  "unsupported",
]);
export type EvidenceStatus = z.infer<typeof EvidenceStatus>;

export const Evidence = z.object({
  title: z.string(),
  url: z.string().url(),
  supports: z.string(),
  status: EvidenceStatus.default("unverified"),
  http_status: z.number().int().nullable().optional(),
  checked_at: z.string().datetime().nullable().optional(),
  note: z.string().nullable().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

// ────────────────────────────────────────────────────────────────────────────
// Stage 1 — analyze-intake
// ────────────────────────────────────────────────────────────────────────────

export const IntakeAnalysis = z.object({
  normalized_summary: z.string(),
  proposed_vertical: z.string(),
  ambiguity_flags: z.array(z.string()),
  clarification_prompts: z.array(z.string()),
  readiness: ReadinessState,
  user_provided: z.array(z.string()).default([]),
  inferred: z.array(z.string()).default([]),
});
export type IntakeAnalysis = z.infer<typeof IntakeAnalysis>;

// ────────────────────────────────────────────────────────────────────────────
// Stage 2 — run-competitive-triage
// ────────────────────────────────────────────────────────────────────────────

export const Competitor = z.object({
  name: z.string(),
  segment: z.string(),
  positioning: z.string(),
  note: z.string(),
});
export type Competitor = z.infer<typeof Competitor>;

export const BandedAssessment = z.object({
  band: Band,
  rationale: z.string(),
});
export type BandedAssessment = z.infer<typeof BandedAssessment>;

export const TriageResult = z.object({
  competitors: z.array(Competitor).min(6).max(20),
  whitespace: z.array(z.string()).min(2).max(6),
  decision_bucket: DecisionBucket,
  confidence: Confidence,
  market_attractiveness: BandedAssessment,
  competitive_crowding: BandedAssessment,
  data_gaps: z.array(z.string()).default([]),
  sources: z.array(Evidence).default([]),
});
export type TriageResult = z.infer<typeof TriageResult>;

// ────────────────────────────────────────────────────────────────────────────
// Stage 3 — run-market-sizing
// ────────────────────────────────────────────────────────────────────────────

export const SizingRange = z.object({
  low: z.string(),
  high: z.string(),
});
export type SizingRange = z.infer<typeof SizingRange>;

export const SizingResult = z.object({
  tam: SizingRange,
  sam: SizingRange,
  som: SizingRange,
  methodology: z.string(),
  assumptions: z.array(z.string()).min(2).max(6),
  comparables: z.array(z.string()).default([]),
  uncertainty_notes: z.string(),
  confidence: Confidence,
  sources: z.array(Evidence).default([]),
  skipped: z.boolean().default(false),
  skipped_reason: z.string().nullable().optional(),
});
export type SizingResult = z.infer<typeof SizingResult>;

// ────────────────────────────────────────────────────────────────────────────
// Stage 4 — synthesize-memo
// The Memo is the partner-facing deliverable. It references upstream stage IDs
// so we can always trace a memo claim back to where it came from.
// ────────────────────────────────────────────────────────────────────────────

export const Memo = z.object({
  concept_id: z.string().uuid(),
  vertical: z.string(),
  one_liner: z.string(),
  summary: z.string(),
  market_attractiveness: BandedAssessment,
  competitive_crowding: BandedAssessment,
  competitors: z.array(Competitor),
  whitespace: z.array(z.string()),
  market_sizing: z.object({
    tam: SizingRange.or(z.string()), // accept legacy string ranges
    sam: SizingRange.or(z.string()),
    som: SizingRange.or(z.string()),
    methodology: z.string(),
    assumptions: z.array(z.string()),
    confidence: Confidence,
  }),
  risks: z.array(z.string()),
  unknowns: z.array(z.string()),
  recommendation: DecisionBucket,
  confidence: Confidence,
  next_steps: z.array(z.string()),
  sources: z.array(Evidence),
  unsupported_claims: z.array(z.string()).default([]),
  // Set by verify-claims; null until verification runs.
  verification: z
    .object({
      ran_at: z.string().datetime(),
      url_checks_total: z.number().int(),
      url_checks_failed: z.number().int(),
      unsupported_claims_added: z.number().int(),
      confidence_downgraded: z.boolean(),
      original_confidence: Confidence.nullable(),
    })
    .nullable()
    .default(null),
});
export type Memo = z.infer<typeof Memo>;

// ────────────────────────────────────────────────────────────────────────────
// Stage 5 — verify-claims
// ────────────────────────────────────────────────────────────────────────────

export const UrlCheck = z.object({
  url: z.string(),
  ok: z.boolean(),
  http_status: z.number().int().nullable(),
  error: z.string().nullable(),
  checked_at: z.string().datetime(),
});
export type UrlCheck = z.infer<typeof UrlCheck>;

export const VerificationResult = z.object({
  url_checks: z.array(UrlCheck),
  claims_without_evidence: z.array(z.string()),
  unsupported_claims_added: z.array(z.string()),
  confidence_before: Confidence,
  confidence_after: Confidence,
  confidence_downgraded: z.boolean(),
  notes: z.array(z.string()).default([]),
});
export type VerificationResult = z.infer<typeof VerificationResult>;

// ────────────────────────────────────────────────────────────────────────────
// Pipeline artifact envelope — matches public.pipeline_artifacts row.
// ────────────────────────────────────────────────────────────────────────────

export const PipelineArtifact = z.object({
  id: z.string().uuid(),
  concept_id: z.string().uuid(),
  stage: PipelineStage,
  version: z.number().int().positive(),
  status: z.enum(["ok", "error", "skipped"]),
  payload: z.unknown(),
  error: z.string().nullable(),
  model: z.string().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  duration_ms: z.number().int().nullable(),
  created_at: z.string().datetime(),
});
export type PipelineArtifact = z.infer<typeof PipelineArtifact>;

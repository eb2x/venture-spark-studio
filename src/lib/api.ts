// Frontend ↔ backend contract.
//
// Two surfaces:
//   1. Concepts CRUD (createConcept, listConcepts, getConcept, getMemo)
//   2. Pipeline control:
//        • runPipeline(id)            — orchestrate all 5 stages end-to-end
//        • runStage(id, stage)        — rerun a single stage
//        • listArtifacts(id)          — inspect per-stage outputs
//        • generateMemo(id)           — LEGACY one-shot fallback. Kept for
//          emergency fast-path; do not build new features on top of it.
//
// Domain types come from @shared/schemas (single source of truth shared with
// edge functions). The legacy camelCase Concept/Memo views in sampleConcepts.ts
// are mapped here on the way out.

import { supabase } from "@/integrations/supabase/client";
import type { Concept, Memo } from "@/data/sampleConcepts";
import type {
  Band,
  Confidence,
  DecisionBucket,
  PipelineStage,
} from "@shared/schemas";

type ConceptRow = {
  id: string;
  name: string;
  description: string;
  target_customer: string;
  problem: string;
  buyer_user: string;
  business_model: string;
  why_now: string;
  alternatives: string;
  vertical: string | null;
  one_liner: string | null;
  status: string;
  bucket: string | null;
  confidence: string | null;
  market_attractiveness: string | null;
  competitive_crowding: string | null;
  pipeline_status: string | null;
  last_stage: string | null;
  last_error: string | null;
  created_at: string;
};

const asBand = (v: string | null | undefined): Band | undefined =>
  v === "low" || v === "medium" || v === "high" ? v : undefined;
const asBucket = (v: string | null | undefined): DecisionBucket | undefined =>
  v === "kill" || v === "investigate" || v === "validate" ? v : undefined;
const asConf = (v: string | null | undefined): Confidence | undefined =>
  v === "low" || v === "medium" || v === "high" ? v : undefined;

function rowToConcept(r: ConceptRow): Concept {
  const s = r.status;
  const status: Concept["status"] =
    s === "memo_ready" ? "memo_ready" : s === "needs_clarification" ? "needs_clarification" : "ready";
  return {
    id: r.id,
    name: r.name,
    vertical: r.vertical ?? "B2B SaaS",
    oneLiner: r.one_liner ?? r.description.slice(0, 140),
    targetCustomer: r.target_customer,
    problem: r.problem,
    buyerUser: r.buyer_user,
    businessModel: r.business_model,
    whyNow: r.why_now,
    alternatives: r.alternatives,
    createdAt: r.created_at.slice(0, 10),
    status,
    bucket: asBucket(r.bucket),
    confidence: asConf(r.confidence),
    marketAttractiveness: asBand(r.market_attractiveness),
    competitiveCrowding: asBand(r.competitive_crowding),
  };
}

export async function listConcepts(): Promise<Concept[]> {
  const { data, error } = await supabase
    .from("concepts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ConceptRow[]).map(rowToConcept);
}

export async function getConcept(id: string): Promise<Concept | null> {
  const { data, error } = await supabase
    .from("concepts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToConcept(data as ConceptRow) : null;
}

type MemoPayload = {
  summary: string;
  market_attractiveness: { band: Band; rationale: string };
  competitive_crowding: { band: Band; rationale: string };
  competitors: Memo["competitors"];
  whitespace: string[];
  market_sizing: {
    tam: string | { low: string; high: string };
    sam: string | { low: string; high: string };
    som: string | { low: string; high: string };
    methodology: string;
    assumptions: string[];
    confidence: Confidence;
  };
  risks: string[];
  unknowns: string[];
  recommendation: DecisionBucket;
  confidence: Confidence;
  next_steps: string[];
  sources: Memo["sources"];
  unsupported_claims?: string[];
  verification?: {
    ran_at: string;
    url_checks_total: number;
    url_checks_failed: number;
    unsupported_claims_added: number;
    confidence_downgraded: boolean;
    original_confidence: Confidence | null;
  } | null;
};

const rangeToString = (r: string | { low: string; high: string } | undefined): string => {
  if (!r) return "";
  if (typeof r === "string") return r;
  return `${r.low} – ${r.high}`;
};

export async function getMemo(conceptId: string): Promise<Memo | null> {
  const { data, error } = await supabase
    .from("memos")
    .select("payload")
    .eq("concept_id", conceptId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const p = data.payload as unknown as MemoPayload;
  return {
    conceptId,
    summary: p.summary,
    marketAttractiveness: p.market_attractiveness,
    competitiveCrowding: p.competitive_crowding,
    competitors: p.competitors,
    whitespace: p.whitespace,
    marketSizing: {
      tam: rangeToString(p.market_sizing.tam),
      sam: rangeToString(p.market_sizing.sam),
      som: rangeToString(p.market_sizing.som),
      methodology: p.market_sizing.methodology,
      assumptions: p.market_sizing.assumptions,
      confidence: p.market_sizing.confidence,
    },
    risks: p.risks,
    unknowns: p.unknowns,
    recommendation: p.recommendation,
    confidence: p.confidence,
    nextSteps: p.next_steps,
    sources: p.sources,
    unsupportedClaims: p.unsupported_claims ?? [],
    verification: p.verification
      ? {
          ranAt: p.verification.ran_at,
          urlChecksTotal: p.verification.url_checks_total,
          urlChecksFailed: p.verification.url_checks_failed,
          unsupportedClaimsAdded: p.verification.unsupported_claims_added,
          confidenceDowngraded: p.verification.confidence_downgraded,
          originalConfidence: p.verification.original_confidence,
        }
      : null,
  };
}

// Matches @shared/schemas.ConceptInput exactly. Defined as an interface here
// (rather than `z.infer<typeof ConceptInput>`) because zod's inferred types
// flatten to optional fields under this project's relaxed tsconfig, which
// breaks Supabase's strict Insert typing.
export interface ConceptInput {
  name: string;
  description: string;
  target_customer: string;
  problem: string;
  buyer_user: string;
  business_model: string;
  why_now: string;
  alternatives: string;
}

export async function createConcept(input: ConceptInput): Promise<string> {
  const { data, error } = await supabase
    .from("concepts")
    .insert(input)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

// ────────────────────────────────────────────────────────────────────────────
// Pipeline control
// ────────────────────────────────────────────────────────────────────────────

export type PipelineResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; status?: number; stopped_at?: string; reason?: string };

const FUNCTION_BY_STAGE: Record<PipelineStage, string> = {
  intake: "analyze-intake",
  triage: "run-competitive-triage",
  sizing: "run-market-sizing",
  memo: "synthesize-memo",
  verification: "verify-claims",
};

/** Orchestrator: runs all 5 stages end-to-end server-side. */
export async function runPipeline(conceptId: string): Promise<PipelineResult> {
  const { data, error } = await supabase.functions.invoke("run-pipeline", {
    body: { concept_id: conceptId },
  });
  if (error) {
    return {
      ok: false,
      error: error.message ?? "Failed to run pipeline",
      status: (error as { context?: { status?: number } }).context?.status,
    };
  }
  if (data && typeof data === "object" && "success" in data && (data as { success?: boolean }).success === false) {
    const d = data as { stopped_at?: string; failed_at?: string; reason?: string; error?: string };
    return {
      ok: false,
      error: d.reason ?? d.error ?? "Pipeline stopped",
      stopped_at: d.stopped_at ?? d.failed_at,
      reason: d.reason,
    };
  }
  return { ok: true, data };
}

/** Rerun a single stage. Useful for retries after a transient failure. */
export async function runStage(
  conceptId: string,
  stage: PipelineStage,
): Promise<PipelineResult> {
  const fn = FUNCTION_BY_STAGE[stage];
  const { data, error } = await supabase.functions.invoke(fn, {
    body: { concept_id: conceptId },
  });
  if (error) {
    return {
      ok: false,
      error: error.message ?? `Failed to run ${fn}`,
      status: (error as { context?: { status?: number } }).context?.status,
    };
  }
  if ((data as { error?: string })?.error) {
    return { ok: false, error: (data as { error: string }).error };
  }
  return { ok: true, data };
}

export type PipelineArtifactRow = {
  id: string;
  stage: PipelineStage;
  version: number;
  status: "ok" | "error" | "skipped";
  error: string | null;
  created_at: string;
};

export async function listArtifacts(conceptId: string): Promise<PipelineArtifactRow[]> {
  const { data, error } = await supabase
    .from("pipeline_artifacts")
    .select("id, stage, version, status, error, created_at")
    .eq("concept_id", conceptId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PipelineArtifactRow[];
}

// ────────────────────────────────────────────────────────────────────────────
// LEGACY: one-shot memo fast-path.
//
// Kept as a fallback for emergencies / quick iteration. New work should go
// through runPipeline, which produces inspectable per-stage artifacts and a
// real verification pass.
// ────────────────────────────────────────────────────────────────────────────

export async function generateMemo(
  conceptId: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const { data, error } = await supabase.functions.invoke("generate-memo", {
    body: { concept_id: conceptId },
  });
  if (error) {
    return {
      ok: false,
      error: error.message ?? "Failed to generate memo",
      status: (error as { context?: { status?: number } }).context?.status,
    };
  }
  if ((data as { error?: string })?.error) {
    return { ok: false, error: (data as { error: string }).error };
  }
  return { ok: true };
}

import { supabase } from "@/integrations/supabase/client";
import type {
  Concept,
  Memo,
  Band,
  DecisionBucket,
  Confidence,
} from "@/data/sampleConcepts";

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
  created_at: string;
};

const asBand = (v: string | null | undefined): Band | undefined =>
  v === "low" || v === "medium" || v === "high" ? v : undefined;
const asBucket = (v: string | null | undefined): DecisionBucket | undefined =>
  v === "kill" || v === "investigate" || v === "validate" ? v : undefined;
const asConf = (v: string | null | undefined): Confidence | undefined =>
  v === "low" || v === "medium" || v === "high" ? v : undefined;

function rowToConcept(r: ConceptRow): Concept {
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
    status:
      r.status === "memo_ready"
        ? "memo_ready"
        : r.status === "needs_clarification"
          ? "needs_clarification"
          : "ready",
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

export async function getMemo(conceptId: string): Promise<Memo | null> {
  const { data, error } = await supabase
    .from("memos")
    .select("payload")
    .eq("concept_id", conceptId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const p = data.payload as Record<string, unknown> & {
    summary: string;
    market_attractiveness: { band: Band; rationale: string };
    competitive_crowding: { band: Band; rationale: string };
    competitors: Memo["competitors"];
    whitespace: string[];
    market_sizing: {
      tam: string;
      sam: string;
      som: string;
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
  };
  return {
    conceptId,
    summary: p.summary,
    marketAttractiveness: p.market_attractiveness,
    competitiveCrowding: p.competitive_crowding,
    competitors: p.competitors,
    whitespace: p.whitespace,
    marketSizing: {
      tam: p.market_sizing.tam,
      sam: p.market_sizing.sam,
      som: p.market_sizing.som,
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
  };
}

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
  if (data?.error) {
    return { ok: false, error: data.error };
  }
  return { ok: true };
}

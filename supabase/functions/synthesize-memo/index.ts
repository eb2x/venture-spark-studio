// Stage 4 — synthesize-memo
//
// Stitches intake + triage + sizing artifacts into the partner-facing memo.
// This stage is NOT allowed to invent new market facts — it composes what the
// prior stages produced and adds: recommendation, next_steps, risks, unknowns.
//
// Writes stage='memo' artifact AND upserts into the canonical `memos` table so
// existing UI keeps working.

import { serve } from "std/http/server";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getConcept, getServiceClient, setPipelineStatus } from "../_shared/supabase.ts";
import { callLLMTool, LLMError } from "../_shared/llm.ts";
import { getLatestArtifact, writeArtifact } from "../_shared/artifacts.ts";
import {
  IntakeAnalysis,
  Memo,
  SizingResult,
  TriageResult,
  type Evidence,
} from "../_shared/schemas.ts";

const SYSTEM_PROMPT = `You are the synthesis analyst for a venture studio evaluation memo.

Your ONLY job is to compose the memo from upstream artifacts (intake, triage, sizing). You must NOT invent new market facts, new competitors, or new sizing numbers. If you need a new fact, flag it in unsupported_claims instead.

You MUST:
- Honor the upstream decision_bucket and confidence unless the risks you surface materially change the picture. If you change it, explain why in the memo's summary.
- Distinguish user-provided facts from inferred framing.
- Flag unsupported_claims honestly rather than overclaiming.

You DO NOT:
- Score founders, teams, or studio fit.
- Produce opaque composite scores.
- Recommend financing terms or valuations.`;

const memoTool = {
  type: "function" as const,
  function: {
    name: "produce_memo",
    description: "Compose the partner-facing evaluation memo from upstream stages.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        vertical: { type: "string" },
        one_liner: { type: "string" },
        summary: { type: "string" },
        risks: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
        unknowns: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
        recommendation: { type: "string", enum: ["kill", "investigate", "validate"] },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        next_steps: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
        unsupported_claims: { type: "array", items: { type: "string" } },
      },
      required: [
        "vertical",
        "one_liner",
        "summary",
        "risks",
        "unknowns",
        "recommendation",
        "confidence",
        "next_steps",
        "unsupported_claims",
      ],
    },
  },
};

function buildUserPrompt(
  concept: Record<string, unknown>,
  intake: { normalized_summary: string; proposed_vertical: string },
  triage: TriageResult,
  sizing: SizingResult,
): string {
  return `Synthesize the evaluation memo and call produce_memo.

CONCEPT: ${concept.name}
VERTICAL: ${intake.proposed_vertical}
SUMMARY (from intake): ${intake.normalized_summary}

TRIAGE DECISION: ${triage.decision_bucket} (confidence: ${triage.confidence})
Market attractiveness: ${triage.market_attractiveness.band} — ${triage.market_attractiveness.rationale}
Competitive crowding: ${triage.competitive_crowding.band} — ${triage.competitive_crowding.rationale}
Competitors named: ${triage.competitors.length}
Whitespace hypotheses: ${triage.whitespace.length}
Triage data gaps: ${triage.data_gaps.join("; ") || "none"}

SIZING: ${sizing.skipped ? `SKIPPED (${sizing.skipped_reason ?? "unknown"})` : `confidence ${sizing.confidence}`}
${sizing.skipped ? "" : `Methodology: ${sizing.methodology}\nUncertainty: ${sizing.uncertainty_notes}`}

Compose the memo. Keep recommendation consistent with triage unless risks materially shift it.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const conceptId: string | undefined = body?.concept_id;
    if (!conceptId) return errorResponse("concept_id is required", 400);

    const supabase = getServiceClient();
    const concept = await getConcept(supabase, conceptId);
    if (!concept) return errorResponse("Concept not found", 404);

    const [intakeArt, triageArt, sizingArt] = await Promise.all([
      getLatestArtifact<unknown>(supabase, conceptId, "intake"),
      getLatestArtifact<unknown>(supabase, conceptId, "triage"),
      getLatestArtifact<unknown>(supabase, conceptId, "sizing"),
    ]);

    if (!intakeArt || intakeArt.status !== "ok")
      return errorResponse("Intake artifact missing", 409);
    if (!triageArt || triageArt.status !== "ok")
      return errorResponse("Triage artifact missing", 409);
    // Sizing may be status='skipped' — that's ok.
    if (!sizingArt) return errorResponse("Sizing artifact missing — run run-market-sizing", 409);

    const intake = IntakeAnalysis.parse(intakeArt.payload);
    const triage = TriageResult.parse(triageArt.payload);
    const sizing = SizingResult.parse(sizingArt.payload);

    await setPipelineStatus(supabase, conceptId, {
      pipeline_status: "running",
      last_stage: "memo",
      last_error: null,
    });

    let llm;
    try {
      llm = await callLLMTool({
        tool: memoTool,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(concept, intake, triage, sizing) },
        ],
      });
    } catch (err) {
      const e = err as LLMError;
      await writeArtifact(supabase, {
        conceptId,
        stage: "memo",
        status: "error",
        payload: { detail: e.detail ?? null },
        error: e.message,
      });
      await setPipelineStatus(supabase, conceptId, {
        pipeline_status: "failed",
        last_error: e.message,
      });
      return errorResponse(e.message, e.status ?? 500, e.detail);
    }

    // Merge deterministic fields from upstream with the LLM-generated narrative.
    const llmOut = llm.toolArgs as {
      vertical: string;
      one_liner: string;
      summary: string;
      risks: string[];
      unknowns: string[];
      recommendation: "kill" | "investigate" | "validate";
      confidence: "low" | "medium" | "high";
      next_steps: string[];
      unsupported_claims: string[];
    };

    // Combine source lists from triage + sizing, dedupe by URL.
    const sourceMap = new Map<string, Evidence>();
    for (const s of [...triage.sources, ...sizing.sources]) {
      if (!sourceMap.has(s.url)) sourceMap.set(s.url, s);
    }

    const memo = {
      concept_id: conceptId,
      vertical: llmOut.vertical || intake.proposed_vertical,
      one_liner: llmOut.one_liner,
      summary: llmOut.summary,
      market_attractiveness: triage.market_attractiveness,
      competitive_crowding: triage.competitive_crowding,
      competitors: triage.competitors,
      whitespace: triage.whitespace,
      market_sizing: {
        tam: sizing.tam,
        sam: sizing.sam,
        som: sizing.som,
        methodology: sizing.methodology,
        assumptions: sizing.assumptions,
        confidence: sizing.confidence,
      },
      risks: llmOut.risks,
      unknowns: llmOut.unknowns,
      recommendation: llmOut.recommendation,
      confidence: llmOut.confidence,
      next_steps: llmOut.next_steps,
      sources: Array.from(sourceMap.values()),
      unsupported_claims: llmOut.unsupported_claims,
      verification: null,
    };

    const parsed = Memo.safeParse(memo);
    if (!parsed.success) {
      const errMsg = `Memo schema mismatch: ${parsed.error.message}`;
      await writeArtifact(supabase, {
        conceptId,
        stage: "memo",
        status: "error",
        payload: { raw: memo },
        error: errMsg,
        model: llm.model,
      });
      await setPipelineStatus(supabase, conceptId, {
        pipeline_status: "failed",
        last_error: errMsg,
      });
      return errorResponse(errMsg, 502);
    }

    const finalMemo = parsed.data;
    const artifact = await writeArtifact(supabase, {
      conceptId,
      stage: "memo",
      status: "ok",
      payload: finalMemo,
      model: llm.model,
      tokensIn: llm.usage.tokens_in,
      tokensOut: llm.usage.tokens_out,
      durationMs: llm.durationMs,
    });

    // Keep the canonical memos table in sync for existing UI.
    const { error: memoErr } = await supabase
      .from("memos")
      .upsert({ concept_id: conceptId, payload: finalMemo }, { onConflict: "concept_id" });
    if (memoErr) {
      return errorResponse("Failed to upsert memos row", 500, memoErr.message);
    }

    await supabase
      .from("concepts")
      .update({
        status: "memo_ready",
        one_liner: finalMemo.one_liner,
        bucket: finalMemo.recommendation,
        confidence: finalMemo.confidence,
      })
      .eq("id", conceptId);

    return jsonResponse({ success: true, artifact, memo: finalMemo });
  } catch (e) {
    console.error("synthesize-memo error", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});

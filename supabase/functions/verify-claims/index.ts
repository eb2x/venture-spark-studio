// Stage 5 — verify-claims
//
// Non-LLM stage. Deterministic verification pass over the memo:
//   1. HEAD/GET-check every source URL (bounded parallelism, 8s timeout each).
//   2. Re-status each evidence entry (verified | unreachable).
//   3. Scan claim-sized sentences in the memo for any that don't appear to be
//      supported by any still-reachable evidence; add them to unsupported_claims.
//   4. Apply confidence downgrade policy (see _shared/verify.ts).
//
// Writes stage='verification' artifact AND updates the memos table payload +
// the concepts.confidence mirror. Returns the updated memo.

import { serve } from "std/http/server";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient, setPipelineStatus } from "../_shared/supabase.ts";
import { getLatestArtifact, writeArtifact } from "../_shared/artifacts.ts";
import { Memo, VerificationResult } from "../_shared/schemas.ts";
import {
  applyChecksToEvidence,
  checkUrls,
  findClaimsWithoutEvidence,
  maybeDowngradeConfidence,
} from "../_shared/verify.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const conceptId: string | undefined = body?.concept_id;
    if (!conceptId) return errorResponse("concept_id is required", 400);

    const supabase = getServiceClient();

    const memoArt = await getLatestArtifact<unknown>(supabase, conceptId, "memo");
    if (!memoArt || memoArt.status !== "ok") {
      return errorResponse(
        "No successful memo artifact — run synthesize-memo first.",
        409,
      );
    }
    const parsed = Memo.safeParse(memoArt.payload);
    if (!parsed.success) return errorResponse("Memo artifact payload is malformed", 500);
    const memo = parsed.data;

    await setPipelineStatus(supabase, conceptId, {
      pipeline_status: "running",
      last_stage: "verification",
      last_error: null,
    });

    // 1. Check URLs
    const urls = memo.sources.map((s) => s.url);
    const urlChecks = await checkUrls(urls);
    const failedCount = urlChecks.filter((c) => !c.ok).length;
    const failRate = urlChecks.length === 0 ? 1 : failedCount / urlChecks.length;

    // 2. Re-status evidence
    const updatedSources = applyChecksToEvidence(memo.sources, urlChecks);
    const verifiableMemo = { ...memo, sources: updatedSources };

    // 3. Flag claim-sized sentences that don't match any reachable source.
    const orphans = findClaimsWithoutEvidence(verifiableMemo);
    const existing = new Set(memo.unsupported_claims);
    const newlyUnsupported = orphans.filter((c) => !existing.has(c));
    const finalUnsupported = [...memo.unsupported_claims, ...newlyUnsupported];

    // 4. Confidence downgrade
    const confidenceAfter = maybeDowngradeConfidence(
      memo.confidence,
      failRate,
      newlyUnsupported.length,
    );
    const downgraded = confidenceAfter !== memo.confidence;

    const verification: VerificationResult = {
      url_checks: urlChecks,
      claims_without_evidence: orphans,
      unsupported_claims_added: newlyUnsupported,
      confidence_before: memo.confidence,
      confidence_after: confidenceAfter,
      confidence_downgraded: downgraded,
      notes: [
        `Checked ${urlChecks.length} URL(s); ${failedCount} failed (${Math.round(failRate * 100)}%).`,
        `${newlyUnsupported.length} claim(s) added to unsupported_claims.`,
        downgraded
          ? `Confidence downgraded: ${memo.confidence} → ${confidenceAfter}.`
          : "Confidence unchanged.",
      ],
    };

    // Build updated memo
    const updatedMemo = {
      ...memo,
      sources: updatedSources,
      unsupported_claims: finalUnsupported,
      confidence: confidenceAfter,
      verification: {
        ran_at: new Date().toISOString(),
        url_checks_total: urlChecks.length,
        url_checks_failed: failedCount,
        unsupported_claims_added: newlyUnsupported.length,
        confidence_downgraded: downgraded,
        original_confidence: memo.confidence,
      },
    };

    const memoValidation = Memo.safeParse(updatedMemo);
    if (!memoValidation.success) {
      return errorResponse(
        `Updated memo failed validation: ${memoValidation.error.message}`,
        500,
      );
    }

    const artifact = await writeArtifact(supabase, {
      conceptId,
      stage: "verification",
      status: "ok",
      payload: verification,
      durationMs: null,
    });

    // Update canonical memo + concept mirror
    const { error: memoErr } = await supabase
      .from("memos")
      .upsert(
        { concept_id: conceptId, payload: memoValidation.data },
        { onConflict: "concept_id" },
      );
    if (memoErr) return errorResponse("Failed to update memos row", 500, memoErr.message);

    await supabase
      .from("concepts")
      .update({ confidence: confidenceAfter, pipeline_status: "ready" })
      .eq("id", conceptId);

    return jsonResponse({
      success: true,
      artifact,
      verification,
      memo: memoValidation.data,
    });
  } catch (e) {
    console.error("verify-claims error", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});

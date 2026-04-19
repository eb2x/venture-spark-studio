// pipeline_artifacts helpers: every stage writes one row so we can inspect
// intermediate outputs, diff runs, and rerun a single stage.
//
// Versioning: `writeArtifact` auto-increments version per (concept_id, stage).
// `getLatestArtifact` returns the highest-version row for that stage.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineStage } from "./schemas.ts";

export type WriteArtifactInput = {
  conceptId: string;
  stage: PipelineStage;
  status?: "ok" | "error" | "skipped";
  payload: unknown;
  error?: string | null;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  durationMs?: number | null;
};

export async function writeArtifact(
  supabase: SupabaseClient,
  input: WriteArtifactInput,
): Promise<{ id: string; version: number }> {
  // Atomic-enough version bump. Race between two concurrent writes for the same
  // (concept, stage) would surface as a unique-violation; the orchestrator
  // serializes stages so this shouldn't happen in practice, but we retry once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: latest } = await supabase
      .from("pipeline_artifacts")
      .select("version")
      .eq("concept_id", input.conceptId)
      .eq("stage", input.stage)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const version = (latest?.version ?? 0) + 1;
    const { data, error } = await supabase
      .from("pipeline_artifacts")
      .insert({
        concept_id: input.conceptId,
        stage: input.stage,
        version,
        status: input.status ?? "ok",
        payload: input.payload ?? {},
        error: input.error ?? null,
        model: input.model ?? null,
        tokens_in: input.tokensIn ?? null,
        tokens_out: input.tokensOut ?? null,
        duration_ms: input.durationMs ?? null,
      })
      .select("id, version")
      .single();

    if (!error && data) return { id: data.id, version: data.version };
    // 23505 = unique_violation → someone else bumped version, retry.
    if (error && (error as { code?: string }).code !== "23505") throw error;
  }
  throw new Error("writeArtifact: failed after retry on version race");
}

export async function getLatestArtifact<T = unknown>(
  supabase: SupabaseClient,
  conceptId: string,
  stage: PipelineStage,
): Promise<
  | {
      id: string;
      version: number;
      status: "ok" | "error" | "skipped";
      payload: T;
      error: string | null;
      created_at: string;
    }
  | null
> {
  const { data, error } = await supabase
    .from("pipeline_artifacts")
    .select("id, version, status, payload, error, created_at")
    .eq("concept_id", conceptId)
    .eq("stage", stage)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as typeof data & { payload: T }) ?? null;
}

export async function listArtifacts(
  supabase: SupabaseClient,
  conceptId: string,
): Promise<
  Array<{
    id: string;
    stage: PipelineStage;
    version: number;
    status: "ok" | "error" | "skipped";
    error: string | null;
    created_at: string;
  }>
> {
  const { data, error } = await supabase
    .from("pipeline_artifacts")
    .select("id, stage, version, status, error, created_at")
    .eq("concept_id", conceptId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    stage: PipelineStage;
    version: number;
    status: "ok" | "error" | "skipped";
    error: string | null;
    created_at: string;
  }>;
}

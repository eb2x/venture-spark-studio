# Architecture

## Why a 5-stage pipeline instead of one-shot

The Lovable prototype generated a full memo in a single LLM tool call. That
works as a starting point, but conflates five separable concerns: quality-
gating the intake, building a competitive map, sizing the market, composing a
memo, and verifying claims. Conflating them means:

- **No inspection.** When the output is bad, you can't tell which step failed.
- **No reruns.** A flaky URL fetch in source-grounding forces a full regen.
- **No gating.** The model decides whether a concept is "ready" implicitly.
- **No verification.** Every claim is the model's word.

The current architecture splits those five concerns into independently
invokable edge functions that persist their intermediate outputs.

## Stages

| # | Function                   | Input                                  | Output (stored in `pipeline_artifacts`) |
| - | -------------------------- | -------------------------------------- | --------------------------------------- |
| 1 | `analyze-intake`           | `concepts` row                         | `IntakeAnalysis` — normalized summary, proposed vertical, ambiguity flags, clarification prompts, **readiness gate** |
| 2 | `run-competitive-triage`   | Stage 1 artifact                       | `TriageResult` — competitors, whitespace, decision_bucket, confidence, attractiveness/crowding bands, data gaps, sources |
| 3 | `run-market-sizing`        | Stage 1 + Stage 2 artifacts            | `SizingResult` — TAM/SAM/SOM **ranges**, methodology, assumptions, comparables, uncertainty notes. Auto-**skipped** when triage recommends `kill`. |
| 4 | `synthesize-memo`          | Stages 1–3 artifacts                   | `Memo` — composes the partner-facing memo; adds risks, unknowns, recommendation, next_steps. Upserts into the canonical `memos` table. |
| 5 | `verify-claims`            | Stage 4 artifact                       | `VerificationResult` — URL HEAD/GET checks, orphan-claim detection, **confidence downgrade**. Updates memo payload. |

Plus:

- `run-pipeline` — orchestrator that chains stages 1–5 and short-circuits
  cleanly.
- `generate-memo` — legacy one-shot, retained as a fallback.

## Data model

### `pipeline_artifacts`

One row per `(concept_id, stage, version)`. Version auto-increments on rerun
so prior outputs stay inspectable.

```sql
CREATE TABLE public.pipeline_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID REFERENCES public.concepts(id) ON DELETE CASCADE,
  stage TEXT CHECK (stage IN ('intake','triage','sizing','memo','verification')),
  version INT NOT NULL DEFAULT 1,
  status TEXT CHECK (status IN ('ok','error','skipped')),
  payload JSONB NOT NULL,
  error TEXT, model TEXT, tokens_in INT, tokens_out INT, duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (concept_id, stage, version)
);
```

`concepts` gains `pipeline_status`, `last_stage`, `last_error` so the
list view can render without joining artifacts.

### Shared schemas

`supabase/functions/_shared/schemas.ts` is the single source of truth for
every shape that crosses the frontend ↔ backend boundary. It is imported by:

- Edge functions (Deno) — via relative path
- Frontend (Vite / TS) — via `@shared/*` tsconfig + vite alias

Zod is the schema library. Each stage `safeParse`s its inputs and outputs, so
schema drift surfaces as a typed error rather than silent data corruption.

## Verification policy

`verify-claims` runs three checks and applies a confidence downgrade:

1. **URL reachability.** HEAD every source URL; fall back to GET on non-2xx.
   Per-request timeout 8s; bounded parallelism (6). Each source's `status`
   becomes `verified` or `unreachable`.

2. **Orphan claim detection.** Split memo narrative (summary, rationales,
   methodology, risks) into sentences; for each claim-sized sentence, check
   whether any still-reachable source's `supports` field shares at least one
   content word. Sentences with no overlap are appended to
   `unsupported_claims`. This is heuristic — a safety net, not a semantic
   fact-checker.

3. **Confidence downgrade** (in `_shared/verify.ts`):
   - ≥ 50% of URLs failed → step down one band
   - ≥ 3 orphan claims added → step down one band
   - Both → step down two bands (floored at `low`)

When a downgrade fires, the memo records the original confidence in
`verification.original_confidence` so the UI can surface `high → medium`
instead of just `medium`.

## Error handling contract

- Every stage writes a `pipeline_artifacts` row on **both** success and
  failure. Failed artifacts store the error message plus whatever raw output
  the LLM returned, so you can see exactly what went wrong.
- Orchestrator short-circuits on any stage error; the partial per-stage log is
  returned so the frontend can resume from the failed stage.
- The frontend automatically falls back to the legacy `generate-memo` fast
  path on **transient** (retryable) pipeline failures only — rate limits,
  timeouts, 502/503/504. Schema mismatches and readiness-gate rejections
  surface to the user as-is.

## Rerun semantics

Stages are idempotent across versions. `writeArtifact` always inserts a NEW
row with `version = max + 1`. Downstream stages always read the *latest*
version via `getLatestArtifact`. This means:

- Rerunning `run-competitive-triage` alone bumps triage → v2; `synthesize-memo`
  run next will consume intake v1 + triage v2 + sizing v1.
- Rerunning `analyze-intake` does not cascade — you must explicitly rerun the
  downstream stages (or re-invoke `run-pipeline`). This is deliberate: intake
  reruns often happen after a clarification and should be a conscious
  decision, not an implicit cascade.

## Open TODOs / future work

- **Auth + multi-tenancy.** RLS is currently permissive; tighten to
  `concepts.owner_id = auth.uid()` when auth is added.
- **Realtime pipeline status.** The current UI polls on load. Subscribing to
  `pipeline_artifacts` via Supabase realtime would give live per-stage
  progress during a run.
- **Schema-regression tests.** `_shared/schemas.ts` is load-bearing; add
  round-trip tests that assert `safeParse` still accepts sample payloads from
  each stage.
- **Replace the heuristic orphan-claim detector** with a small cross-encoder
  or retrieval-based check once we have real memo telemetry.

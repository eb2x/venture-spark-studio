# venture-spark-studio

AI-assisted venture concept evaluation platform for venture studios. A studio
partner submits an 8-field concept intake; the platform runs it through a
5-stage pipeline and produces a decision-ready memo with a clear
kill / investigate / validate recommendation, a banded market-attractiveness
and competitive-crowding assessment, and a source-backed audit trail.

Target workflow:

- Concept intake + triage in **under 30 minutes**
- Full memo in **under 60 minutes** for concepts that pass triage

## Architecture overview

```
┌────────────┐   createConcept   ┌──────────────────┐
│ React + ui │ ────────────────▶ │  Supabase (DB)   │
│ (src/)     │ ◀──────────────── │  concepts, memos │
└────────────┘   getMemo / pipe  │  pipeline_artifacts
        │                        └──────────────────┘
        │  runPipeline(concept_id)       ▲
        ▼                                │
┌──────────────────────────────────────────────────────────────┐
│  supabase/functions/run-pipeline   (orchestrator)            │
│    1. analyze-intake          → pipeline_artifacts.intake    │
│    2. run-competitive-triage  → pipeline_artifacts.triage    │
│    3. run-market-sizing       → pipeline_artifacts.sizing    │
│    4. synthesize-memo         → pipeline_artifacts.memo +    │
│                                  memos (canonical)           │
│    5. verify-claims           → pipeline_artifacts.verific.  │
│                                  + updates memo              │
│                                                              │
│  Each stage is independently invokable (rerun-a-single-stage)│
│  Fallback: generate-memo — legacy one-shot fast path         │
└──────────────────────────────────────────────────────────────┘
```

Full details: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Project layout

```
src/
  pages/              — route components (Concepts, NewConcept, Memo)
  components/         — shared UI (shadcn + custom)
  lib/api.ts          — frontend ↔ backend contract (pipeline control)
  integrations/supabase/ — auto-generated DB types + client
  data/sampleConcepts — camelCase view types + demo samples

supabase/
  migrations/         — SQL migrations (concepts, memos, pipeline_artifacts)
  functions/
    _shared/          — canonical domain schemas + helpers
      schemas.ts      — ★ single source of truth for all domain types (Zod)
      llm.ts          — AI gateway wrapper with retry + error classification
      artifacts.ts    — pipeline_artifacts CRUD
      verify.ts       — URL checking + confidence downgrade policy
    analyze-intake/            — Stage 1
    run-competitive-triage/    — Stage 2
    run-market-sizing/         — Stage 3
    synthesize-memo/           — Stage 4
    verify-claims/             — Stage 5
    run-pipeline/              — orchestrator
    generate-memo/             — LEGACY fallback
```

Domain types live in `supabase/functions/_shared/schemas.ts` and are imported
by both the frontend (via the `@shared/*` Vite + tsconfig alias) and the edge
functions (via relative path + the Deno `deno.json` import map).

## Setup

### Prerequisites

- [Bun](https://bun.sh) or Node 20+ (lockfiles for both are checked in)
- [Supabase CLI](https://supabase.com/docs/guides/cli) for running edge
  functions locally and deploying migrations

### Install & run

```bash
bun install                 # or: npm install
cp .env.example .env        # fill in your Supabase project credentials
bun run dev                 # Vite on http://localhost:8080
```

### Environment variables

Frontend (committed to the browser bundle — keep public-safe):

| Variable                        | Where                          |
| ------------------------------- | ------------------------------ |
| `VITE_SUPABASE_URL`             | Supabase project URL           |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon / publishable key |
| `VITE_SUPABASE_PROJECT_ID`      | Supabase project ref           |

Edge functions (set via `supabase secrets set`, never committed):

| Variable                    | Source                                  |
| --------------------------- | --------------------------------------- |
| `SUPABASE_URL`              | auto-injected in Supabase runtime       |
| `SUPABASE_SERVICE_ROLE_KEY` | auto-injected in Supabase runtime       |
| `LOVABLE_API_KEY`           | token for the Lovable AI gateway (OpenAI-compatible) |

### Database

Apply migrations:

```bash
supabase db push
```

This creates three tables: `concepts`, `memos`, `pipeline_artifacts` (all
currently with permissive RLS for v1 demo mode — tighten when auth is added).

### Edge functions

Serve locally:

```bash
bun run supabase:functions:serve
```

Deploy all pipeline functions:

```bash
bun run supabase:deploy
```

## Pipeline in a sentence

`runPipeline(conceptId)` invokes the 5 stage functions in order. Each stage
writes a row to `pipeline_artifacts` (versioned per stage). Short-circuits:
intake sets `readiness=needs_clarification` → pipeline stops; triage recommends
`kill` → sizing auto-skips but memo + verification still run. The verification
stage HEAD-checks every source URL, flags claims without supporting evidence,
and auto-downgrades memo confidence if too many sources failed.

Frontend calls `runPipeline` for new concepts and full reruns. Individual
stages remain callable (`runStage(id, 'triage')`) so a single failing stage
can be retried without redoing prior work.

## Non-goals (from the spec)

- No founder / team / studio-fit scoring
- No opaque composite scores or automated investment decisions
- No real-time market monitoring
- Hardware, biotech, and deep-research concepts are out of scope for v1

## Legacy fast path

`generate-memo` is the original one-shot edge function that produces the memo
from a single LLM tool call. It is **kept as a fallback** (invoked
automatically on transient pipeline failures) but is not the architecture new
features should build on.

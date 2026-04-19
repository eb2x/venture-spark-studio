-- Pipeline artifacts: per-stage outputs so we can inspect, diff, and rerun single stages.
--
-- One row per (concept_id, stage, version). version increments on rerun so prior
-- outputs stay inspectable. The latest version per (concept_id, stage) is what
-- downstream stages and the UI read.

CREATE TABLE public.pipeline_artifacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concept_id UUID NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('intake','triage','sizing','memo','verification')),
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error','skipped')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  model TEXT,
  tokens_in INT,
  tokens_out INT,
  duration_ms INT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (concept_id, stage, version)
);

CREATE INDEX idx_pipeline_artifacts_concept_stage
  ON public.pipeline_artifacts (concept_id, stage, version DESC);

ALTER TABLE public.pipeline_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read pipeline_artifacts"
  ON public.pipeline_artifacts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert pipeline_artifacts"
  ON public.pipeline_artifacts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update pipeline_artifacts"
  ON public.pipeline_artifacts FOR UPDATE USING (true);

-- Track pipeline state on the concept itself so the list/dashboard UI can render
-- without joining artifacts.
ALTER TABLE public.concepts
  ADD COLUMN IF NOT EXISTS pipeline_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (pipeline_status IN ('not_started','running','ready','failed','needs_clarification')),
  ADD COLUMN IF NOT EXISTS last_stage TEXT
    CHECK (last_stage IN ('intake','triage','sizing','memo','verification')),
  ADD COLUMN IF NOT EXISTS last_error TEXT;

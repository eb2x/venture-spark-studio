
-- Concepts: structured intake + triage results
CREATE TABLE public.concepts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  target_customer TEXT NOT NULL,
  problem TEXT NOT NULL,
  buyer_user TEXT NOT NULL,
  business_model TEXT NOT NULL,
  why_now TEXT NOT NULL,
  alternatives TEXT NOT NULL,
  vertical TEXT,
  one_liner TEXT,
  status TEXT NOT NULL DEFAULT 'intake',
  bucket TEXT,
  confidence TEXT,
  market_attractiveness TEXT,
  competitive_crowding TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Memos: full structured evaluation memo, one per concept
CREATE TABLE public.memos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concept_id UUID NOT NULL UNIQUE REFERENCES public.concepts(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_concepts_created_at ON public.concepts (created_at DESC);
CREATE INDEX idx_memos_concept_id ON public.memos (concept_id);

-- RLS: v1 demo is single-tenant / public; readable + insertable by anyone.
-- Tighten when auth is added.
ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read concepts" ON public.concepts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert concepts" ON public.concepts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update concepts" ON public.concepts FOR UPDATE USING (true);

CREATE POLICY "Anyone can read memos" ON public.memos FOR SELECT USING (true);
CREATE POLICY "Anyone can insert memos" ON public.memos FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update memos" ON public.memos FOR UPDATE USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_concepts_updated_at
BEFORE UPDATE ON public.concepts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_memos_updated_at
BEFORE UPDATE ON public.memos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  files_uploaded TEXT[] NOT NULL DEFAULT '{}',
  documents_count INTEGER NOT NULL DEFAULT 0,
  trends_found INTEGER NOT NULL DEFAULT 0,
  claude_response JSONB
);

ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view scans" ON public.scans FOR SELECT USING (true);
CREATE POLICY "Anyone can insert scans" ON public.scans FOR INSERT WITH CHECK (true);

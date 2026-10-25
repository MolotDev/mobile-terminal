ALTER TABLE public.checkpoint_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Crew insert checkpoint reports" ON public.checkpoint_reports;
CREATE POLICY "Crew insert checkpoint reports"
ON public.checkpoint_reports
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Crew read launches" ON public.launches;
CREATE POLICY "Crew read launches"
ON public.launches
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Crew report launches" ON public.launches;
CREATE POLICY "Crew report launches"
ON public.launches
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

GRANT SELECT, UPDATE ON public.launches TO anon, authenticated;
GRANT INSERT ON public.checkpoint_reports TO anon, authenticated;

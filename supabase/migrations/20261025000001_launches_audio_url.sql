ALTER TABLE public.launches
ADD COLUMN IF NOT EXISTS audio_url TEXT;

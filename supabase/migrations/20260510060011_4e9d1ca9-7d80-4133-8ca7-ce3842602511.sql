CREATE TABLE IF NOT EXISTS public.app_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_state" ON public.app_state FOR SELECT USING (true);
CREATE POLICY "Anyone can insert app_state" ON public.app_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update app_state" ON public.app_state FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete app_state" ON public.app_state FOR DELETE USING (true);

ALTER TABLE public.app_state REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_state;
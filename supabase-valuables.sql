-- Vor dem Deployment im Supabase SQL Editor ausführen.
-- Bestehende Einträge bleiben in der Verkaufsliste, RLS bleibt unverändert.
alter table public.selling_items
  add column if not exists category text not null default 'selling'
  check (category in ('selling', 'valuables'));
notify pgrst, 'reload schema';

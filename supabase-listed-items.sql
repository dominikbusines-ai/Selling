-- Additive Migration: bestehende Artikel und Verkaufsstatus bleiben erhalten.
alter table public.selling_items
  add column if not exists listed boolean not null default false;

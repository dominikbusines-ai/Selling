-- Erweiterung für Verkaufsstatus und tatsächlichen Verkaufspreis
alter table public.selling_items
  add column if not exists sold boolean not null default false,
  add column if not exists sold_price_cents integer,
  add column if not exists sold_at timestamptz;

alter table public.selling_items
  drop constraint if exists selling_items_sold_price_cents_check;

alter table public.selling_items
  add constraint selling_items_sold_price_cents_check
  check (sold_price_cents is null or sold_price_cents >= 0);

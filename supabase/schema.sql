-- Someone's PC — Supabase schema (per-user accounts)
-- Run this in the Supabase SQL editor for a NEW project.
-- Migrating an existing single-user project? Use migration-auth.sql instead.
--
-- Every row belongs to an auth user, and row-level security enforces that in
-- the database itself — not in the client. Even with the anon key in hand, a
-- request can only ever see rows belonging to the signed-in account.

create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trainer_name text not null default ''
);

create table if not exists storages (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  type text not null check (type in ('deck', 'bulk')),
  cards jsonb not null default '[]'::jsonb,
  is_default_bulk boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists collection (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  "set" text not null default '',
  number text not null default '',
  total integer not null default 0,
  card_type text not null default 'pokemon',
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists collection_user_id_idx on collection(user_id);
create index if not exists storages_user_id_idx   on storages(user_id);

alter table user_settings enable row level security;
alter table storages      enable row level security;
alter table collection    enable row level security;

-- `using` decides which rows are visible/updatable/deletable; `with check`
-- decides what may be written. Both are needed — without `with check` a user
-- could insert rows owned by someone else.
create policy "own row" on user_settings
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on storages
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on collection
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Basic energy rows are seeded per account by the app on first sign-in (see
-- seedBasicEnergy in src/App.jsx) rather than here, since every row now needs
-- an owner. They carry no set/number, which is what marks them as ordinary
-- unlimited energy; art-rare energy prints are tracked as normal cards.

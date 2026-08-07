-- Someone's PC — migration: single-user → per-user accounts
--
-- Run this against an EXISTING project that was set up with the original
-- schema.sql (the one whose policies granted the anon key full access). A brand
-- new project should just run schema.sql, which already includes all of this.
--
-- Run it in two parts, in this order:
--
--   PART 1  now — adds the columns and locks the tables down.
--   ...then sign in to the app once with your email, so an auth user exists.
--   PART 2  after that first sign-in — hands your existing cards to that account.
--
-- Between the two parts your data is invisible to the app (it belongs to no
-- account yet). It is not deleted, and Part 2 gives it back.

-- ---------------------------------------------------------------------------
-- PART 1 — schema + policies
-- ---------------------------------------------------------------------------

-- Ownership column. Nullable for now: existing rows have no owner until Part 2,
-- and a NOT NULL here would reject the whole migration.
alter table collection add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table storages   add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists collection_user_id_idx on collection(user_id);
create index if not exists storages_user_id_idx   on storages(user_id);

-- The old settings table was a hardcoded single row (id = 1) holding one
-- trainer name. Per-user, the user IS the key.
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trainer_name text not null default ''
);
alter table user_settings enable row level security;

-- Replace the wide-open policies. `using` governs which rows are readable /
-- updatable / deletable; `with check` governs what may be written — together
-- they make it impossible for one signed-in user to touch another's rows, no
-- matter what the client asks for.
drop policy if exists "anon full access" on collection;
drop policy if exists "anon full access" on storages;
drop policy if exists "anon full access" on settings;

create policy "own rows" on collection
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on storages
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own row" on user_settings
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- PART 2 — claim existing data (run AFTER signing in to the app once)
-- ---------------------------------------------------------------------------
-- Replace the email below with the one you signed in with, then run just this
-- section. Every ownerless row becomes yours.
--
-- do $$
-- declare
--   me uuid;
-- begin
--   select id into me from auth.users where email = 'you@example.com';
--   if me is null then
--     raise exception 'No auth user with that email — sign in to the app first.';
--   end if;
--
--   update collection set user_id = me where user_id is null;
--   update storages   set user_id = me where user_id is null;
--
--   insert into user_settings (user_id, trainer_name)
--   select me, coalesce((select trainer_name from settings where id = 1), '')
--   on conflict (user_id) do nothing;
-- end $$;
--
-- Once that runs cleanly and the app looks right, the old singleton table can
-- go:  drop table if exists settings;

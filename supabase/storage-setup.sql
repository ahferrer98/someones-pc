-- Someone's PC — card art cache bucket
--
-- Card art is public, non-sensitive data (the images themselves, not your
-- collection), so this bucket is world-readable and world-writable-by-upload
-- on purpose — the /api/card-image function uses the plain anon key to write
-- to it, no service_role key needed anywhere. The policies below are scoped
-- tightly to this one bucket; they grant nothing on collection, storages, or
-- user_settings.

insert into storage.buckets (id, name, public)
values ('card-art', 'card-art', true)
on conflict (id) do nothing;

-- INSERT covers a brand-new cache entry; UPDATE covers the upsert path the
-- proxy function uses if two requests for the same uncached card land at once.
create policy "anyone can add card art" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'card-art');

-- Both `using` and `with check` are required here, not just `using` — the
-- `.upload(..., { upsert: true })` call the proxy function makes compiles to
-- an INSERT ... ON CONFLICT DO UPDATE, and Postgres validates the update
-- branch's new row against `with check`, not `using`. Leaving it unset (which
-- looked harmless — a bare `using` policy still lets ordinary UPDATEs
-- through) silently broke every upsert with "new row violates row-level
-- security policy", while a plain non-upsert insert worked fine.
create policy "anyone can replace card art" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'card-art')
  with check (bucket_id = 'card-art');

-- A public bucket's file *downloads* bypass RLS entirely (they go through the
-- public URL, not a table SELECT) — but `.upload(..., { upsert: true })` still
-- needs to check server-side whether the file already exists before deciding
-- insert vs. update, and that check IS a SELECT against storage.objects,
-- silently blocked without a policy of its own. Confirmed by testing: a plain
-- non-upsert insert worked with no SELECT policy at all; upsert failed with
-- "new row violates row-level security policy" until this was added.
create policy "anyone can list card art" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'card-art');

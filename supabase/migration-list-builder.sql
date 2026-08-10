-- Someone's PC — List Builder "build a deck" migration
-- Run this once in the Supabase SQL editor for an existing project.
--
-- Adds a flag distinguishing decks assembled by List Builder (which only
-- reallocates cards you've already logged, and never touches OWNED) from
-- decks created via the regular paste-import tool (which can raise OWNED
-- to cover anything short). Defaults to false, so every existing deck is
-- correctly treated as a regular one.

alter table storages add column if not exists built_from_list boolean not null default false;

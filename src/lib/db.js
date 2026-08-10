import { supabase, supabaseConfigured } from "../supabaseClient";

function assertConfigured() {
  if (!supabaseConfigured) {
    throw new Error(
      "Supabase isn't configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env."
    );
  }
}

// The signed-in user's id, stamped onto every row this module creates. Reads
// don't need it — row-level security already restricts what comes back — but
// inserts do, since the policies' `with check` clause rejects a row that claims
// any other owner. Set once when the auth session resolves.
let currentUserId = null;

export function setCurrentUser(userId) {
  currentUserId = userId || null;
}

function requireUser() {
  if (!currentUserId) throw new Error("Not signed in.");
  return currentUserId;
}

// Every mutation for a given row is fired off without being awaited by the
// caller (so the UI stays responsive), which means multiple writes to the same
// row — e.g. importing a 60-card decklist, which fires one storages update per
// line — can land at Supabase out of order over the network. Whichever request
// resolves last wins, and that's not guaranteed to be the one sent last, so an
// earlier (smaller) snapshot can silently clobber a later, more complete one.
// This queues writes per row key so each one waits for the previous one on the
// same row to finish before it starts, preserving call order end-to-end.
const rowQueues = new Map();

function serialize(key, task) {
  const prevTail = rowQueues.get(key) || Promise.resolve();
  const run = prevTail.then(task, task);
  rowQueues.set(
    key,
    run.then(
      () => {},
      () => {}
    )
  );
  return run;
}

// Maps between the app's camelCase data model and the Supabase tables'
// snake_case columns (see supabase/schema.sql).

function cardFromRow(r) {
  return {
    id: r.id,
    name: r.name,
    set: r.set || "",
    number: r.number || "",
    total: r.total,
    cardType: r.card_type || "pokemon",
    imageUrl: r.image_url || undefined,
  };
}

function storageFromRow(r) {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    type: r.type,
    cards: r.cards || [],
    isDefaultBulk: !!r.is_default_bulk,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// No user filter on the selects: row-level security already scopes them to the
// signed-in account, and duplicating that here would just be a second place to
// get it wrong. `hasSettingsRow` distinguishes a brand-new account (needs its
// starter energy seeded) from one whose trainer name is simply blank.
//
// This is the very first network call the app makes after sign-in, right as
// the page (and the Supabase client's session restore) is still settling —
// exactly the moment a cold connection, a DNS hiccup, or a brief lag before
// the session is fully attached to outgoing requests is most likely to bite.
// Previously a single failure here was permanent until a manual refresh; now
// it retries a few times with backoff before actually giving up.
export async function fetchAll() {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(400 * 2 ** (attempt - 1));
    try {
      return await fetchAllOnce();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function fetchAllOnce() {
  assertConfigured();
  const userId = requireUser();
  const [cardsRes, storagesRes, settingsRes] = await Promise.all([
    supabase.from("collection").select("*"),
    supabase.from("storages").select("*"),
    supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  if (cardsRes.error) throw cardsRes.error;
  if (storagesRes.error) throw storagesRes.error;
  if (settingsRes.error) throw settingsRes.error;
  return {
    collection: (cardsRes.data || []).map(cardFromRow),
    storages: (storagesRes.data || []).map(storageFromRow),
    trainerName: settingsRes.data?.trainer_name || "",
    hasSettingsRow: !!settingsRes.data,
  };
}

export function insertCard(card) {
  return serialize(`card:${card.id}`, async () => {
    const { error } = await supabase.from("collection").insert({
      id: card.id,
      user_id: requireUser(),
      name: card.name,
      set: card.set,
      number: card.number,
      total: card.total,
      card_type: card.cardType,
      image_url: card.imageUrl || null,
    });
    if (error) throw error;
  });
}

// Bulk insert used when seeding a new account's basic energy.
export async function insertCards(cards) {
  const userId = requireUser();
  const { error } = await supabase.from("collection").insert(
    cards.map((card) => ({
      id: card.id,
      user_id: userId,
      name: card.name,
      set: card.set,
      number: card.number,
      total: card.total,
      card_type: card.cardType,
      image_url: card.imageUrl || null,
    }))
  );
  if (error) throw error;
}

export function updateCard(id, patch) {
  return serialize(`card:${id}`, async () => {
    const row = {};
    if ("total" in patch) row.total = patch.total;
    if ("imageUrl" in patch) row.image_url = patch.imageUrl || null;
    if ("cardType" in patch) row.card_type = patch.cardType;
    const { error } = await supabase.from("collection").update(row).eq("id", id);
    if (error) throw error;
  });
}

export function deleteCard(id) {
  return serialize(`card:${id}`, async () => {
    const { error } = await supabase.from("collection").delete().eq("id", id);
    if (error) throw error;
  });
}

export function insertStorage(storage) {
  return serialize(`storage:${storage.id}`, async () => {
    const { error } = await supabase.from("storages").insert({
      id: storage.id,
      user_id: requireUser(),
      name: storage.name,
      color: storage.color,
      type: storage.type,
      cards: storage.cards,
      is_default_bulk: !!storage.isDefaultBulk,
    });
    if (error) throw error;
  });
}

export function updateStorageRow(id, patch) {
  return serialize(`storage:${id}`, async () => {
    const row = {};
    if ("name" in patch) row.name = patch.name;
    if ("color" in patch) row.color = patch.color;
    if ("type" in patch) row.type = patch.type;
    if ("cards" in patch) row.cards = patch.cards;
    if ("isDefaultBulk" in patch) row.is_default_bulk = patch.isDefaultBulk;
    const { error } = await supabase.from("storages").update(row).eq("id", id);
    if (error) throw error;
  });
}

export function deleteStorageRow(id) {
  return serialize(`storage:${id}`, async () => {
    const { error } = await supabase.from("storages").delete().eq("id", id);
    if (error) throw error;
  });
}

export async function setTrainerName(name) {
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: requireUser(), trainer_name: name });
  if (error) throw error;
}

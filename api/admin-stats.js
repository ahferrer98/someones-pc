import { createClient } from "@supabase/supabase-js";

// Owner-only usage view: who has signed up, when they last signed in, and
// how much they've logged. Row-level security means the app's normal anon
// key can only ever see the signed-in account's own rows, so this has to
// run server-side with the service_role key, which bypasses RLS entirely.
// That key must never reach the browser — VITE_-prefixed env vars get
// inlined into the client bundle by Vite, so this one deliberately isn't
// prefixed that way, same reasoning as api/card-image.js keeping its own
// key out of the frontend, just for a much more sensitive key.
//
// Authorization is two-layered: the caller must present a valid Supabase
// session token (proves who they are), and that session's email must match
// VITE_ADMIN_EMAIL exactly (proves they're allowed to see everyone's data).
// The email check happens here, not in the client — hiding the tab in the
// UI is just so other users never see it, not what actually protects it.

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.VITE_ADMIN_EMAIL;

export default async function handler(req, res) {
  if (!url || !serviceKey || !adminEmail) {
    res.status(500).json({ error: "Admin stats aren't configured on this deployment." });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing session token." });
    return;
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    res.status(401).json({ error: "Invalid or expired session." });
    return;
  }
  if (userData.user.email !== adminEmail) {
    res.status(403).json({ error: "Not authorized." });
    return;
  }

  try {
    const accounts = [];
    for (let page = 1; ; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      accounts.push(...data.users);
      if (data.users.length < 200) break;
    }

    const [cardsRes, storagesRes] = await Promise.all([
      admin.from("collection").select("user_id"),
      admin.from("storages").select("user_id, type"),
    ]);
    if (cardsRes.error) throw cardsRes.error;
    if (storagesRes.error) throw storagesRes.error;

    const cardCounts = new Map();
    for (const r of cardsRes.data) cardCounts.set(r.user_id, (cardCounts.get(r.user_id) || 0) + 1);

    const deckCounts = new Map();
    const bulkCounts = new Map();
    for (const r of storagesRes.data) {
      const counts = r.type === "deck" ? deckCounts : bulkCounts;
      counts.set(r.user_id, (counts.get(r.user_id) || 0) + 1);
    }

    const users = accounts
      .map((u) => ({
        email: u.email,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at || null,
        confirmed: !!u.email_confirmed_at,
        uniqueCards: cardCounts.get(u.id) || 0,
        decks: deckCounts.get(u.id) || 0,
        bulkTrays: bulkCounts.get(u.id) || 0,
      }))
      .sort((a, b) => new Date(b.lastSignInAt || b.createdAt) - new Date(a.lastSignInAt || a.createdAt));

    res.status(200).json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to load admin stats." });
  }
}

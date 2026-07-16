# Dog Run petition — signature database setup (5 minutes)

The petition form on `dog-run.html` saves signatures to **Supabase**. Until you finish the two steps
below, the form automatically falls back to Formspree so no signature is ever lost.

## Step 1 — Create the table
1. Go to https://supabase.com/dashboard and open (or create) a project.
2. Left sidebar -> **SQL Editor** -> **New query**.
3. Paste the contents of `_setup/signatures.sql` and click **Run**.

## Step 2 — Paste your two public keys into the page
1. In Supabase: **Project Settings -> API**. Copy the **Project URL** and the **anon public** key.
   (The anon key is safe to put in a public web page — that's what it's for. Never paste the `service_role` key here.)
2. Open `dog-run.html`, find the `PETITION CONFIG` block near the bottom, and set:
   ```js
   const SUPABASE_URL = 'https://YOURPROJECT.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';   // the anon public key
   ```
3. Save, commit, push. Done — signatures now land in Supabase (Table editor -> `signatures`).

## How to read / export signatures
- Supabase Dashboard -> **Table editor -> signatures** (view, sort, export CSV).

## Fallback (before Step 2 is done)
- If `SUPABASE_URL` is left blank, the form posts to Formspree (`formspree.io/f/xwkgvpbz`) instead,
  so signatures are captured by email until Supabase is connected. Swap in a dedicated Formspree
  form id if you don't want petition signatures mixed with contact-form messages.

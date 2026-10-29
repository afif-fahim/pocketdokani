# Deploying the first slice

Deployment is prepared for FastAPI on Render, the Next.js web app on Vercel,
and PostgreSQL/private object storage on Supabase. Hosting was deferred while
implementing issue #1; no public phone URL is claimed by this branch.

1. Create a Supabase project and a **private** `pocketdokani-evidence` storage
   bucket. Keep the service role key on the API host only. Do not enable public
   reads or anonymous/client writes on the bucket or the import tables. The app
   proxies authorised reads instead of exposing public or signed original URLs.
2. Obtain a direct PostgreSQL or **session-pooler** connection string. Set the
   SQLAlchemy scheme to `postgresql+psycopg://`, URL-encode password characters,
   and require SSL. Transaction-pooler mode is not the supported configuration.
   Use the same server-only database role for migrations and API connections;
   it owns the tables. The initial migration enables row-level security with
   no client policies and revokes PUBLIC, `anon` and `authenticated` table
   grants, including Supabase's inherited default grants. Keep this protection
   on future tables as well; API access must never use a browser client role.
3. Create the API from `render.yaml` or build the root `Dockerfile`. Set
   `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SHOP_PASSCODE`
   and `WEB_ORIGIN` as secret environment variables. Use a strong random shop
   passcode of at least 12 characters. `WEB_ORIGIN` must be the exact HTTPS web
   origin without a trailing slash. The container migrates the schema before
   starting the API; start a single API instance for this first slice.
4. Import the repository into Vercel with **Root Directory `web`**, install
   command `npm ci`, build command `npm run build`, and the Next.js preset.
   Set server-side `API_ORIGIN` to the API's HTTPS origin **before building**.
   Rebuild if the API origin changes. No `NEXT_PUBLIC_` credential is needed.
5. Set the final web HTTPS origin on Render and redeploy. Confirm `/api/health`
   through the web URL returns `{"status":"ok"}`. Preview domains need their
   own matching API configuration; do not allow arbitrary origins.
6. Open `/` on a phone and `/judge` in a separate/incognito session. Perform
   [the acceptance steps](development.md#manual-acceptance), including reload,
   originals, cross-context refusal and reset isolation. Exercise both a file
   over 8 MiB and a valid batch over 10 MiB through the actual host/proxy: the
   ingress must allow the advertised 32 MiB batch plus multipart overhead and
   return the API's useful 413 on oversized input. If the selected host imposes
   a lower limit, adjust **both** UI and API limits and reverify before launch.
   A successful build does not prove host upload limits or camera behaviour.

The API health check verifies database connectivity. It does not validate
bucket privacy, credentials or phone upload behaviour; exercise an actual
constructed import before calling the deployment ready. Keep Uvicorn access
logs disabled, avoid verbose HTTP client/provider logs, and restrict platform
log access. Exceptions crossing the API boundary are returned without provider
URLs, customer filenames, credential values or raw validation inputs.

Back up seller PostgreSQL records and original objects together. Use a
maintenance window for migrations; production runs with SQLAlchemy parameter
redaction and PostgreSQL transaction locks for shared request budgets and
judge resets. Storage cleanup/retention is described in the development guide.

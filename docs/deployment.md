# Deployment runbook

PocketDokani uses Next.js on Vercel, a Dockerised FastAPI service on Render, and PostgreSQL/private object storage on Supabase. Deployment configuration is in [`render.yaml`](../render.yaml), [`Dockerfile`](../Dockerfile) and [`web/next.config.ts`](../web/next.config.ts). The [development guide](development.md) owns local setup and workflow instructions; the [verification record](verification.md) records which behavior has actually been checked.

## Deployment addresses

These stable addresses were recorded on October 30, 2026. Recheck them unauthenticated for a release; historical health checks do not prove the latest workflow is deployed.

| Component | Address / setting |
| --- | --- |
| Seller app | [pocketdokani.vercel.app](https://pocketdokani.vercel.app/) · passcode required |
| Isolated sample shop | [pocketdokani.vercel.app/judge](https://pocketdokani.vercel.app/judge) |
| Web-to-API health | [pocketdokani.vercel.app/api/health](https://pocketdokani.vercel.app/api/health) |
| API health | [pocketdokani-api.onrender.com/api/health](https://pocketdokani-api.onrender.com/api/health) |
| Web server `API_ORIGIN` | `https://pocketdokani-api.onrender.com` |
| API `WEB_ORIGIN` | `https://pocketdokani.vercel.app` |
| Supabase bucket | `pocketdokani-evidence`, private |

Use the stable web domain for sign-in and shared links. A deployment-specific Vercel URL previously required Vercel login. Both origins have no trailing slash. Set the intended release revision on both hosts; no feature branch is required by the app.

## Provision and configure

1. Create a Supabase project and a **private** `pocketdokani-evidence` bucket. Disable the Data API and automatic exposure of new tables. Keep public reads and anonymous/client writes disabled. Original reads are authorised by the API, without public or signed object URLs.
2. Obtain a direct or **session-pooler** PostgreSQL connection; transaction-pooler mode is unsupported. Use `postgresql+psycopg://`, URL-encode password characters and require SSL. Use the same server-only role for migrations and API connections; it owns application tables. Migrations enable RLS without client policies and revoke PUBLIC, `anon` and `authenticated` grants. Preserve these protections for new tables.
3. Create the Render service from `render.yaml`, or select Docker manually with root `Dockerfile`, empty Root Directory/Docker Command and health path `/api/health`. Configure the API environment below. The container includes `ffmpeg` and runs `alembic upgrade head` before Uvicorn, with access logs disabled. Use one API instance while migrations run at startup.
4. Import the repository into Vercel using the Next.js preset, **Root Directory `web`**, install `npm ci` and build `npm run build`. Configure server-side `API_ORIGIN` before building; changing it requires a rebuild. Set it separately for Production/Preview when both are used. No `NEXT_PUBLIC_` credentials are needed.
5. Set the final exact HTTPS `WEB_ORIGIN` on the API and redeploy before sign-in/uploads. Preview domains require their own matching API configuration; do not allow arbitrary origins. Run the hosted smoke checks below against the stable release domain.

| API setting | Required value / behavior |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | Server-only PostgreSQL/psycopg URL with SSL |
| `STORAGE_BACKEND` | `supabase`; production refuses local storage |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | HTTPS project URL and server-only legacy service-role key |
| `SUPABASE_BUCKET` | Private `pocketdokani-evidence` |
| `SHOP_PASSCODE` | Random secret of at least 12 characters |
| `WEB_ORIGIN` | Exact web HTTPS origin, no trailing slash |
| `MODEL_CALLS_ENABLED`, `MODEL_API_KEY` | Both true flag and nonempty server key required; Render blueprint defaults to disabled |
| `JUDGE_MODEL_CALLS_PER_HOUR`, `SELLER_MODEL_CALLS_PER_HOUR` | Optional; defaults 12 / 60 provider attempts, including retries |
| `STEADFAST_LIVE_ENABLED` | Defaults false; production seller booking stays disabled, judges always use fake |
| `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY` | Server secrets, both required when live seller booking is enabled |

Disabled models leave manual drafts and labeled sample/fake workflows available; they do not provide extraction, transcription, assistant answers or live parcel analysis. Judge reset preserves model budgets. Never copy server credentials into browser configuration, documentation, logs or public fixtures.

## Release and migrations

Back up seller PostgreSQL records and original objects together. Verify migrations against a non-production database, then use a maintenance window for the intended production database. The current migration head is `0005` (courier bookings); it also includes business records, order drafts/model audits and pack checks. The container runs all pending migrations automatically before serving; do not skip them when updating the API.

Deploy API and web from the same intended release revision. Check that the API starts cleanly, then rebuild/deploy the web app. `/api/health` returns `{"status":"ok"}` after a database query; it does not validate object access, model credentials, upload limits or courier readiness. Do not downgrade schema automatically after a failed release: preserve records and restore a compatible application revision or investigate with the backup available.

## Hosted smoke checks

Record date, revision, environment, result and limitations in [verification.md](verification.md). Keep real customer evidence and detailed model outputs private.

1. Open the web app and `/api/health` unauthenticated. Start `/judge` in a fresh session, then sign in to the seller app separately. Confirm visible API errors when unavailable and recovery once restored.
2. Follow the [workflow checks](development.md#short-workflow-checks): sample screenshots → reviewed/confirmed draft → fail/unsure/pass parcel result → fake booking of that same order. Verify all sample/no-AI/fake labels, source originals, reload persistence and booking recovery.
3. Use a second independent judge session to confirm record/photo isolation and reset isolation. Check sign-out revocation, missing mutation-header/wrong-Origin refusals and no-store record/original responses. Inspect built browser assets/logs for credentials without printing values.
4. Upload constructed images through the real host/proxy, including one file over 8 MiB and a valid batch over 10 MiB. The ingress must support the advertised 32 MiB batch plus multipart overhead and return useful errors for oversized input. Next's configured 34 MB proxy buffer alone does not establish platform limits; if a host limit is lower, adjust UI and API together and reverify.
5. On a physical phone over HTTPS, test file/camera input, microphone permission/recording, transcript review and navigation during unsaved work. Browser emulation and a successful build do not prove camera/microphone behavior.
6. When models are intentionally enabled, repeat live extraction, assistant and parcel checks with registered sources. Record live output quality, retries/budgets, source chips and confirm-gated writes separately from constructed results. Compare SAM/full-photo checks using the same original hash; do not claim accuracy or a physical-phone timing target from a synthetic smoke run.

The older hosted import checks and owner-reported phone checks do not establish hosted acceptance for all current features. Treat current unresolved gates in the verification record as release work, even when local checks pass.

## Genuine courier booking and recovery

Judge sessions always use the fake, even when the host has live keys. With `STEADFAST_LIVE_ENABLED=false`, production seller booking is disabled. A read-only credential probe is separate from booking and does not establish genuine-shipment acceptance.

When a genuine unbooked order is ready, configure both server keys, deliberately set `STEADFAST_LIVE_ENABLED=true`, redeploy, finish the order's packing approval and book once. Verify the consignment in the merchant panel with the PocketDokani reference as invoice. Record genuine-order and physical-phone evidence separately; disable the flag when live booking is no longer intended. Return/cancel in PocketDokani records the seller's status and does not cancel a Steadfast parcel.

For timeout, duplicate-invoice or interrupted requests, use **Check courier booking** before any retry. In-progress requests have a three-minute grace period. Reconciliation is read-only and does not create a parcel. Do not delete the durable attempt, change the invoice or switch to the fake to bypass an unresolved live booking. Pending attempts hold stock and block order edits/pack/status writes.

`status_by_invoice` alone does not recover identifiers; `trackings_by_invoice` may recover an unambiguous consignment ID without a tracking code. The UI keeps unknown identifiers unavailable. If absence or identity cannot be established reliably, inspect the merchant panel instead of creating another parcel. Webhook status sync and courier pickup requests are separate scope.

## Operations and release ownership

Keep platform log access restricted and avoid verbose provider/client logs. SQLAlchemy redacts parameters; PostgreSQL uses transaction locks for shared budgets and judge resets. Follow [storage maintenance](development.md#privacy-and-storage-maintenance) for retention and orphan cleanup; retain every referenced original/product/crop and never sweep seller storage as a judge reset.

[Issue #7](https://github.com/afif-fahim/pocketdokani/issues/7) owns the final release checklist: the owner's license choice, repository visibility change, unauthenticated repository/demo/video verification, published video/results and submission. Review tracked files and relevant history for private content before making the repository public; report paths/commits without sensitive values and do not rewrite history automatically.

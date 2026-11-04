# Setup

## Local development

Install Python 3.12+, uv, Git, npm and Node 20.x from 20.19, 22.x from 22.13, or 24+. Install ffmpeg on the API host for voice; the Docker image includes it. Run commands from the repository root.

```sh
uv sync --frozen
npm ci
npm --prefix apps/web ci
npm run hooks:install
```

Copy `.env.example` to `.env` only if the destination does not exist; otherwise merge missing settings without replacing secrets. Set `SHOP_PASSCODE` to a random value of at least 12 characters. Set `MODEL_API_KEY` and `MODEL_CALLS_ENABLED=true` to use extraction, transcription, assistant answers and parcel analysis. These requirements apply to sellers and judges alike. Without configured models, record browsing and manual drafts still work; analysis returns an explicit unavailable error.

Create `data/private/`, then:

```sh
uv run --frozen alembic upgrade head
npm run dev:api
```

In a second terminal, run `npm run dev:web`. Open [the seller app](http://localhost:3000/) or [the judge shop](http://localhost:3000/judge). The seller shop starts empty; each judge has isolated synthetic products, stock, orders and payouts. Sample images are inputs to real analysis. Reset restores only that judge's records and preserves the model-call budget.

## Configuration

The API reads the root `.env`. Next.js uses `apps/web/.env.local`; copy its `.env.example` only when overriding the default API target. Credentials belong on the API server, never in `NEXT_PUBLIC_` variables.

| Setting | Purpose |
| --- | --- |
| `ENVIRONMENT` | `development` locally; production requires PostgreSQL, private Supabase storage and HTTPS |
| `DATABASE_URL` | Local default: `sqlite:///./data/private/pocketdokani.db` |
| `SHOP_PASSCODE` | Server-only seller sign-in secret, at least 12 characters |
| `WEB_ORIGIN` | Exact browser origin, default `http://localhost:3000`, no trailing slash |
| `STORAGE_BACKEND`, `LOCAL_STORAGE_PATH` | Local defaults: `local`, `data/private/objects` |
| `MODEL_CALLS_ENABLED`, `MODEL_API_KEY` | True flag plus a server key; all analysis uses the real providers |
| `JUDGE_MODEL_CALLS_PER_HOUR`, `SELLER_MODEL_CALLS_PER_HOUR` | Code defaults: 12 / 60 provider attempts, including retries. Root `.env.example`: 60 / 100; Render blueprint sets judge allowance to 60. Existing hosted overrides require verification. |
| `STEADFAST_LIVE_ENABLED` | False by default: development sellers and all judges use the fake courier; production seller booking is disabled |
| `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY` | Both required before enabling live seller booking |
| `API_ORIGIN` (web server) | Default `http://127.0.0.1:8000`; same-origin API proxy target, set before production builds |

For PostgreSQL locally, set `LOCAL_DB_PASSWORD`, run `docker compose up -d`, and use `postgresql+psycopg://pocketdokani:YOUR_URL_ENCODED_PASSWORD@localhost:5432/pocketdokani`. Set `LOCAL_DB_PORT` and update the URL if another host port is needed. Run migrations against the chosen database.

For a phone on the LAN, keep the API on localhost and set `WEB_ORIGIN` to the exact Next.js LAN origin. Use synthetic data over local HTTP. Microphone recording requires HTTPS or localhost and browser permission.

## Contributor commands

```sh
npm run format
npm run check
npm run test
npm run build
```

`check` runs formatting, lint, strict Python/TypeScript checks and source-partition validation. `test` exercises COD and courier/order workflows using isolated data and mocked providers. Provider substitutes exist only in tests, never as an app analysis mode. The installed pre-commit hook checks staged content for private paths and likely Bangladesh phone numbers before running `check`.

Before model experiments, register sources and all related variants in [the evaluation manifest](../evals/split_manifest.json), following [source grouping rules](../evals/README.md). Keep raw inputs, ground truth, mappings and detailed logs ignored. Public evaluation evidence may contain reviewed synthetic captures/outputs or redacted aggregates, clearly labeled with provenance and limitations; never publish private source mappings or real customer data. Product vocabulary and money/reference invariants live in [GLOSSARY.md](../GLOSSARY.md) and [the ADRs](adr/).

For reviewed historical business data, keep the recalculated workbook under ignored `data/private/`. Inspect the dry-run before intentionally importing:

```sh
uv run --frozen python -m pocketdokani.commands.seed_business data/private/business.xlsx --reviewed-by seller --dry-run
```

Run without `--dry-run` only against the intended database. Cached formula results are required. Repeated identical inputs do not write; changed imports can overwrite matching historical snapshots and are not operational synchronisation. Use `uv run --frozen python -m pocketdokani.commands.seed_catalogue --help` for the catalogue-only input contract.

## Deployment

The API uses the root [Dockerfile](../Dockerfile) and [Render blueprint](../render.yaml); the web app uses Vercel. Supabase supplies PostgreSQL and a **private** `pocketdokani-evidence` bucket.

1. Create a private Supabase bucket, disable client Data API access and automatic table exposure, and use a server-only database role. Migrations retain RLS and revoke client/public grants. Use a direct or session-pooler connection, not the transaction pooler.
2. Configure the API: `ENVIRONMENT=production`, a `postgresql+psycopg://` database URL with SSL, `STORAGE_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`, `SHOP_PASSCODE`, `WEB_ORIGIN`, `MODEL_CALLS_ENABLED=true` and `MODEL_API_KEY`. URL-encode database passwords. Keep courier booking disabled until a genuine order is ready and both keys exist.
3. Deploy the root Dockerfile. It installs ffmpeg and runs `alembic upgrade head` before starting the API with access logs disabled. Use one API instance while startup migrations run. Back up database records and original objects together before migrations. Migration `0006` expires existing judge sessions to retire preloaded results; visitors start fresh synthetic shops afterward.
4. On Vercel set **Root Directory `apps/web`**, Next.js preset, install `npm ci` and build `npm run build`. Existing projects previously rooted at `web` must update that setting. Set server-side `API_ORIGIN=https://pocketdokani-api.onrender.com` before building; rebuild when it changes.
5. Set API `WEB_ORIGIN=https://pocketdokani.vercel.app` with no trailing slash and redeploy. Preview domains need a matching API origin policy; do not allow arbitrary origins.

Use the stable web domain. Health URLs are [the web proxy](https://pocketdokani.vercel.app/api/health) and [the API](https://pocketdokani-api.onrender.com/api/health). Health checks query the database; they do not prove storage/model/courier readiness.

## Smoke checks and operations

- In a fresh `/judge` session, open the sample screenshots and extract with the real model. Check source quotes, correct the draft and confirm it. Upload a parcel photo and inspect actual label/bag reasons. Fail blocks booking; unsure permits a separately recorded seller override. Fake-book the same order and check the order reference, COD and identifiers after reload.
- Ask an English/Bangla business question, inspect supporting record chips, and verify a proposed change does nothing until confirmed. On a physical phone over HTTPS, exercise microphone permission denial, recording/transcript review and camera upload.
- Check two independent judge sessions, seller/judge isolation, session-only reset and sign-out revocation. Confirm unsaved-edit warnings and recovery after interrupted writes. A missing key/provider failure must show an error and never return a preloaded draft or parcel result.
- Exercise actual host upload limits: 1–12 PNG/JPEG/WebP still screenshots, at most 8 MiB/20 megapixels each and 32 MiB per batch. The proxy's 34 MB buffer is not proof of platform ingress capacity. Unsupported/group/composite layouts are not accepted.

For uncertain courier responses, use **Check courier booking** before retrying creation; preserve the invoice and durable attempt. Unresolved attempts reserve stock. A PocketDokani return/cancel does not cancel a parcel with Steadfast. Live bookings require a genuine order; judges always use the fake courier.

Keep provider/access logs quiet and platform log access restricted. Objects cannot commit atomically with database writes. Before removing orphan keys older than a day, confirm no upload is active and compare against `source_images.storage_key`, `products.photo_key`, `pack_checks.photo_key` and every non-null `pack_checks.crop_keys` value. Preserve referenced objects and seller evidence; judge cleanup must never sweep seller storage.

Do not commit credentials, workbooks, customer records/media or private business documents. Keep private material under the existing ignored paths. Review staged content and release history before public publication; the privacy hook is not a general secret or image scanner.

# Development

This is the canonical setup and contributor guide. Use the [deployment runbook](deployment.md) for the hosted stack and the [verification record](verification.md) for observed results and open acceptance gates.

## Prerequisites and setup

Install Python 3.12+, `uv`, Git, npm and a supported Node.js version: 20.x from 20.19, 22.x from 22.13, or 24+. Node 21/23 are unsupported. Voice input additionally needs `ffmpeg` on the API host; the Docker image includes it. Run commands from the repository root.

```sh
uv sync --frozen
npm ci
npm --prefix web ci
npm run hooks:install
```

Copy `.env.example` to `.env` only when `.env` does not already exist; otherwise merge missing settings without overwriting secrets. Set `SHOP_PASSCODE` to a random value of at least 12 characters and create `data/private/`. The example uses SQLite and private local files, so it needs no cloud credentials.

```sh
uv run --frozen alembic upgrade head
uv run --frozen uvicorn pocketdokani.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

In a second terminal:

```sh
npm --prefix web run dev
```

Open [the seller app](http://localhost:3000/) or [the isolated sample shop](http://localhost:3000/judge). The seller shop starts empty. The judge shop starts with five constructed products, ten SKUs, eight orders and two payouts; none are real customer records. Its dates are relative to seed/reset time.

### Configuration

The API reads the root `.env`; Next.js reads its own environment. Copy `web/.env.example` to `web/.env.local` if you need to override the default API target. No browser credentials or `NEXT_PUBLIC_` settings are needed.

| Setting | Local default / purpose |
| --- | --- |
| `ENVIRONMENT` | `development`; production rejects SQLite, local storage and an HTTP web origin |
| `DATABASE_URL` | `sqlite:///./data/private/pocketdokani.db` |
| `SHOP_PASSCODE` | Server-only seller sign-in secret, at least 12 characters |
| `WEB_ORIGIN` | `http://localhost:3000`; exact browser origin with no trailing slash |
| `STORAGE_BACKEND`, `LOCAL_STORAGE_PATH` | `local`, `data/private/objects` |
| `MODEL_CALLS_ENABLED`, `MODEL_API_KEY` | Both the true flag and a nonempty server key are required for live Meta calls |
| `JUDGE_MODEL_CALLS_PER_HOUR`, `SELLER_MODEL_CALLS_PER_HOUR` | 12 / 60 actual provider attempts; retries consume budget and judge reset preserves it |
| `STEADFAST_LIVE_ENABLED` | `false`: development sellers and all judges use the fake; production seller booking is disabled |
| `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY` | Both required when deliberately enabling live seller booking |
| `API_ORIGIN` (web server) | `http://127.0.0.1:8000`; same-origin `/api/` proxy target; rebuild production web when it changes |

With models disabled, manual draft editing, sample records, explicit **no AI analysis** sample drafts/parcel results and fake courier booking remain usable. Extraction, transcription, live photo analysis and assistant answers require models; typed assistant input still requires Spark. Disabled or exhausted model calls do not fabricate results or change business records.

For local PostgreSQL, set `LOCAL_DB_PASSWORD` in the ignored `.env`, run `docker compose up -d`, and set `DATABASE_URL` to `postgresql+psycopg://pocketdokani:YOUR_URL_ENCODED_PASSWORD@localhost:5432/pocketdokani`. If needed, set `LOCAL_DB_PORT=15435` and use that port in the URL. Run migrations against the selected database.

For a phone on your LAN, keep the API on localhost, use Next's default `0.0.0.0` binding and set `WEB_ORIGIN` to the exact `http://YOUR_LAN_HOST:3000` address used by the phone. Use constructed data over unencrypted local connections. Browser microphone recording requires HTTPS or localhost, permission and a supported browser; a LAN HTTP preview does not establish voice capture works.

## Contributor checks

```sh
npm run format
npm run check
npm run test
npm --prefix web run build
```

`format` applies Prettier and Ruff. `check` verifies formatting, Ruff/ESLint, strict Python/TypeScript types and source partitions. Web typechecking generates Next.js route types, so no prior build is needed. `test` runs the agreed COD and courier duplicate/timeout checks with constructed data and a fake courier; other acceptance checks remain manual. Use `npm run typecheck` during implementation, or run `uv run --frozen python scripts/check_cod.py` / `scripts/check_booking.py` for a focused check.

The installed pre-commit hook checks staged paths/text for private material, then runs `npm run check` without rewriting or staging files. Private inputs, lockfiles and generated Next.js files are excluded from formatting. Inspect staged changes yourself: the privacy guard blocks known private paths, environment files, workbooks and likely Bangladesh phone numbers, but cannot recognise every secret or personal detail.

Keep vocabulary and decisions in [GLOSSARY.md](../GLOSSARY.md) and [docs/adr](adr/). Before any model experiment, register source groups and related variants in [evals/split_manifest.json](../evals/split_manifest.json), following the [evaluation rules](../evals/README.md). Keep media, ground truth, private mappings and detailed model outputs ignored; development examples do not establish held-out accuracy.

## Short workflow checks

Use constructed records locally and repeat the relevant checks on the hosted stack after deploying. The [verification record](verification.md) distinguishes local checks, hosted observations and owner-reported phone checks.

1. **Import and sources.** In the seller app, select 1–12 still PNG/JPEG/WebP mobile Messenger screenshots, reorder them and confirm the seller's bubble side before saving. Reload, reopen originals and sign out/in; bytes, hashes, sequence, side confirmation and workspace reference must persist. Limits are 8 MiB and 20 megapixels per image, 32 MiB per batch. Unsupported/animated/corrupt files and partial storage failure must leave no partial workspace. Group/composite layouts and append/merge are unsupported; voice-note screenshots contain no audio.
2. **Draft and confirm.** In `/judge`, follow **Start sample order**, inspect sources and use the explicitly labeled sample draft when models are unavailable. Confirm a multi-item order after reviewing recipient, available SKU, quantities, negotiated prices, line discounts, delivery charge and verified prior payment. Unknown values stay blank; implicit zero amounts need review. Changing SKU/quantity clears prices. Repeat confirmation keeps one order/reference. Saving an edit returns a confirmed/packed order to draft and clears packing authorization; stale edits are refused. Drafts and confirmation do not deduct stock.
3. **Assistant.** With models enabled, keep **Answer language: English** for an English walkthrough, try an English/Bangla starter or record up to two minutes, review the transcript, then ask. Open cited record chips. Ask to mark a booked sample delivered; the proposal alone must change nothing. Confirming uses the normal status endpoint. Automatic language uses Bangla when the question contains Bangla script; explicit English/বাংলা overrides it. Missing records remain unknown. Sales exclude drafts, returns and cancellations; payout due and courier fees remain unknown. Live transcription, tool selection and answer quality need their own evaluation.
4. **Pack check.** On a confirmed order, try sample fail, unsure/override and pass. A fail cannot be overridden; unsure needs a separate seller confirmation. For live analysis, use one in-focus photo with the full label and each visible bag (8 MiB/20 megapixels maximum). Check label and bag reasons separately. Historical labels use their preserved label order number; new orders use their app reference. A photo establishes nothing about sealed contents. Saving an order edit clears active packing approval; old evidence remains readable.
5. **Courier and recovery.** Book the same packed sample order with the fake courier. Confirm fake labels, identifiers and one stock deduction. Reset between duplicate-invoice, timeout-without-booking and late-success scenarios. **Check courier booking** must reconcile before any retry; an in-progress request has a three-minute grace period. Unresolved attempts hold stock and block edits/pack/status writes. Returning/cancelling a booked order restores stock once, only after the seller confirms the parcel is back; this does not cancel it with Steadfast.
6. **Isolation and interruptions.** Open two independent judge sessions and a seller session. Judges cannot read seller records/photos or another judge's work. Reset affects only its judge shop, restores fixtures, removes old asset access and preserves its model budget. Check unsaved-change warnings, reload recovery after interrupted writes, sign-out revocation, wrong-Origin/missing-header refusal and no-store record/original responses.

For live draft audio, optionally upload up to two minutes/8 MiB in a saved conversation. `ffmpeg` converts to 16 kHz mono PCM WAV; raw audio is temporary. Source quotes, transcripts and model audits remain private. Screenshot quotes are model transcriptions, not independently verified OCR; list prices never replace negotiated prices or prove customer payments.

For a SAM/full-photo comparison, submit the same constructed parcel photo using each method and compare checks with the same original hash. SAM uses separate `shipping label` and `handbag` prompts; missing, unusable or safely unparseable regions fall back to the full photo with a recorded reason. Provider request failures stop the check. Register every related photo/crop/variant in the same source split before calling models.

## Reviewed business imports

Store the seller workbook in an ignored path such as `data/private/business.xlsx`. Recalculate and save it in Excel/LibreOffice first: the reader needs cached formula results and does not evaluate formulas. After migrations, validate without writes:

```sh
uv run --frozen python -m pocketdokani.seed_business data/private/business.xlsx --reviewed-by seller --dry-run
```

Inspect the validation, then intentionally run the same command without `--dry-run` against the intended local or hosted environment. `--reviewed-by` records the historical reviewer, including payments; it never verifies payments from customer text. The supported workbook uses row-4 headers on Products, Stock, Orders and Payouts, plus a column-oriented Lots sheet. Validation rejects missing/inconsistent cached names, costs, prices, stock, totals or COD before writes.

Rows sharing an Order ID become one multi-line order; order-level money is applied once. Historical IDs stay private, label numbers are preserved and `PD-` references remain independent of courier IDs. Pending maps to confirmed, Shipped to booked; missing recipient details stay missing. Received/Selling/Closed lots require arrival dates; in-transit stock stays visible with zero availability. Product photos become private WebP objects.

An identical workbook fingerprint makes no writes. A changed workbook upserts matching historical snapshots/lines and adds statements, preserving records absent from the new file. This is a historical seed and can overwrite later edits to matching orders; do not use it for operational synchronisation. Compare counts, a multi-item order, payments, stock and photo references with the source, then rerun unchanged and verify no new records/objects.

For catalogue names/lot eligibility only, save a reviewed JSON array to ignored `data/private/reviewed-skus.json`:

```json
[
  {
    "sku": "EXAMPLE-BLUE-LOT-A",
    "product_name": "Example product",
    "variant": "Blue",
    "lot": "EXAMPLE-LOT-A",
    "lot_received": true
  }
]
```

Run `uv run --frozen python -m pocketdokani.seed_catalogue data/private/reviewed-skus.json --reviewed-by seller`. Use distinct SKUs for each lot-specific variant. This leaves existing prices, quantities and photos unchanged and does not replace the workbook import.

## Privacy and storage maintenance

Seller sessions share one passcode-protected shop; each judge owns an isolated fixture. Opaque HttpOnly, SameSite=Strict cookies are Secure in production. Every record and original read checks session ownership; writes require the custom request header and matching `WEB_ORIGIN`. CORS is disabled. Database, Supabase, model and courier credentials stay on the API host; the web server proxies authorised same-origin requests.

Do not commit private documents, customer records/photos/audio, workbooks, environment files or detailed model outputs. Keep Uvicorn access logs disabled and provider/client logs quiet. Session expiry does not erase seller evidence.

Database and object storage cannot commit atomically. Failed uploads attempt cleanup; interruption or ambiguous commits may leave inaccessible orphan objects. Before removing keys older than a day, verify no upload is active and compare against `source_images.storage_key`, `products.photo_key`, `pack_checks.photo_key` and every non-null `pack_checks.crop_keys` value. Preserve all referenced objects. Apply retention to expired judge examples only; never sweep seller storage as a judge reset. Back up database records and original objects together.

# Running PocketDokani locally

Issue #1 implements one initial screenshot batch per conversation workspace. Issue #2 adds business records and isolated synthetic judge shops. Issue #3 adds evidence-linked order extraction, optional voice notes, editable drafts and seller confirmation. Courier booking and the conversational voice assistant remain separate slices.

## Local setup

Requirements: Python 3.12+, `uv`, npm and Node 24+ (or 20.19+/22.13+). Run commands from the repository root unless a different directory is shown.

1. Run `uv sync --frozen`, `npm ci`, `npm --prefix web ci` and `npm run hooks:install`.
2. Copy `.env.example` to `.env` **only if `.env` does not already exist**. Otherwise merge the example's settings without overwriting existing keys. Replace `SHOP_PASSCODE` with a random value of at least 12 characters.
3. Create `data/private/`, then run `uv run alembic upgrade head`.
4. Run `uv run uvicorn pocketdokani.main:app --host 127.0.0.1 --port 8000 --no-access-log`.
5. In another terminal run `npm --prefix web run dev` and open [the seller workspace](http://localhost:3000) or [the constructed judge example](http://localhost:3000/judge).

The example configuration uses SQLite and private local files for offline development. Production settings refuse these backends. For local PostgreSQL, set `LOCAL_DB_PASSWORD`, run `docker compose up -d`, and set `DATABASE_URL` to `postgresql+psycopg://pocketdokani:YOUR_URL_ENCODED_PASSWORD@localhost:5432/pocketdokani`. Run the same migration. Database URLs, passcodes and storage credentials belong only in ignored environment files or the host's secret settings.

Use `npm run check` for formatting, lint, Python/TypeScript typechecks and the source-partition validator. The web typecheck generates Next.js route types before running TypeScript, so it works on a clean checkout without a build. Run `npm --prefix web run build` separately for a production build. Run `npm run test` for the small COD calculation check; it uses Python's standard library and is the issue's sole automated test exception. Other acceptance checks remain manual.

To preview on a physical phone on your LAN, bind the API only to localhost, keep Next's default `0.0.0.0` binding, and set `WEB_ORIGIN` to the exact `http://YOUR_LAN_HOST:3000` address used by the phone. Use constructed data on unencrypted local connections. Production requires HTTPS.

## Formatting

Run these commands from the repository root:

```sh
npm run format
npm run format:check
```

[Prettier](https://prettier.io/docs/install) formats TypeScript/TSX, CSS, JSON, YAML and Markdown. [Ruff](https://docs.astral.sh/ruff/formatter/) formats Python under `api/` and `scripts/`. `npm run format` runs both; `format:check` verifies formatting without changing files. Private inputs, lockfiles and generated Next.js files are excluded.

For Python alone, use `uv run --frozen ruff format api scripts`, or add `--check` to verify without writing. Run `uv run --frozen ruff check --fix api scripts` on one line to apply safe lint fixes, including import sorting.

## Checks before committing

Run `npm run hooks:install` once per clone to enable `.githooks/pre-commit`. The hook checks staged content for private data, then runs `npm run check`:

- Prettier and Ruff formatting checks.
- Ruff Python linting and ESLint Next.js/TypeScript linting.
- Strict Python and TypeScript typechecks.
- Source-partition validation.

The hook checks the working tree without rewriting or staging files. Run `npm run format` and stage the resulting changes before committing. For this small repository, typechecks are fast enough to include in pre-commit; the full production build remains a separate check.

## Supported import

Use a one-to-one Messenger **mobile** conversation with message bubbles on the left and right, read from top to bottom. Group chats, mirrored/composite images and other layouts are unsupported. The seller inspects the original previews and explicitly confirms which side belongs to the seller; the other side is the customer. This is seller confirmation, not transport provenance.

Choose 1–12 still PNG/JPEG/WebP files, at most 8 MiB and 20 megapixels each, and at most 32 MiB total. HEIC, SVG, animated images, corrupt files and MIME mismatches are refused. Selection order is shown explicitly and can be changed before saving. Exact original bytes, SHA-256, dimensions, sequence and an independent PocketDokani reference survive reload. The batch never claims to cover the whole conversation. Voice-note screenshots contain no playable audio.

There is no append/merge endpoint. Later imports belong to future attributed seller edits, with supporting screenshots, rather than incremental merging.

## Catalogue

Each judge session starts with five constructed products, ten SKUs across received and in-transit lots, eight orders across lifecycle states (including a multi-item order), and two payouts. Product illustrations and recipients are hand-authored; phones are absent. Reset judge shop restores these records and screenshots only for that session. The seller shop starts empty until reviewed records are imported.

### Private business workbook

Keep the seller's workbook in an ignored path, for example `data/private/business.xlsx`. After configuring the server environment and running `uv run alembic upgrade head`, validate it without writes:

```sh
uv run --frozen python -m pocketdokani.seed_business data/private/business.xlsx --reviewed-by seller --dry-run
```

Then import using the same command without `--dry-run`. This targets the database and private storage configured in the server environment; use local settings for a local copy, and the production settings only when intentionally loading the hosted shop. `--reviewed-by` records who reviewed the historical records, including advances and other direct payments. It does not mark payments verified based on customer text.

The reader supports the existing workbook layout with headers on row 4: Products, Stock, Orders, Payouts, and the column-oriented Lots sheet. Recalculate and save the workbook in Excel or LibreOffice before importing. Cached product names, landed costs, retail list prices, remaining stock, line totals and COD amounts must be available. The command reconciles stock and money against source inputs; missing or inconsistent results stop the import before any writes. It never evaluates formulas or replaces missing agreed prices with current catalogue prices.

Rows sharing an Order ID become one order with separate lines. Order-level money is read once from the first line. Historical IDs are preserved in private notes; stable `PD-` references are generated independently of consignment IDs. Historical Pending maps to confirmed, Shipped to booked, and Delivered/Returned/Cancelled retain their meanings. Missing recipient details remain missing. Embedded product photos are normalised into private WebP objects and shared by that product's variants.

Stock quantity is the workbook's remaining quantity after reserved, delivered, unreturned and written-off units. Received/Selling/Closed lots require an arrival date. In-transit units remain visible, but their available quantity is zero. An empty received SKU is also unavailable. Unit costs are stored to two decimal places in BDT.

An identical workbook fingerprint causes no writes. A changed workbook upserts by stable product, SKU, historical order and statement IDs; matching orders' lines are replaced, and new statements are added. Records absent from the changed workbook are preserved. This is a one-time historical seed: a later import intentionally overwrites matching historical snapshots, so do not use it to synchronise operational edits. Validation completes before photos are uploaded; database writes commit together. Interrupted uploads or an ambiguous commit may leave unreferenced objects; the orphan sweep must compare against both `source_images.storage_key` and `products.photo_key` and preserve every referenced photo.

### Catalogue-only input

The earlier catalogue-only command remains available for reviewed SKU names and lot eligibility. It leaves existing business quantities, prices and photos unchanged and is not a replacement for the workbook import.

Save reviewed data to ignored `data/private/reviewed-skus.json`:

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

Run `uv run python -m pocketdokani.seed_catalogue data/private/reviewed-skus.json --reviewed-by seller` on one line. Received-lot eligibility is explicit; a repeated product/colour in another lot requires a distinct SKU. This command updates only the shop catalogue and does not import the historical workbook.

## Drafting and confirming an order

Run `uv run alembic upgrade head` before starting the updated API. To enable live extraction, set `MODEL_CALLS_ENABLED=true` and `MODEL_API_KEY` on the API server only. Install `ffmpeg` on the local API host for voice notes; the Docker image includes it. Keep these settings out of the browser environment. The API uses [Meta structured output](https://dev.meta.ai/docs/structured-output) and the [Voice Transcribe multipart interface](https://dev.meta.ai/docs/api-reference/voice/transcribe), with the documented [voice settings](https://dev.meta.ai/docs/api-reference/voice/schemas).

Open a saved conversation. Optionally attach audio (up to two minutes and 8 MiB), inspect its transcript, then tap **Extract order draft**. Audio is converted to 16 kHz mono PCM WAV with a bounded conversion time; the temporary audio is deleted after transcription. Its hash, transcript and model output remain private records. Each screenshot is sent in sequence alongside received, available SKUs and their photos; unavailable and in-transit SKUs are excluded. The judge uses its own constructed catalogue. Extraction uses low reasoning, a JSON schema and at most one retry on transient errors, with connection/read timeouts. Every attempt has a private `model_runs` record with input references, output, token usage when supplied and latency. Failed provider bodies are withheld from logs and responses.

Tap a source chip to open its original screenshot or voice transcript. Missing or invalid extracted fields stay empty for seller review. The code checks Bangladesh mobile numbers after Bangla-digit conversion, checks numeric values against their quoted numbers and checks SKU availability again at confirmation. Quotes from screenshots are model transcriptions, not independently verified OCR. Unknown values, implicit zero discounts and bundle allocations require seller entry; list prices never supply negotiated prices. The constructed judge example deliberately withholds its phone; it must be filled before confirmation.

Edit the recipient, available SKU, quantity, final unit price, total line discount and customer delivery charge. The photo browser helps select a variant. Changing SKU or quantity clears the line's prices and discount for review. Enter explicit zero amounts where appropriate. COD updates from those amounts; only the seller's checked **I verified an advance or direct payment** control can enable prior payment. Customer claims do not populate it.

**Save draft** permits incomplete work. **Confirm order** saves the current values, validates required fields and stock, calculates COD using the shared calculator and creates a confirmed order with a `PD-` reference. Repeat confirmations never create a second order for the workspace. Editing and saving a confirmed or packed order returns it to draft; the next confirmation keeps the reference. A packed order loses its packing authorization. Booked orders cannot be edited here. Stale revisions return 409 rather than replacing another edit. Orders links back to their draft and sources; changed drafts label the old confirmed snapshot explicitly. No stock is decremented during drafting or confirmation.

Before hosted acceptance, enable the models on the API host and repeat issue #3's five acceptance checks with a real-sized screenshot batch on a physical phone. Measure extraction quality, final-price selection and the under-two-minute target. Local synthetic responses do not establish these results.

## Privacy and isolation

Seller and judge contexts use separate opaque, HttpOnly, SameSite=Strict cookies. Production adds Secure. Session token hashes, expiry and ownership are checked server-side for every workspace, catalogue and original-image request. All seller sessions belong to the single passcode-protected shop; each judge session owns a separate constructed example. Signing out revokes the corresponding token and clears visible records. Session expiry requires signing in again; it does not delete saved seller evidence.

Changing requests require a custom request header and validate the browser Origin against `WEB_ORIGIN`. CORS is not enabled. The web server proxies same-origin `/api/` requests; the browser receives no Supabase credentials, database URL, shop passcode configuration or model API key. Login attempts, imports, judge session creation and resets have database-backed request budgets. Live model calls require both `MODEL_CALLS_ENABLED=true` and a server-only `MODEL_API_KEY`. Each actual attempt, including a retry, consumes the shop's hourly budget (12 for each judge session, 60 for the seller shop by default). Resetting a judge shop does not reset that budget.

Every file is validated before object creation. Failed uploads roll back the workspace and attempt to remove any staged objects. An interrupted process or failed cleanup can leave **inaccessible orphan objects**, never a partially published workspace. When operating hosted storage, compare object keys with both `source_images.storage_key` and `products.photo_key` and remove only unreferenced keys older than a day after verifying no upload is active. Apply a retention policy to expired judge sessions/examples; never sweep the seller prefix as a judge reset. Object storage and PostgreSQL cannot share a transaction.

The pre-commit privacy guard blocks ignored private paths, environment files and likely Bangladesh phone numbers in staged text (values are withheld from output). It is a backstop; anonymise public fixtures and inspect staged changes.

### Business-record acceptance

1. Validate the ignored workbook, import it, then compare product, SKU, order-line and payout counts with its source sheets. Open the multi-item order and check both lines, its single delivery charge, verified prior payment and COD. Missing historical details must stay empty.
2. Import the identical workbook again. References, lines, timestamps, photo object counts and all records must remain unchanged.
3. Open Orders and Stock at phone width in seller and judge sessions. Check product photos, list prices, costs, out-of-stock records, and visible in-transit units with zero available quantity.
4. Start two independent judge sessions. Each has ten SKUs, eight orders and two payouts. A judge cannot list seller records or open a seller photo. Reset one judge shop; its fixture is restored, old screenshot URLs stop working, and seller records and the other judge's records remain unchanged.
5. Run `npm run test`, `npm run check`, the production build and the staged privacy check before committing. Do not commit the workbook, imported records, product photos or server credentials.

## Manual acceptance

1. In a seller session, select two constructed screenshots in reverse order, preview them, reorder them, confirm both possible speaker-side mappings, then save. Reload the URL and reopen each original; reference, hash, order, side confirmation and bytes must be unchanged. Sign out and sign in again; the same shop conversation remains available.
2. In a separate browser session, start the judge example and reset it. Seller IDs and original-image URLs must remain inaccessible. A second judge session must not read or reset the first judge's example. Resetting a judge example must leave seller records and objects unchanged.
3. Try a corrupt file after a valid file in one batch, an unsupported format, more than 12 files, a file over 8 MiB and a batch over 32 MiB. Each must show a useful error and leave the workspace list unchanged. Simulate storage failure mid-upload and retry; no partial workspace should appear.
4. Confirm sign-out revocation, missing mutation-header refusal, wrong-Origin refusal, and no-store responses on records and originals. Check the built browser assets and logs for credential values without printing those values.

Physical-phone camera/upload behaviour, PostgreSQL and hosted object storage must also be checked on the deployed stack before closing the hosted-phone acceptance gate. A local smoke run does not establish that gate. The October 30 hosted browser checks and owner-reported phone/manual checks are recorded in [the verification record](verification.md#hosted-verification--october-30-2026); the [deployment guide](deployment.md) lists the live URLs and post-merge steps. Repeat the relevant checks when deployment or upload configuration changes.

# Running the import slice

Issue #1 implements one initial screenshot batch per conversation workspace.
It preserves originals and speaker-side confirmation. It does not extract
messages, approve orders, invoke models or book couriers.

## Local setup

Requirements: Python 3.12+, `uv`, Node 20.9+ and npm. Run commands from the
repository root unless a different directory is shown.

1. Run `uv sync --frozen` and `npm --prefix web ci`.
2. Copy `.env.example` to `.env` **only if `.env` does not already exist**.
   Otherwise merge the example's settings without overwriting existing keys.
   Replace `SHOP_PASSCODE` with a random value of at least 12 characters.
3. Create `data/private/`, then run `uv run alembic upgrade head`.
4. Run `uv run uvicorn pocketdokani.main:app --host 127.0.0.1 --port 8000 --no-access-log`.
5. In another terminal run `npm --prefix web run dev` and open
   [the seller workspace](http://localhost:3000) or
   [the constructed judge example](http://localhost:3000/judge).

The example configuration uses SQLite and private local files for offline
development. Production settings refuse these backends. For local PostgreSQL,
set `LOCAL_DB_PASSWORD`, run `docker compose up -d`, and set `DATABASE_URL` to
`postgresql+psycopg://pocketdokani:YOUR_URL_ENCODED_PASSWORD@localhost:5432/pocketdokani`.
Run the same migration. Database URLs, passcodes and storage credentials belong
only in ignored environment files or the host's secret settings.

Use `uv run mypy api/pocketdokani`, `npm --prefix web run typecheck`, and
`npm --prefix web run build` for checks. A clean checkout needs a Next.js build
or dev start before a standalone typecheck, since Next generates route types.
No test files or test framework are included, as requested by the issue.

To preview on a physical phone on your LAN, bind the API only to localhost,
keep Next's default `0.0.0.0` binding, and set `WEB_ORIGIN` to the exact
`http://YOUR_LAN_HOST:3000` address used by the phone. Use constructed data on
unencrypted local connections. Production requires HTTPS.

## Supported import

Use a one-to-one Messenger **mobile** conversation with message bubbles on
the left and right, read from top to bottom. Group chats, mirrored/composite
images and other layouts are unsupported. The seller inspects the original
previews and explicitly confirms which side belongs to the seller; the other
side is the customer. This is seller confirmation, not transport provenance.

Choose 1–12 still PNG/JPEG/WebP files, at most 8 MiB and 20 megapixels each,
and at most 32 MiB total. HEIC, SVG, animated images, corrupt files and MIME
mismatches are refused. Selection order is shown explicitly and can be changed
before saving. Exact original bytes, SHA-256, dimensions, sequence and an
independent PocketDokani reference survive reload. The batch never claims to
cover the whole conversation. Voice-note screenshots contain no playable audio.

There is no append/merge endpoint. Later imports belong to future attributed
seller edits, with supporting screenshots, rather than incremental merging.

## Catalogue

The judge catalogue is constructed and separate from the private shop. It has
two received lots and an in-transit example that is explicitly ineligible.
The shop catalogue starts empty until the seller reviews real SKU data.

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

Run `uv run python -m pocketdokani.seed_catalogue data/private/reviewed-skus.json
--reviewed-by seller` on one line. Received-lot eligibility is explicit; a
repeated product/colour in another lot requires a distinct SKU. This command
updates only the shop catalogue and does not import the historical workbook.

## Privacy and isolation

Seller and judge contexts use separate opaque, HttpOnly, SameSite=Strict
cookies. Production adds Secure. Session token hashes, expiry and ownership
are checked server-side for every workspace, catalogue and original-image
request. All seller sessions belong to the single passcode-protected shop;
each judge session owns a separate constructed example. Signing out revokes
the corresponding token and clears visible records. Session expiry requires
signing in again; it does not delete saved seller evidence.

Changing requests require a custom request header and validate the browser
Origin against `WEB_ORIGIN`. CORS is not enabled. The web server proxies
same-origin `/api/` requests; the browser receives no Supabase credentials,
database URL, shop passcode configuration or model API key. Login attempts,
imports, judge session creation and resets have database-backed request budgets.
No model endpoint is exposed: the model-call budget is zero in this slice.

Every file is validated before object creation. Failed uploads roll back the
workspace and attempt to remove any staged objects. An interrupted process or
failed cleanup can leave **inaccessible orphan objects**, never a partially
published workspace. When operating hosted storage, compare object keys with
`source_images.storage_key` and remove only unreferenced keys older than a day
after verifying no upload is active. Apply a retention policy to expired judge
sessions/examples; never sweep the seller prefix as a judge reset. Object
storage and PostgreSQL cannot share a transaction.

Enable the supplied staged privacy guard with `git config core.hooksPath
.githooks`. It blocks ignored private paths, environment files and likely
Bangladesh phone numbers in staged text (values are withheld from output).
It is a backstop; anonymise public fixtures and inspect staged changes.

## Manual acceptance

1. In a seller session, select two constructed screenshots in reverse order,
   preview them, reorder them, confirm both possible speaker-side mappings,
   then save. Reload the URL and reopen each original; reference, hash, order,
   side confirmation and bytes must be unchanged. Sign out and sign in again;
   the same shop conversation remains available.
2. In a separate browser session, start the judge example and reset it.
   Seller IDs and original-image URLs must remain inaccessible. A second judge
   session must not read or reset the first judge's example. Resetting a judge
   example must leave seller records and objects unchanged.
3. Try a corrupt file after a valid file in one batch, an unsupported format,
   more than 12 files, a file over 8 MiB and a batch over 32 MiB. Each must show
   a useful error and leave the workspace list unchanged. Simulate storage
   failure mid-upload and retry; no partial workspace should appear.
4. Confirm sign-out revocation, missing mutation-header refusal, wrong-Origin
   refusal, and no-store responses on records and originals. Check the built
   browser assets and logs for credential values without printing those values.

Physical-phone camera/upload behaviour, PostgreSQL and hosted object storage
must also be checked on the deployed stack before closing the hosted-phone
acceptance gate. A local smoke run does not establish that gate.

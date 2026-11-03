# PocketDokani

A Bangla AI copilot in the pocket of every Messenger seller.

PocketDokani helps small Facebook/Messenger sellers in Bangladesh run their shop from a phone. It turns sales-chat screenshots into order drafts, checks a packed parcel with the camera, books the courier and answers business questions by voice in Bangla. The AI drafts, checks and answers; the seller confirms every order, amount and change.

Built for the Meta Global AI Developer Hackathon with Muse Spark, Muse Voice Transcribe and SAM 3.1.

## Status

Implemented: a Next.js phone layout and FastAPI service that preserve ordered screenshot batches, original images, source hashes, speaker-side confirmation and stable references. Seller workspaces require the shop passcode; each judge session gets its own constructed example.

Issue #2 adds a private workbook import for products, SKU photos, stock, historical orders and payouts, plus phone Orders and Stock lists. Each judge session has a separate synthetic shop that resets with its screenshot example. COD uses the single calculation in ADR 0002. This business-data slice is verified locally; the hosted verification below covers the earlier screenshot slice.

Live: [seller workspace](https://pocketdokani.vercel.app/) (shop passcode required) and [constructed judge example](https://pocketdokani.vercel.app/judge). The first screenshot-import slice is deployed on Vercel and Render with PostgreSQL and private object storage on Supabase. Hosted checks were recorded on October 30, 2026; see the [verification record](docs/verification.md#hosted-verification--october-30-2026).

Issue #3 adds source-linked order drafts from ordered screenshots and optional voice notes, phone editing with SKU photos and live COD, seller-verified payments, and confirmation with stable order references. Model calls are disabled until the server is configured. This slice is verified locally with synthetic model responses; live extraction quality and physical-phone timing remain unverified.

Issue #4 adds a Bangla/Banglish voice and typed assistant with shop-scoped business tools, record chips and stored numeric results. Draft creation and order-status proposals require confirmation through the same endpoints as the normal UI. This slice is verified locally with synthetic model responses; live answer quality and physical-phone microphone behavior remain unverified.

Issue #5 adds guided parcel-photo capture, SAM label/bag crops with full-photo fallback, blind label reading, code comparisons against the confirmed order, separate visible-bag results and recorded seller overrides for unsure checks. Historical labels retain the seller's workbook order number. Originals, crops and field reasons remain private. Live Meta checks covered 14 generated examples in both modes, and PostgreSQL concurrency checks passed locally; these are development checks, with field-reading variability and no SAM label regions observed. Hosted pack checks, physical-phone capture and real-label accuracy remain unverified; see the [verification record](docs/verification.md#live-development-follow-up--november-1-2026).

Issue #6 adds Steadfast live and fake courier adapters, packed-order booking, assistant booking proposals and invoice reconciliation after an uncertain response. Judge sessions always use the fake; production seller booking stays disabled until the server flag and keys are configured. Pending bookings hold available stock, and a confirmed consignment deducts it once. The merchant guide and a read-only authenticated request were checked; no genuine order is available for the first live booking. Hosted courier acceptance remains unverified; see the [verification record](docs/verification.md#courier-booking-issue-6--november-2-2026).

Not yet implemented: evaluation and pilot results. Automatic courier status updates by webhook remain separate scope.

Issue #15 connects review, parcel check and fake booking on the same order, adds an isolated synthetic sample path and bounds loading/failure recovery. Existing endpoint regression checks cover the sample workflow and isolation; deployed live extraction, Bangla assistant and parcel analysis were attempted separately. Phone/desktop visual acceptance remains open because local browser automation was unavailable; see the [walkthrough and observed results](docs/verification-judge-workflow.md).

Local development also supports SQLite/private files. See [local setup and acceptance checks](docs/development.md), [deployment setup](docs/deployment.md), [evaluation partitions](evals/README.md) and the [verification record](docs/verification.md).

## Planned scope

- Draft single- and multi-item orders from chat screenshots and voice notes.
- Ask questions and propose changes by voice in Bangla; nothing changes until the seller confirms.
- Check a packed parcel's label and visible bag against the confirmed order.
- Book the courier from a packed order.

## Project workflow

Track work in [GitHub Issues](https://github.com/afif-fahim/pocketdokani/issues). Agent workflow conventions start in [AGENTS.md](AGENTS.md), with details in [docs/agents/](docs/agents/).

The working blueprint and source business materials are kept locally under `docs/private/`, which is excluded from Git. Use synthetic or anonymised examples in committed fixtures, issues and demonstrations.

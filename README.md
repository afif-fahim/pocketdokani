# PocketDokani

A Bangla AI copilot in the pocket of every Messenger seller.

PocketDokani helps small Facebook/Messenger sellers in Bangladesh run their shop from a phone. It turns sales-chat screenshots into order drafts, checks a packed parcel with the camera, books the courier and answers business questions by voice in Bangla. The AI drafts, checks and answers; the seller confirms every order, amount and change.

Built for the Meta Global AI Developer Hackathon with Muse Spark, Muse Voice Transcribe and SAM 3.1.

## Status

Implemented: a Next.js phone layout and FastAPI service that preserve ordered screenshot batches, original images, source hashes, speaker-side confirmation and stable references. Seller workspaces require the shop passcode; each judge session gets its own constructed example.

Not yet implemented: business data seed, order drafting, the voice assistant, pack check, courier booking, evaluation and pilot results.

Production configuration targets PostgreSQL and private Supabase storage. Local development also supports SQLite/private files. See [local setup and acceptance checks](docs/development.md), [deployment setup](docs/deployment.md), [evaluation partitions](evals/README.md) and the [verification record](docs/verification.md).

## Planned scope

- Seed products, stock, orders and payouts from the seller's existing records.
- Draft single- and multi-item orders from chat screenshots and voice notes.
- Ask questions and propose changes by voice in Bangla; nothing changes until the seller confirms.
- Check a packed parcel's label and visible bag against the confirmed order.
- Book the courier from a packed order.

## Project workflow

Track work in [GitHub Issues](https://github.com/afif-fahim/pocketdokani/issues). Agent workflow conventions start in [AGENTS.md](AGENTS.md), with details in [docs/agents/](docs/agents/).

The working blueprint and source business materials are kept locally under `docs/private/`, which is excluded from Git. Use synthetic or anonymised examples in committed fixtures, issues and demonstrations.

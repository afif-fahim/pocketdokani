# OrderTrail

Every order leaves a trail of evidence, from chat to parcel.

OrderTrail is a planned workflow for Messenger sellers handling Bangla and
Banglish sales conversations. It aims to turn an imported conversation into
a seller-approved order, then check a photographed parcel label against the
approved version before shipping.

## Status

The first import slice is implemented: a Next.js phone layout and FastAPI
service preserve ordered screenshot batches, original images, source hashes,
speaker-side confirmation and stable OrderTrail references. Seller workspaces
require the shop passcode; each judge session gets its own constructed example.

Production configuration targets PostgreSQL and private Supabase storage.
Local development also supports SQLite/private files. Hosting, physical-phone
acceptance, model integrations, order extraction/approval, label checking,
evaluation results and pilot outcomes remain unvalidated or unimplemented.

See [local setup and acceptance checks](docs/development.md),
[deployment setup](docs/deployment.md), and [evaluation partitions](evals/README.md).
The [verification record](docs/verification.md) lists the local checks and
the hosted/physical-phone gates that remain.

## Initial scope

- Import screenshots with links back to the original evidence.
- Review an order with one or more item lines and approve a specific version.
- Read a parcel label independently and compare it with the approved order.
- Block mismatches and request review when evidence cannot be verified.
- Show the order's evidence, corrections, approvals, and checks in a Trail.

## Project workflow

Track work in [GitHub Issues](https://github.com/afif-fahim/ordertrail/issues).
Agent workflow conventions start in [AGENTS.md](AGENTS.md), with details in
[docs/agents/](docs/agents/).

The full working blueprint and source business materials are kept locally
under `docs/private/`, which is excluded from Git. Use synthetic or anonymised
examples in committed fixtures, issues, and demonstrations.

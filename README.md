# OrderTrail

Every order leaves a trail of evidence, from chat to parcel.

OrderTrail is a planned workflow for Messenger sellers handling Bangla and
Banglish sales conversations. It aims to turn an imported conversation into
a seller-approved order, then check a photographed parcel label against the
approved version before shipping.

## Status

Planning and repository setup. The application, model integrations,
deployment, evaluation results, and pilot outcomes are not implemented or
validated yet.

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

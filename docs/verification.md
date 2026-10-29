# Issue #1 verification

## Local verification — October 29, 2026

These checks used constructed screenshots and temporary local sessions only. No customer media, live model calls or hosted deployment were involved.

- Python strict typechecking, TypeScript typechecking and the Next.js production build passed.
- Local HTTP acceptance checks passed for original byte/hash/order retention, stable references and speaker confirmation after reload, independent seller and judge sessions, cross-judge/cross-context record and image denial, isolated judge reset, and sign-out token revocation.
- Invalid images, mismatched MIME types, unsupported layouts, more than 12 files, files over 8 MiB and a streamed request over the batch limit were refused without adding a workspace. A simulated second-object write failure rolled back the batch and returned a sanitised error.
- PostgreSQL 17 migration upgrade/downgrade/upgrade and Alembic schema parity passed. Real PostgreSQL checks covered persistence, source reads and two competing resets: one succeeded and the stale reset received 409.
- PostgreSQL checks with simulated Supabase inherited client grants confirmed RLS on all application tables, removal of anonymous/authenticated table privileges, denied anonymous session-table access, and working owner-role API access. No hosted Supabase project was used.
- The built browser assets contained none of the configured credential values. The staged privacy guard and source-partition validator passed.
- Browser checks at a 390 × 844 viewport covered judge session loading, constructed catalogue eligibility, seller sign-in, file selection/reordering, side confirmation, saving, reload persistence and the full-original image dialog. These were browser viewport checks, not a physical-phone trial.

## Standards review

No documented-standard violations or actionable baseline code smells found. Two correctness findings were fixed: pending-file keys now work on HTTP LAN origins, and saved links resolve records outside the latest-100 list through the authenticated detail endpoint. Focused follow-up: no remaining findings.

## Spec review

Three findings were fixed: the two frontend issues above and inherited Supabase client-role grants. The migration now enables RLS without client policies and revokes those grants. Focused follow-up: no remaining findings.

Standards: 0 remaining findings. Spec: 0 remaining findings.

At the time of the local review, live hosting, real Supabase storage, host/proxy upload limits and a physical phone had not been verified. The hosted follow-up is recorded below. No persistent test files or test framework were added; there is no automated full test suite in this slice.

## Hosted verification — October 30, 2026

The first slice was deployed from `feat/1-phone-workspace` to [Vercel](https://pocketdokani.vercel.app/) and [Render](https://pocketdokani-api.onrender.com/api/health), with Supabase PostgreSQL and private object storage. Dates here use Dhaka time. Deployment origins and the post-merge steps are in the [deployment guide](deployment.md).

### Independently observed in the browser

- The stable web domain opened without Vercel authentication. The earlier deployment-specific URL redirected to Vercel login.
- Both the direct Render health endpoint and `/api/health` through Vercel returned `{"status":"ok"}`.
- Seller passcode sign-in and judge session creation worked. The constructed judge example loaded two originals and its separate catalogue.
- Two constructed screenshots were selected in reverse order, reordered, previewed and saved to the seller workspace. Both speaker-side options could be selected; the saved example used seller-right bubbles.
- The saved reference, screenshot order, speaker confirmation and fingerprint survived reload. The same seller conversation reopened after sign-out and sign-in.
- Both saved seller originals were downloaded and their SHA-256 hashes matched the selected files byte-for-byte.
- With the seller session signed out and the judge session still active, the seller original endpoint refused access. With the judge session signed out and the seller session active, the judge original endpoint also refused access. Signing out of one context left the other usable.
- No warnings or errors were captured in the inspected seller browser console. The browser test sessions were signed out afterward.

Only constructed screenshots were used for these browser imports. The browser check left one synthetic seller conversation, `PD-056DD8F88125419F`; existing seller conversations were not modified.

### Owner-reported acceptance

The owner reported that the app worked on phone and desktop, then confirmed completion of the requested persistence, judge isolation/reset, invalid-file and upload-boundary checks. That checklist included a valid batch over 10 MiB, a file over 8 MiB and a batch over 32 MiB.

Large-upload limits, invalid-file handling and judge reset were not independently repeated during the hosted browser check. No request-level trace of the reported boundary checks was captured, so this record does not independently establish the host's exact ingress ceiling or an API-generated 413 response. The earlier local cross-judge, storage-failure and security-header checks above were not all repeated against the hosts.

The private shop catalogue remains empty pending seller-reviewed data. No live model calls, order drafting, courier bookings or pilot outcomes are claimed. Switching both deployment sources to `main` and a smoke check remain part of the post-merge procedure.

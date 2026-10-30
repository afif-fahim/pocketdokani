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

# Business records, issue #2 — October 30, 2026

Local verification uses a separate SQLite database and private file storage. The updated private workbook validates and imports; counts reconcile with its source sheets, all product variants have accessible photos, the multi-item order retains both lines and the expected COD, and all three recorded payouts are present. A second import reports no writes. Customer details, workbook contents and photos remain ignored.

Request-level checks used a seller session and two separate judge sessions. Each judge received ten SKUs, eight orders across states, and two constructed payouts. A judge could not read seller lists or seller product photos. Reset restored altered synthetic stock, replaced the screenshot workspace, rejected a stale reset request, and left seller records and the other judge's orders unchanged. In-transit stock was visible with zero available quantity.

The COD calculator's focused standard-library check covers multi-item totals, a discount applied once per line, delivery and verified prior payment applied once per order, zero COD, negative COD rejection and invalid money/quantities. These checks do not establish model quality, real courier behaviour or hosted acceptance of this branch.

Browser checks at 390 × 844 covered the constructed Orders list, expanded multi-item pricing, Stock cards and product illustrations. This was viewport emulation, not a physical-phone check. SQLite migration upgrade/downgrade/upgrade and Alembic schema parity passed. PostgreSQL migration SQL generated successfully, including RLS and client-role grant revocation; a live PostgreSQL run was unavailable because the local Docker daemon was stopped.

Review found two UI edge cases, both fixed and checked in the browser: New import now opens Conversations when triggered from Stock or Orders, and an existing judge session from the screenshot-only version receives the new synthetic records on reload. The latter was checked by removing only one local judge's constructed fixture while preserving its browser session; reload restored eight orders and ten SKUs.

## Standards review

No remaining documented-standard violations, actionable baseline smells or correctness/security findings. The New import navigation regression was fixed and re-reviewed.

## Spec review

No remaining missing requirements, scope creep or incorrect implementations. The existing judge-session upgrade path was fixed and re-reviewed.

Standards: 0 remaining findings. Spec: 0 remaining findings.

For issue #2, `npm run check`, `npm run test`, the Next.js production build and the staged privacy guard passed.

## Follow-up review: hosted photo imports

Independent review reproduced an import failure when Supabase returned HTTP 400 with `code: NoSuchKey` for a new photo. The storage adapter now recognises that specific missing-object response (and its HTTP 404 form); missing buckets, authorization failures and other provider errors still propagate. The importer uses the adapter's optional read, and strict image reads retain their existing behaviour. See [Supabase's renderer](https://github.com/supabase/storage/blob/master/src/storage/renderer/renderer.ts#L98-L105) for the response contract.

A temporary synthetic HTTP-boundary reproduction failed before the fix, then verified new-photo import, SKU persistence, unchanged repeated imports and reuse of existing photos. It also checked that bucket/auth/server errors, malformed or non-object JSON, non-JSON responses and timeouts are not treated as missing objects. This used no hosted service or real credentials and does not establish live Supabase acceptance. No additional test files are committed, respecting the issue's COD-only exception.

The review's pricing-duplication observation is also addressed: `LinePrice.total()` owns line validation, discounts and totals, and is shared by COD calculation, workbook reconciliation and order display. The existing COD check continues to pass.

Follow-up standards review: 0 remaining findings. Follow-up spec review: 0 remaining findings. Local read payloads retain the imported order-line totals and all three payouts after the shared-pricing change.

# Order drafting, issue #3 — October 30, 2026

Local acceptance used fresh SQLite databases, private temporary objects, constructed screenshots and synthetic responses at the Meta HTTP boundary. No real customer data or live model credentials were used. No additional test files are committed; the existing COD check remains the automated-suite exception.

The acceptance driver verified two-item extraction, final-price fields with source quotes, blank invalid phones and unknown/unavailable SKUs, missing quoted numbers, signed values, Bangla digits and adjacent currency text, and punctuation around prices. A complete phone cannot be extracted from a longer digit run. A seller correction enabled confirmation, creating one stable `PD-` reference. Repeated confirmation did not create another order; stale revisions returned 409. Saving edits returned the order to draft, and removing a line preserved the remaining line's own source evidence.

The constructed two-line order calculated COD 1,080 BDT. An unverified customer claim of 500 BDT did not reduce it; explicitly marking the payment as seller-verified changed COD to 580 BDT. Required fields, unavailable stock, negative COD and totals exceeding PostgreSQL's money-column capacity are blocked before confirmation. The shared COD calculator owns the server arithmetic.

Two independent judges and a seller session could not read one another's drafts or voice transcripts. Reset removed only the requesting judge's draft and restored its eight fixture orders. Model budgets survived reset. Disabled models and exhausted budgets made no provider requests. A simulated transient provider failure consumed an attempt, was audited, and retried once; successful attempts recorded usage and latency. Uploaded synthetic stereo audio was converted by ffmpeg to mono 16-bit 16 kHz WAV, sent with language biases and SKU keywords, and its transcript became separately cited extraction evidence.

SQLite migration upgrade/downgrade/upgrade and Alembic metadata parity passed. PostgreSQL migration SQL generated successfully, including RLS and client-role grant revocation for all three new tables. This does not establish live PostgreSQL migration or hosted storage acceptance.

Browser checks at 390 × 844 covered the two-item editor, empty-phone confirmation block, corrected-phone confirmation, screenshot 2 source navigation, seller-verified payment, live COD, saving a confirmed order back to draft and keeping its reference on reconfirmation and reload. These use injected synthetic responses and viewport emulation, not a physical phone or live extraction.

The final `npm run check`, all three existing COD tests (`npm run test`) and the Next.js production build passed. Private inputs, temporary acceptance drivers and the pre-existing generated Next.js type-reference change are excluded from the commit.

## Standards

No documented-standard violations or actionable baseline smells remained. One additional correctness finding was fixed: the server now rejects a calculated COD beyond `Numeric(14,2)` capacity with 422 before persistence, and the editor applies the same bound. Focused follow-up: 0 remaining findings.

## Spec

No missing implementation requirements or scope creep remained. The review found that phone evidence could accept a valid-length prefix of a longer number; complete digit boundaries now prevent that. Follow-up checks also covered quoted-number punctuation, Bangla currency text and malformed grouped numbers. Focused follow-up: 0 remaining actionable findings.

Standards: 0 remaining findings. Spec: 0 remaining findings. Live Spark perception quality, selection of final negotiated prices on real conversations, deployed voice-note behavior and the physical-phone under-two-minute acceptance target remain unverified. Enable server-side models and perform those acceptance checks before claiming the issue's hosted acceptance gates or pilot results.

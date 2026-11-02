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

# Business assistant, issue #4 — October 30, 2026

Local request acceptance used fresh SQLite databases, temporary local storage and synthetic responses at the Meta HTTP boundary. No customer records, real audio, live credentials or hosted services were used. The disposable acceptance driver stays ignored; no test files are added to the repository.

Checks covered all six read tools, a Dhaka calendar-date filter, dispatch count (two constructed orders), all-time order value (4,050 BDT across five eligible orders), received/in-transit quantities, recorded payouts (880 BDT), and delivered COD (1,060 BDT before courier fees). Unknown order lookups and ungrounded answers returned an explicit unknown response; unsupported numeric prose fell back to recorded facts. Tool arguments could not override the shop owner. Sales, payout and stock numbers came from stored records and code calculations.

Status proposals made no changes before confirmation. Confirmation used the ordinary status endpoint, while stale/repeated requests returned 409. A second judge could not change the first judge's order or open its draft; the seller shop remained empty. Returning a booked order restored one line's quantity once. Draft proposals created no workspace until confirmed, created only an unconfirmed draft, preserved proposed line values, kept payments unverified and reused the same workspace on retry. Reset cleared multiple draft workspaces for only the requesting judge and invalidated a pre-reset order snapshot.

Synthetic stereo audio was normalized by ffmpeg to mono, 16-bit, 16 kHz WAV. The transcription request included Bengali/English biases and the current judge's product/customer keywords. The transcript was returned for editing, without executing an assistant turn. A model repeatedly requesting tools executed only six lookups, then stopped; disabled models made no provider request. Per-turn audit records contained transcript, tool calls/results, answer, aggregate usage and latency. Private response headers and Origin checks remained in effect.

Browser checks at 390 × 844 covered a typed Bangla question, two returned dispatch-order chips, chip navigation that expanded the correct order, Cancel preserving booked status, and Confirm changing it to delivered. The browser used a separate temporary synthetic API with a fake model provider. The app's microphone permissions header now allows its own origin; microphone permission prompts, physical-phone recording and live transcription were not exercised.

Confirming a draft-creation card opened the existing editor with status Draft, blank missing recipient fields, no verified prior payment and final order confirmation disabled until valid details were supplied. Returning to Assistant preserved the card's decision and the earlier conversation.

## Standards

No documented-standard violations or actionable baseline smells remain. Review found two correctness issues, both fixed: malformed final answers now validate before replacing the safe fallback, and status changes now claim the linked draft revision before the order snapshot update. A disposable regression check loaded a stale draft/order before cancellation and then attempted an edit; it returned 409 and left the order cancelled. PostgreSQL lock ordering was reviewed by reasoning; no live PostgreSQL concurrency run was available. Proposal replies use a fixed awaiting-confirmation acknowledgment, so generated prose cannot claim an unconfirmed write completed.

## Spec

No missing requirements, scope creep or incorrect implementations remain after follow-up review. Assistant transcription now includes SKU identifiers, variants and in-transit product names as well as shop customer names. The synthetic ASR request check verifies those hints and the normalized WAV format. Repeated checks also covered malformed replies, partial read-result preservation and proposal acknowledgment.

Standards: 0 remaining findings. Spec: 0 remaining findings. The repository format/lint/type checks, all three existing COD tests, source-partition validation, staged privacy guard and production build passed. No new test files or private inputs are committed.

This record establishes local behavior with synthetic model output. Live Spark tool selection, transcription accuracy, answer grounding on real questions, the 20-question evaluation, hosted acceptance and physical-phone behavior remain unverified.

### Grounding correction — October 30, 2026

A subsequent review reproduced an incorrect pending-dispatch answer: the model claimed 2026 parcels when the stored count was two. The numeric-occurrence guard accepted the year from record timestamps. That guard has been replaced with a structured final response containing only citations and metric references. The server validates each reference and supplies the label and value; model-written prose, labels and values are rejected. An explicit empty selection returns an unknown answer even after successful lookups.

A disposable stdin driver used an in-memory synthetic judge shop and mocked model responses. Checks passed for the original timestamp collision, spelled-out numeric and nonnumeric false claims, unknown citations, missing or uncited metrics, attempted value/label injection, empty selections, missing records, correct counts in English and Bangla, sales and stock metrics, interrupted lookups, proposal acknowledgments and matching audit output. No test files or private inputs were added. These checks do not establish live model tool selection or physical-phone behavior.

### Proposal citation correction — October 30, 2026

Live browser testing found a valid draft proposal labelled incomplete when Spark cited the proposal result. Citation validation accepted only read-result IDs. It now also accepts IDs of tool results containing proposals; numeric references still require a cited, nonempty read result and an allowed metric key from that result. Unknown IDs, error-only results and proposal-only numeric references remain invalid. The model instructions describe the same distinction.

The captured constructed-data trace failed before the fix and completed after it without changing the model response. A separate ignored regression driver passed seven tests covering twelve synthetic scenarios: read-then-proposal and proposal-only citations, mixed and repeated citations, grounded numeric lookups, status proposals containing records, unknown/error citations, and invalid or injected metric references. No new test files are committed, following the repository's testing convention.

The same typed draft request also completed through the local browser with live Spark after the fix. Its card retained the requested item and amounts, left the unknown phone blank, displayed the fixed awaiting-confirmation acknowledgment and omitted the incomplete-turn warning. Repository formatting, lint, type checks, source-partition validation, the existing COD tests, staged privacy checks and the production build passed. This verifies the reported failure with constructed data; it does not establish general model accuracy or hosted/physical-phone acceptance. Voice was not exercised.

# Pack check, issue #5 — October 31, 2026

Local acceptance used fresh SQLite databases, temporary private storage, constructed photos and synthetic responses at the Meta HTTP boundary. Disposable acceptance drivers remain ignored; no test files, customer photos or credentials are committed.

The API checks covered name/reference swaps naming both fields, a wrong phone digit naming position 7, wrong COD, conflicting house/road numbers, a corrected multi-item label passing and marking the order packed, blurry readings returning unsure, recorded seller overrides preserving the unsure verdict, and repeated overrides returning 409. A correct label with a mismatched bag retained label pass and bag mismatch separately, returned overall fail and revoked earlier packing authorization. Malformed label responses became unsure. Stale results, including a simulated edit during a model call, were rejected without publishing evidence. Saving a packed order back to draft cleared its active check; reconfirmation did not revive it.

Private original bytes survived retrieval with no-store headers. Corrupt images, missing mutation headers and wrong Origins were rejected. A second judge and the seller session could not access another judge's checks or originals. Reset removed only the requesting judge's check records and objects. Provider errors created sanitized model audit records and no completed check. The final constructed API run made 23 mocked provider requests; every actual model attempt used the existing budget/audit path.

Separate adapter checks exercised the official SAM parser with valid box/mask events and obtained label and bag crops; empty and malformed segmentation output recorded full-photo fallbacks. Full-photo mode skipped SAM. Label requests contained neither expected order values nor SKU context. Bag results covered each expected line. Duplicate/missing label fields became illegible. Fourteen model audit records were checked across these adapter scenarios. No live Meta request was made.

SQLite migration upgrade/downgrade/upgrade and Alembic metadata parity passed. PostgreSQL migration SQL generated successfully with RLS and PUBLIC/client-role grant revocation for `pack_checks`; no live PostgreSQL migration or concurrency run was performed.

Browser checks used the actual Next.js app at 390 × 844 with synthetic API responses. Label pass and bag mismatch remained separately visible; a failed check offered no override. Field reasons, private originals and crop images rendered. Unsure override required a second confirmation, refreshed the order to packed and retained the unsure verdict. Earlier checks showed as historical. No horizontal overflow or browser errors were observed, and both full-page result screenshots were visually inspected. This was viewport emulation, not a physical camera check.

Repository formatting, lint, strict Python/TypeScript checks, source-partition validation, the staged privacy guard and the Next.js production build passed. The full existing test suite passed (three COD tests). No new test files were added, following the issue's constraint.

## Standards

No documented-standard violations or actionable baseline smells remain. Additional correctness review caught missing/different address-number headings being accepted; those are now unsure, with conflicting values taking precedence as fail. Focused heading and verdict-precedence probes passed. Standards: 0 remaining findings; additional correctness: 0 remaining findings.

## Spec

No missing requirements, scope creep or incorrect implementations remain after follow-up review. Locality words containing digits are retained when comparing addresses, and guessed text in an illegible field cannot trigger a definite swap failure. Constructed regression probes covered changed locality names, missing headings, conflicting numbers, exact matches and illegible name/reference text. Spec: 0 remaining findings.

Live label/bag perception accuracy, the seller's approximately 20 handwritten photos, SAM-versus-full-photo evaluation results, deployed storage and physical-phone capture remain unverified. The constructed checks establish implementation behavior, not those acceptance gates.

### Address comparison correction — October 31, 2026

Follow-up review reproduced three address defects: `rd` inside `Ward` overwrote a Road heading, slash-letter identifiers such as `12/A` and `12/B` lost their suffixes, and matching explicitly headed clauses became unsure when reordered. The first two could classify a definite conflict as unsure, incorrectly making seller override available. A clause reorder could also cause a false failure through the `Ward` collision.

The comparator now checks Unicode word boundaries for heading aliases, preserves complete Latin/Bangla suffixes, retains every repeated heading and compares explicitly headed values independently of clause order. Only unlabelled numeric values retain positional checks. Each address's number list is extracted once for set and positional comparisons. The model-to-persistence handoff now uses a shared `PackAnalysis` typed dictionary, and segmentation uses the `sam`/`full_photo` literal type.

A disposable assertion driver failed before the correction and passed afterward: 21 constructed cases exercised both `address_result` and its `compare_label` caller. Cases included the reported defects, Bangla headings/digits/suffixes, conflicting repeated headings, missing/different headings, alphanumeric locality names, dotted `Rd.` and uncertain unlabelled-number order. Independent read-only probes passed another 15 cases, including canonical Unicode forms and slash spacing. No new test files are committed.

Extended synthetic API acceptance passed with 31 mocked model requests. Wrong road numbers hidden by a Ward clause and conflicting slash suffixes now fail and reject seller override with 409. Correctly reordered matching addresses pass and mark the order packed. The existing isolation, invalidation, stale-result, audit, reset and migration checks also passed. No live model calls, customer data or hosted writes were used.

Follow-up review: Standards 0 findings; Spec 0 findings. The spec reviewer independently checked 13 constructed cases, including suffixes, repeated headings, alias boundaries and locality differences. Strict mypy and Ruff passed, as did the full existing suite of three COD tests.

### Live development follow-up — November 1, 2026

The owner supplied ten generated parcel images based on real historical label and bag photos, then explicitly authorized their processing by Meta and the generation and Meta processing of missing variants. Nine supplied images map to the previous private business-record database; one has no matching recipient, order number or phone and is excluded from correctness scoring. Five additional generated variants isolate a wrong phone digit, unreadable label, wrong-colour bag, name/order-number swap and wrong COD. All related variants are registered together as constructed development sources. These are not fresh photographs, independent handwriting samples, held-out evaluation or physical-camera evidence.

The historical records are delivered orders. Request-level checks used a separate database/object copy, reopening only those copies for the pack workflow. SHA-256 checks confirm that the source database and all ten supplied images remain unchanged. Ground truth comes from the stored order fields, quantities, variants and SKU photos, separately from blind label readings. Private media, prompts, mappings and detailed outputs remain ignored.

Two implementation gaps were reproduced and corrected before the final comparisons:

- The importer had generated app references that were never present on the seller's historical labels. Historical seller orders now expose their preserved workbook number as the label order number, while retaining stable internal references. Exact comparison allows one decorative leading `#`, Unicode/case and Bangla-digit normalization. It never substitutes an arbitrary courier ID. Orders and capture instructions show the expected label number. Seventeen focused reference regressions and the original read-only database reproduction passed.
- Spark correctly transcribed the seller's `2000/-` amount, but the comparator rejected that notation as unsure. The amount parser now accepts a terminal slash-dash after one numeric amount and still rejects signed, malformed, ranged or multiple amounts. Independent probes passed eleven valid and fourteen invalid formats.

The final live run completed 28 HTTP checks: 14 images through SAM and through full-photo mode. All returned 201 and retained original bytes/hashes, private crops where present, no-store responses and denied cross-context reads. Pass marked the copied order packed; fail rejected override; unsure permitted a recorded seller override while retaining the unsure verdict. The final comparisons used 84 audited Meta attempts; six earlier diagnostic attempts bring this development session to 90. The original synthetic API acceptance also passed with 31 mocked provider requests.

| Acceptance case | SAM path | Full-photo path |
| --- | --- | --- |
| Name and label order number swapped | Fail; both fields named | Fail; both fields named |
| One wrong phone digit | Fail; position 7 named | Fail; position 7 named |
| Wrong COD | Fail; COD named | Fail; COD named |
| Correct multi-item label and visible bags | Pass; order packed | Pass; order packed |
| Unreadable label | Unsure; recorded override | Unsure; recorded override |
| Correct label with wrong-colour bag | Label pass; bag mismatch | Label pass; bag mismatch |

Across the 14 paired images, both methods agreed on all overall, label and bag verdicts: three pass, nine fail and two unsure per method. SAM produced usable bag crops for all 14 but no label region for any; label reading accurately recorded full-photo fallback. Stored-event replay confirms genuinely empty completed label responses, rather than discarded masks or parser errors. Median request duration was 19.75 seconds with SAM and 9.62 seconds without it. These small development observations establish neither an accuracy improvement nor general timing guarantees.

Field-level readings were not identical in two pairs. In one supplied image, Spark reassigned values from misplaced name/phone rows by their apparent type; the separate wrong COD still made the overall result fail. The isolated name/order-number swap passed its acceptance gate, but the observed field-reading variability remains a perception-quality limitation. No held-out accuracy claim is made.

Real PostgreSQL 17.11 checks passed migration upgrade/downgrade/upgrade, Alembic metadata parity, `pack_checks` RLS and client/PUBLIC grant revocation, direct client-role read denial, and competing same-version pack claims and overrides. Each race produced one success and one 409; the winning override retained unsure plus seller/time. The disposable container was removed; Docker Desktop remains running.

The actual Next.js UI passed a 390 × 844 browser check with a synthetic historical number differing from its internal app reference. Orders and capture instructions displayed the historical number; separate verdicts, failure/override gating, private images, history, no overflow and no browser errors also passed. Both screenshots were visually inspected. Formatting, lint, strict Python/TypeScript checks, source partition validation, the three existing COD tests and the production web build passed. No test files were added to the repository.

Both hosted health endpoints returned 200. The deployed pack-check path returned the same generic 404 as an unknown route, while the existing protected Orders path returned 401; the deployed API therefore appears to lack this slice. Hosted pack-check/private-object-storage acceptance remains open. Physical-phone capture and accuracy on fresh real labels also remain unverified; generated photos cannot establish those gates.

Review follow-up aligned result headings, comparison reasons and seller-override confirmation with the label order number. The API request reuses `SegmentationMode`; frontend state uses the same two-value union with a guard on selection. A focused 390 × 844 browser check confirmed the historical number in override confirmation and correct submissions from both comparison options, with no overflow or browser errors. Python reference regressions, reason-copy checks and the request's two-value enum passed. No new live model calls were needed for these wording and type changes.

## Courier booking, issue #6 — November 2, 2026

The owner supplied a saved merchant API guide under ignored private storage and saved the Steadfast keys in the local server environment. The guide contains account credentials in its examples and remains private. A read-only authenticated `GET /get_balance` returned HTTP 200. No balance value, key or account-specific API response is published here.

The guide confirms the single-order create fields and unique invoice rule. It documents invoice status as a status-only response and tracking history as a possible source of the consignment ID, without a tracking code. The implementation therefore retains unresolved outcomes, recovers only unambiguous identifiers and labels an unavailable tracking code honestly. A missing or ambiguous live lookup is not treated as permission for an automatic create retry.

No live parcel-create request was made. No genuine order was available, so issue #6's first real booking and merchant-panel confirmation remain unverified. Hosted courier behavior, physical-phone booking, live duplicate/timeout recovery and automatic status webhooks are not established by the read-only credential check. Local validation results are recorded separately when completed.

Local validation passed the three existing COD checks and four booking endpoint checks: repeat/concurrent requests, duplicate-invoice adoption, timeout followed by lookup before retry, and late success followed by recovery and one stock restoration. Additional synthetic API probes confirmed that booking proposals make no business writes; draft, unpacked and stale orders are rejected; two orders competing for one stock unit produce one booking; and cancellation restores stock once. Judge booking uses an explicitly constructed packing example without model calls or a real phone number.

The actual Next.js interface passed a 390 × 844 browser check: simulated late success first showed an unknown outcome and only the recovery action, then invoice reconciliation displayed the fake consignment and tracking code. Constructed packing was labelled explicitly. No horizontal overflow or browser errors were observed. Formatting, lint, strict Python/TypeScript checks, source-partition validation and the production web build passed. SQLite migration upgrade/downgrade/upgrade and Alembic metadata parity passed.

The local Docker Linux engine was unavailable, so live PostgreSQL migration, role-denial and concurrency checks remain unverified for this slice. Offline PostgreSQL migration SQL generated successfully and includes RLS plus PUBLIC, anon and authenticated grant revocations for both new tables. This does not substitute for executing the migration on PostgreSQL.

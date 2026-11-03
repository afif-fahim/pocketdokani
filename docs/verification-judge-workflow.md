# Judge workflow, issue #15

Recorded November 3, 2026 (Dhaka). Local checks use isolated synthetic records, private temporary storage and the fake courier. The issue #15 branch has not been deployed. The deployed live rehearsal below exercised the version already hosted at the time, independently of the new sample controls.

## Implemented walkthrough

The sample path below was exercised in the follow-up local browser check. Local synthetic workflow verification remains separate from hosted acceptance, live AI quality and physical-phone behavior.

1. Open `/judge`, choose **Start sample shop**, then **Start sample order**. The guide also offers **Try assistant · বাংলা / English** separately.
2. Choose **Extract draft with live AI** to call the configured model, or **Use sample draft · no AI analysis** for an explicit hand-authored reading of the same screenshots. The latter does not consume a model call. Review the recipient, lines/prices and payment/COD groups before the source archive. Source chips still open originals. Unresolved fields retain their reasons.
3. Keep the non-contactable `01X-EXAMPLE` marker. The synthetic basket is one tote at BDT 450 and one shoulder bag at BDT 550, plus BDT 80 delivery: COD BDT 1,080. The customer's payment claim remains unverified unless the seller explicitly verifies it. **Confirm order** opens that order's next task, preserving its stable reference.
4. Under **Check parcel**, select **Wrong label COD · fail** and **Use sample result · no AI analysis**. The failure blocks booking and cannot be overridden. Select **Corrected parcel · pass** to demonstrate correction. Alternatively, **Unreadable label · unsure** permits a separate **Confirm seller override**; it remains labeled unsure with a recorded override.
5. The synthetic-photo download is an input for an optional live Meta check, not a completed analysis. A real photo/model request never falls back to the sample result. Label and visible-bag verdicts remain separate, and neither establishes sealed contents.
6. Review the same reference, recipient and COD, then choose **Simulate booking · Fake**. Consignment/tracking identifiers are shown after success. Pending/unknown results offer **Check courier booking**; retrying creation requires reconciliation. Timeout/duplicate examples and photo-comparison methods sit under **Advanced demo options**.
7. **Reset sample** explains its session-only scope before restoring synthetic data, clearing selected tasks and returning to the guide. It preserves the model-call budget. Seller records and other judge sessions stay separate.

## Endpoint verification

The existing booking HTTP regression script was extended at the user-agreed draft-confirmation and courier-booking boundaries. It uses a disposable database and storage, never the configured seller database.

- Explicit sample draft confirms with the marker and COD BDT 1,080.
- Sample mismatch blocks an override; correction packs and books the same order with one stock deduction across repeated booking requests.
- Unsure requires a separate override and remains unsure afterward.
- Seller confirmation rejects the marker; seller sample reading requests are refused. Judge-only sample pack/input routes require constructed order lines. Existing live-courier phone validation and judge-to-fake routing remain in force.
- Downloading an illustration creates no pack-check record.
- Fresh/reset fixtures include today's orders and payouts in the Dhaka calendar. Existing starter questions also use pending dispatch, available stock and all-time records.
- A second judge cannot open/check the first judge's order. Reset preserves the second judge's records and a nonempty seller snapshot.
- Reset requests carry their expected workspace IDs. Replaying the same reset is refused without changing records, including an initially empty workspace. An interrupted request can be explicitly retried against the same snapshot; a refused retry retains the original unknown state.
- Existing concurrent/duplicate invoice, timeout reconciliation, late-success and one-time stock-restoration checks remain included.

Failing checks were observed before implementing sample draft, sample pack, photo download and relative dates, then passed after their corresponding changes.

`npm run check`, `npm run test` (3 COD and 12 booking/workflow checks), and `npm --prefix web run build` passed. The in-process HTTP tests stalled under the Windows sandbox and passed when the same command ran outside it. No new test framework was added.

## Loading and failure handling

Reads have a 20-second deadline; session writes allow 60 seconds, ordinary writes 120 seconds, extraction/transcription 180 seconds, and multi-step pack/assistant processing 360 seconds. Deadlines cover response-body reading as well as the initial connection. No write is automatically retried. A timed-out or lost business-write response is labeled unknown; it is not treated as proof that nothing saved.

Draft, parcel, status and courier recovery retain pending action markers across reload and require a state check before another write. Manual draft creation retains its request ID for idempotent recovery. Recoverable draft/assistant errors preserve current fields, typed questions or recorded audio. Microphone denial has a typed fallback; an unanswered permission request releases typed input after 20 seconds. Sample reset recovery checks the session's workspace state before accepting further mutations.

A successful state read enables explicit draft/parcel retries even if the first request never reached the server. Server revision/version claims prevent a late competing request from authorizing a second change. Booking still requires invoice reconciliation. Reset's expected-workspace guard prevents a completed reset from deleting new work during a retry; a rate-limited retry cannot clear the original unknown reset.

These paths were inspected in code and checked by TypeScript/ESLint. The local browser follow-up below additionally exercised unavailable-service recovery, booking reconciliation, reset, unsaved-input protection and browser navigation. It did not exhaust every timeout or ambiguous-write case.

## Deployed live rehearsal

The existing public deployment was exercised through its normal endpoints with a fresh isolated judge cookie, synthetic screenshots/illustration, no order confirmation and no courier booking. No write was retried. Model calls were enabled.

| Operation | HTTP status | Observed latency | Actual result |
| --- | --- | --- | --- |
| Fresh unauthenticated session check | 401 | 0.294 s | Expected sign-in boundary |
| Start isolated judge session | 200 | 0.447 s | Session created |
| Open sample screenshots | 200 | 1.204 s | Constructed conversation opened |
| Live extraction | 200 | 22.205 s | Model returned a draft; not confirmed |
| Live typed Bangla assistant | 200 | 6.565 s | Bangla answer, one fact group, no proposal, not marked incomplete |
| Live SAM parcel analysis | 201 | 17.252 s | Overall **unsure**, label **unsure**, visible bag **unsure** |

The parcel input was an existing synthetic illustration, not a physical parcel. It was submitted to the real analysis endpoint; its result was not the preloaded fixture. These observations establish that the deployed services responded, not accuracy, evaluation scores, physical-phone behavior or acceptance of this branch.

Separate read-only measurements returned the judge page in 0.555 s, proxied health in 0.272 s, direct API health in 0.342 s and unauthenticated proxied session in 0.312 s. The previously reported prolonged opening state did not reproduce. No cold-start, proxy or deployment root cause is claimed. If it returns, compare direct API and proxy timings, then distinguish session lookup from authenticated data loading.

## Local browser follow-up

The initial attempt could not reach localhost, and native Windows Firefox control was unavailable. A follow-up succeeded using the in-app browser and local servers started outside the Windows sandbox. It exercised the issue #15 branch at `http://localhost:3015/judge`, with its own disposable SQLite database/private storage, model calls disabled, and the fake courier. The seller database and deployed app were not used for this check.

- At 1440 × 1000, the start guide opened the sample screenshots and explicitly labeled sample draft. Recipient source chips opened the original screenshot. Editing the name and choosing Stock opened the unsaved-work dialog; **Keep editing** retained the edited value. Restoring the sample name and confirming opened the same order's **Check parcel** task, with COD BDT 1,080 and the non-contactable phone marker.
- A sample COD mismatch showed fail with no booking or override button. The corrected sample packed the same order. Fake booking displayed a consignment ID and tracking code, and the reference, COD and booked state survived reload of the order deep link.
- The initial disposable schema setup omitted the fake courier table. The first booking therefore became unresolved without claiming success. After completing the local schema, **Check courier booking** established no consignment, and an explicit same-invoice retry completed successfully. No automatic create retry was used. This was a local verification setup mistake, not a product-code change.
- At 390 × 844, the sample draft, confirmation, unsure result and separate seller override were exercised. Booking was absent before override; afterward the order was packed while the visible badge remained **Sample · Seller override · unsure**. It did not become a pass.
- Reset's confirmation explained session scope and retained model budget. **Keep exploring** retained the selected order; confirming reset returned to `?section=orders`, removed the old order and cleared the selected task.
- The disabled assistant displayed its unavailable-service message. Typed Bangla remained editable and survived Stock → Assistant navigation; microphone and send controls stayed disabled, and no answer was fabricated.
- Pausing only the isolated API produced an actionable unavailable-service message and **Refresh checks**, rather than an indefinite spinner. Restarting it and refreshing restored the same order's override history and cleared the error. This exercised a refused connection, not a deliberately delayed 20-second timeout.
- Browser Back and Forward restored Orders/Stock with coherent section/order query parameters. Desktop and phone document scroll width equaled client width; no page-level horizontal overflow was observed. The development toolbar overlapped the phone Orders button, so keyboard activation was used for that control during development-mode checks.

Synthetic screenshots: [desktop guide](images/issue-15/orders-desktop.jpg), [desktop draft](images/issue-15/draft-desktop.jpg), [failed parcel](images/issue-15/pack-fail-desktop.jpg), [desktop booking](images/issue-15/booking-desktop.jpg), [phone booking](images/issue-15/booking-mobile.jpg), [phone override](images/issue-15/override-mobile.jpg), [reset confirmation](images/issue-15/reset-mobile.jpg), [disabled assistant](images/issue-15/assistant-disabled-mobile.jpg), [unavailable API](images/issue-15/api-unavailable-mobile.jpg) and [recovered history](images/issue-15/api-recovered-mobile.jpg).

Still open: physical-phone camera/microphone behavior, the denied-microphone interaction, deliberately slow timeout/unknown-reset browser cases, and hosted acceptance of this branch. The local disabled-model check does not establish live AI behavior; the earlier deployed live rehearsal above remains a separate observation.

## Independent review

### Standards

No documented-standard violations were found. One non-blocking P3 **Duplicated Code** judgment call noted repeated pending-marker storage plumbing across the draft, parcel, booking and status controls. A small shared storage helper could reduce this duplication; reconciliation remains local because each operation has different evidence and retry rules. This optional cleanup was left outside the corrective pass.

### Spec

The review identified recovery locks when a draft/parcel/reset request never reached the server, a reset retry that could clear the original unknown state after a rate-limit refusal, and parcel-marker ordering across a component remount. The fixes permit explicit version-guarded draft/parcel retries after a read, protect reset retries with the original workspace snapshot, preserve unresolved reset state on refusal, and clear parcel markers before refreshing keyed components. The follow-up review confirmed no remaining actionable spec findings. Reset also clears stale session markers after confirmed completion, and the draft editor displays the actual packed/booked progression.

Final counts: Standards **0 hard violations, 1 P3 advisory**; Spec **0 remaining implementation findings**. Local synthetic browser checks passed as described above; the remaining hosted/physical-device gates stay open.

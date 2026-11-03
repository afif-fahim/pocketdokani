# Judge workflow, issue #15

Recorded November 3, 2026 (Dhaka). Local checks use isolated synthetic records, private temporary storage and the fake courier. The issue #15 branch has not been deployed. The deployed live rehearsal below exercised the version already hosted at the time, independently of the new sample controls.

## Implemented walkthrough

This is the on-screen path to rehearse; it is not a claim that the browser acceptance gate passed.

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

These recovery and navigation paths were inspected in code and checked by TypeScript/ESLint. Their interactive browser behavior still needs rehearsal.

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

## Browser acceptance still open

Local computer-use verification was attempted. The in-app browser could not reach localhost. The local Windows Firefox path then stopped with: “browser URL policy enforcement is not yet supported for the current Windows browser.” Computer use ended at that point. No UI screenshot, phone/desktop visual pass, denied-microphone interaction, back/reload rehearsal or slow-network recovery is claimed for this branch.

Before marking hosted UI acceptance complete, rehearse the walkthrough at phone and desktop widths, capture synthetic screenshots, verify the typed Bangla fallback after microphone denial, exercise a slow/unavailable API, reset during recovery, and check reload/back/order deep links. This remains distinct from the successful endpoint checks and deployed AI calls.

## Independent review

### Standards

No documented-standard violations were found. One non-blocking P3 **Duplicated Code** judgment call noted repeated pending-marker storage plumbing across the draft, parcel, booking and status controls. A small shared storage helper could reduce this duplication; reconciliation remains local because each operation has different evidence and retry rules. This optional cleanup was left outside the corrective pass.

### Spec

The review identified recovery locks when a draft/parcel/reset request never reached the server, a reset retry that could clear the original unknown state after a rate-limit refusal, and parcel-marker ordering across a component remount. The fixes permit explicit version-guarded draft/parcel retries after a read, protect reset retries with the original workspace snapshot, preserve unresolved reset state on refusal, and clear parcel markers before refreshing keyed components. The follow-up review confirmed no remaining actionable spec findings. Reset also clears stale session markers after confirmed completion, and the draft editor displays the actual packed/booked progression.

Final counts: Standards **0 hard violations, 1 P3 advisory**; Spec **0 remaining implementation findings**. Browser acceptance remains open as described above.

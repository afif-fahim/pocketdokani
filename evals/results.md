# Judge smoke results — November 4, 2026

**Hosted walkthrough: FAIL, blocked before extraction. Corrected local walkthrough: completed with live models and a simulated courier; wrong-COD detection failed.** These are constructed development smoke results, not held-out accuracy, genuine shipments, pilot observations or time-saved measurements.

## Provenance and evidence

The corrected run used isolated SQLite records/private local objects, with real `muse-spark-1.3`, `sam-3.1` and `muse-voice-transcribe-1.0` calls. It ran **15:13:10–15:15:30 Asia/Dhaka** on November 4. Source base: `2d802c582f7be30d1c8d0523ec83256cbf8df3d0`, plus the RGBA fixture correction included with this report. The exact fixture hash, run timestamps, field outputs and most timings are in the [reviewed synthetic evidence](evidence/synthetic-smoke-2026-11-04.json). Six client timings (extraction, proposal, whole runner, and the three hosted request times) are not recorded there; no public source for them was retained, so they are reported here as unverified.

Manifest SHA-256 at both runs: `3de4dfa7b12fdc4229cd8d928fa416c620f2c554cb1213c6cf2c1734ca3d0e36`. Sources were registered before calls: `constructed-conversation-001` (two screenshots), `constructed-parcel-illustration` (correct/wrong-COD/unreadable variants) and `constructed-assistant-voice-001` (synthetic English speech). All remain **constructed/development**. No prompt tuning or retries were used to improve the reported outcomes.

Raw inputs, predeclared ground truth, request logs, provider audits and the one-off runner remain ignored under `evals/private/` and `.scratch/`. An initial local attempt failed before extraction with `ValueError: bad transparency mask`; its seven provider attempts, successful English transcription and three correct repeated business questions remain separate from the corrected run's denominators. Converting the paletted Bengali quote PNG to RGBA fixed the reproducible rendering blocker without changing its contents or the model prompts.

## Measured outcomes

| Capability | Observed result | Denominator / limitation |
| --- | --- | --- |
| Extraction values | **11/11 correct**, two lines returned | Five header fields plus quantity/price/discount on each of two lines; excludes SKU suggestions |
| SKU suggestions | **2/2 correct** | Received blue tote and black shoulder SKUs; this conversation only |
| Wrong-COD detection | **0/1 detected as fail**; actual **unsure** | Input said BDT 1,180 versus confirmed 1,080. Blind reader returned all five fields illegible; bag matched. No red verdict was demonstrated. |
| Clean parcel | **1/1 pass** | Label pass, visible illustrative bags matched; no seller override used |
| Obscured phone | **1/1 unsure** | Label unsure, bag matched; overall unsure across all parcels **2/3** |
| SAM regions | **0/6 usable crops** | Both regions on all three inputs used full-photo fallback. No controlled crop-versus-full-photo comparison was run. |
| Business questions | **5/5 correct**, **0/5 confidently wrong** | Four stored-record answers plus one correct unknown response, below; AI selects tools, server renders record metrics |
| English transcription | **1/1 meaning/exact words correct**, ignoring case | “How many parcels are left to send?”; synthetic speech, not a physical microphone or Bangla ASR test |
| Connected local workflow | Fake booking, stock, proposal and reload checks passed | Confirmed COD 1,080; no verified advance despite the customer's 500-payment claim. No real shipment. |

Extraction ground truth matched these actual values before seller save:

| Field | Expected and observed |
| --- | --- |
| Customer name | `Demo recipient` |
| Phone | Non-contactable marker `01X-EXAMPLE` |
| Address | `Example Road, Dhaka` |
| Customer delivery charge | BDT 80 |
| Chat agreement | `true`; seller authorization still required separately |
| Blue tote line | Quantity 1; unit price 450; line discount 0; SKU `DEMO-TOTE-R1` |
| Black shoulder line | Quantity 1; unit price 550; line discount 0; SKU `DEMO-SHOULDER-R1` |

The price quotes retained the original Bengali script from screenshot 1. The seller saved reviewed values and explicitly confirmed; no incorrect extracted value needed correction. A separate manual-draft follow-up in the isolated shop exercised an actual correction without model calls: change delivery 80 → 90, reload the saved value, observe confirmed → draft, explicitly reconfirm and reload COD 1,080 → 1,090. This follow-up is excluded from extraction/AI denominators.

Questions were asked after booking and before the delivered proposal:

| Input | Expected / actual answer | Supporting record chips |
| --- | --- | --- |
| “এখন কয়টা পার্সেল পাঠানো বাকি?” | `অর্ডার: 2` | 2 orders |
| “How many blue canvas totes are available to sell now?” | `Available units: 0` | 2 SKU lots; in-transit stock excluded from available units |
| “Mot koyta order delivered hoyeche?” | `Orders: 2` | 2 orders |
| “What is the total recorded courier payout in BDT?” | `Recorded payouts · BDT: 880.00` | 2 payouts and 2 delivered orders |
| “কুরিয়ার ফি বাদ দিয়ে আর কত টাকা পেআউট পাওনা আছে?” | “আমি জানি না। আপনার রেকর্ডে এই তথ্য পাওয়া যায়নি।” | No invented amount or supporting chips |

The delivered proposal left the booked order unchanged before confirmation. Explicit confirmation changed it to delivered; COD, consignment ID and tracking code persisted after a new GET. Fake booking reduced received tote/shoulder availability from 1/2 to 0/1. An independent judge session remained unchanged; reset restored only the first shop's eight records and preserved budget usage **28 → 28** and its reset time. Sign-out revoked access (401). Judge access without seller authentication could not read seller records (401); authenticated seller/judge isolation was not exercised.

## Timing and finite budget

The corrected local run used **28 provider attempts**: Spark 21, SAM 6, Voice 1, with zero recorded provider failures. Including the initial seven attempts gives **35 local attempts total**. The rerun cap was deliberately reduced to 53, reserving the seven already spent within an aggregate ceiling of 60. This was a development rerun after the rendering fix, not session rotation to escape an exhausted limit. Isolation-only sessions made no model calls; reset never replenished budget.

| Operation | Client HTTP elapsed | Provider HTTP latency, summed |
| --- | --- | --- |
| Extraction, n=1 | 19.116 s (not in JSON) | 18.985 s |
| Parcel checks, n=3 | 20.493 / 25.169 / 20.318 s (wrong/unclear/clean) | 65.577 s across 12 attempts |
| Voice, n=1 | 2.163 s | 2.094 s |
| Five questions | 4.451 / 17.353 / 5.302 / 5.576 / 7.593 s | Included in assistant total below |
| Proposal | 10.795 s (not in JSON) | Assistant total: 50.718 s across 14 attempts |
| Whole corrected runner | 139.601 s (not in JSON) | 137.374 s across 28 attempts |

Client elapsed uses `perf_counter` around HTTP requests. Provider latency is the application's `ModelRun.latency_ms` around each external HTTP exchange, excluding `assistant_turn` orchestration audits. Neither includes human review/capture or browser rendering; this is not an end-to-end user-time estimate.

A normal shorter walkthrough costs roughly **14 attempts**: extraction 1 + two parcel checks 8 + voice 1 + read answer 2 + proposal 2. One retry for every call needs 28; the existing maximum seven steps per assistant turn gives a conservative **48-attempt** bound with retries. A finite allowance of 60 provides headroom. Code defaults remain 12 judge / 60 seller; root `.env.example` now specifies the owner's 60/100 and the Render blueprint explicitly specifies judge 60. Existing budget accounting is unchanged.

## Hosted outcome and #7 handoff

At **15:13:25–15:13:33 Dhaka**, `https://pocketdokani.vercel.app` returned health 200 and enabled-model sessions, but `POST /api/judge/example` returned **503 in 0.467 s**, and reset returned **503 in 0.169 s** (hosted timings are not recorded in the JSON). Hosted transcription succeeded in 4.394 s (also not recorded there) with the expected English transcript. Independent-session records and sign-out checks passed. Extraction, parcel analysis, booking, the Bangla answer and proposal could not be rehearsed there. The local rendering failure is consistent with this blocker; hosted exception logs were inaccessible, so its exact cause is not independently proven.

The separate browser entry check opened eight synthetic orders after an initial saved-session timeout recovered through **Start sample shop**. [Reviewed entry capture](evidence/judge-entry-2026-11-04.jpg) shows the judge entry and eight-order sample shop only; the host it was captured on (hosted or local browser) is not established. Hosted code revision, actual judge allowance, remaining credits, provider attempt count and provider latency were not exposed; **none is claimed verified**.

**Release blocker for #7:** deploy the RGBA correction, verify the running Render setting `JUDGE_MODEL_CALLS_PER_HOUR=60` and available provider credits, then record one complete fresh hosted walkthrough after the presentation deployment. The blueprint change alone does not prove the running service adopted it. Retain the wrong-COD miss as a quality limitation; do not promise a red result. Reusable evidence for #22/#23 is the linked synthetic JSON, entry capture and tables here; entry footage is not the seller video requested in #24.

Physical-phone HTTPS microphone permission denial/recording/transcript review, camera upload, actual host upload-size ceilings, unsaved-edit warnings, interrupted-write recovery and authenticated seller isolation remain untested here. Genuine conversations, handwriting, real parcels, sealed contents, Bangla speech quality and genuine pilot outcomes were not evaluated. Larger evaluation targets remain unrun.

## Later landing walkthrough

After this report, the judge sample chat and parcel images were redrawn and registered before any call as `constructed-conversation-002` and `constructed-parcel-illustration-002` (manifest SHA-256 `5bf15c596943e9affac9f27db8602a737fce6cde22aeaeddca2aff5eef6f08ae` after formatting; same source groups as at the run). One walkthrough at **23:47–23:57 Dhaka** on November 4 used 11 provider attempts: extraction left both line discounts blank for seller review; the wrong-COD label returned **fail** and the matching label returned **pass**; all four SAM calls used full-photo fallback. These are single development examples and do not replace the denominators above. Details are in the [product evidence record](../apps/web/public/product/README.md). The results above were measured on the earlier images. Follow the steps below with the current sample, entering 0 for line discounts when they are blank.

## Reproduce

Validation passed: `npm run test` (3 COD and 13 courier/workflow checks), `npm run check` (format, lint, Python/TypeScript and 7-source/21-artifact validation), and `npm run build`. The automated workflow checks use mocked providers; they do not contribute to the live AI denominators. The first sandboxed suite stalled and was interrupted; the complete suite passed outside the sandbox.

1. Follow [setup](../docs/setup.md), keep an isolated development database/object directory, configure real server models and a finite judge allowance, and validate `uv run --frozen python scripts/check_split_manifest.py` before calls. Keep all raw evidence ignored. Use the source groups above; new related variants must stay in their group.
2. In a fresh `/judge` shop, start the sample order and extract once. Compare the eleven values and two SKU suggestions above, inspect original quotes, save reviewed values without verifying the claimed payment, and confirm COD 1,080.
3. Download/upload the wrong-COD, unreadable and correct synthetic parcel inputs in that order; run actual SAM analysis and record every verdict/reason. Never substitute a reading or force a pass. Fake-book only an authorized packed order; reload stock and identifiers.
4. Transcribe the stated synthetic English sentence separately, then ask the five exact questions above. Propose delivery of the newly booked reference, inspect unchanged records, explicitly confirm and reload. Check a second session, first-session-only reset, unchanged budget and sign-out revocation. Stop on rate limits; do not rotate sessions for additional allowance.
5. Repeat the shorter connected flow on the deployed host after its settings/revision are verified. Run `npm run test`, `uv run --frozen python scripts/check_split_manifest.py`, `npm run check` and `npm run build`. Automated provider-mocked invariant checks are separate from the live results above.

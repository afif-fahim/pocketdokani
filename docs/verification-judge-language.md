# Judge language flow — November 3, 2026

Checks used constructed records in a disposable SQLite database and local storage. Browser acceptance used the production Next.js build, actual authentication, assistant tools, record navigation and status-confirmation endpoint. Model replies and transcription were deterministic substitutes; no live model, speech-quality, hosted or physical-phone claim follows from these checks.

The original failure was reproduced through `answer_question`: an English question containing a Bengali product name returned Bangla even when the request included `answer_language: "en"`. After the fix, a disposable driver passed 36 combinations covering English/Bangla/Automatic, English/Bangla/mixed input, unknown answers, metric answers, record details, proposals, malformed replies and interrupted-turn fallbacks. Invalid language values were rejected, requested/resolved language choices were audited, and original Bengali record text remained unchanged.

A headless Chromium run passed 65 assertions at 390 × 844 and 1440 × 1000:

- Judge answer language starts at English; seller answer language starts at Automatic.
- All three English starters insert their displayed English question. Adjacent Bangla buttons insert their displayed Bangla equivalent. Neither sends automatically.
- Explicit English produces English metrics from Bangla and mixed-script input. Explicit Bangla produces Bangla metrics from English input. Automatic retains script detection. Requests preserve the original question and carry the selected answer language.
- A constructed Bangla microphone transcription remains editable and unsent, retaining the English answer choice. Sending it returns an English answer from the synthetic shop's stored records.
- Pending-dispatch answers show two supporting order chips. Opening a chip expands its matching order, and returning to Assistant preserves the conversation.
- Asking to mark `PD-DEMO-0004` delivered returns an English proposal acknowledgment without changing its booked status. Cancel preserves that status; confirming a fresh proposal changes it to delivered through the existing endpoint.
- Language and starter controls meet the 44px touch-height requirement. Neither viewport has horizontal page overflow, and no browser JavaScript errors were observed.

Both generated 720 × 1400 screenshot originals pass the existing import validator. Visual inspection confirmed that the final-price bubble contains **চূড়ান্ত দাম: টোট ৪৫০ টাকা, শোল্ডার ব্যাগ ৫৫০ টাকা।**, followed by a separate English gloss labeled **guide, not source**. The shaped-text asset is bundled with the Python package, avoiding runtime font dependencies. The extraction prompt explicitly requires original-script quotes and excludes glosses and annotations outside the conversation from source evidence. Live extraction fidelity still needs model-quality evaluation.

`npm run check`, `npm run test` (three COD and four fake-courier checks), and `npm --prefix web run build` passed. Disposable acceptance drivers and captures remain ignored under `.scratch/`; no new test files were added to the repository. A read-only review caught an English accessibility label on a Bangla button; removing that label lets the visible Bangla text supply its accessible name.

There is no demo video yet; video work was excluded at the owner's request.

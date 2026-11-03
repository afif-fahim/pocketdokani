# App shell and assistant entry, issue #14

Local development and production-build checks on November 3, 2026 used a disposable SQLite database and private local storage containing only constructed records. Model calls and live courier booking were disabled. These checks do not establish hosted acceptance, physical-phone microphone behavior, transcription quality or live assistant answer quality.

## Browser acceptance

- Fresh seller and judge entry pages explain the product, prioritize Try demo, and retain seller passcode sign-in. Incorrect passcodes show an actionable error. Signing in opens the current task without a repeated marketing hero. Signing out in a second seller tab makes the first tab's next write clear the private UI and show the expired-session sign-in action.
- Orders, Assistant, Stock and Conversations were inspected at 390 × 844 and 1440 × 1000. There was no page-level horizontal overflow. Bangla text remained legible. Visible buttons, summaries and form controls met the 44px height requirement. The phone navigation reserves space below content; the compact header retains the Sample shop label.
- New order exposes seller screenshot import/manual draft and judge sample/manual paths. Manual draft opens the existing editor. Editing a field, changing section and choosing Keep editing retains the field. Discard and continue opens the requested section. Reload/close has a browser warning while edits or screenshot selections are unsaved.
- Seller upload selected two constructed Messenger screenshots in reverse order, reordered them, opened both previews, changed speaker sides and verified that confirmation was cleared, then confirmed the right-side seller and saved. Saved source order and the original previews remained available through the workspace deep link.
- Assistant starter questions populate editable input without sending. The questions cover pending dispatch, available stock and all-time recorded sales/payouts, so the dated sample records are meaningful. Mic/text entry precedes starter cards. The browser's no-microphone result displayed a useful fallback; typing a Bangla question afterward enabled Ask without recording or sending. Code inspection confirmed that transcription remains editable before sending and permission cancellation restores typed input immediately. Live voice and model responses were not exercised in this run.

## API acceptance

Forty-two disposable HTTP assertions passed: independent judge fixtures, judge/judge and seller/judge workspace and source isolation, both cookies coexisting, seller import contract, exact original bytes and SHA-256, no-store originals, reset invalidating only the resetting judge's old evidence, sign-out revocation with a replayed token, separate seller-session preservation, and expired judge-session rejection.

A separate manual-first check confirmed that opening sample screenshots creates or reopens the actual source conversation, preserves the existing manual draft and orders, and returns the same sample on repeated opening. It never silently resets the shop.

## Implementation boundary

`use-workspace-session.ts` owns session and shop-data orchestration. `app-shell.tsx` owns navigation and the compact header. `conversations.tsx` owns ordered upload, source history and previews. `workspace-app.tsx` wires features and guards navigation. `ui.tsx` and `format.ts` supply shared status/empty-state presentation and BDT formatting.

For follow-up workflow work, preserve `onOpenWorkspace(id)` from Orders and `onRecord({ section, kind, key, label })` from Assistant as navigation boundaries. DraftEditor reports unsaved edits through `onDirtyChange(boolean)`; the shell owns the leave/discard decision. Source evidence and mutations continue through the existing API endpoints. Agree any replacement selected-order callback before changing that boundary.

## Synthetic screenshots

- [Desktop landing](images/issue-14/landing-desktop.jpg)
- [Desktop Orders](images/issue-14/orders-desktop.jpg)
- [Phone Orders](images/issue-14/orders-mobile.jpg)
- [Phone Assistant](images/issue-14/assistant-mobile.jpg)
- [Phone landing](images/issue-14/landing-mobile.jpg)
- [Unsaved-work confirmation](images/issue-14/unsaved-mobile.jpg)

`npm run check`, `npm run test` (three COD and four courier checks), and `npm --prefix web run build` passed. No new automated test files were committed, following the repository's UI testing policy.

## Review

The independent Standards review found no actionable violations or baseline smells. The Spec review found one microphone-cancellation issue: an unanswered browser permission request kept typed input disabled after cancellation. The correction separates the outstanding permission request from active voice entry, so cancelling restores typing immediately and a late permission result cannot start recording. A focused Spec re-review confirmed the fix with no remaining actionable findings.

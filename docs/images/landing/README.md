# Landing-page review — issue #22

Local visual and entry checks on November 4, 2026, against the redesigned page, final gallery images and both colour themes. These captures show the welcome pages before sign-in. They do not establish hosted release readiness.

## Screenshots

| View | Capture |
| --- | --- |
| Judge, desktop | [First screen](judge-desktop.jpg) · [Full page](judge-desktop-full.jpg) |
| Judge, phone | [First screen](judge-phone.jpg) |
| Seller, desktop | [First screen](seller-desktop.jpg) |
| Seller, phone | [First screen](seller-phone.jpg) · [Sign-in and footer](seller-phone-entry.jpg) |

Desktop was captured at a 1440 × 1000 viewport and phone at 390 × 844 with a device scale of 2; layout was also checked at 375 × 812. Captures use the light theme from a local `next dev` server in a headless browser, with the Next.js development indicator removed. The reserved scrollbar gutter leaves a thin strip at the right edge of desktop captures.

On desktop, both routes show the seller, concrete outcome, Bangla capability, demo action, synthetic/live/simulated disclosure and a real extracted price with its source quote on the first screen. On a 390 px phone, the first screen shows the seller, outcome, Bangla capability and demo action; the disclosure line sits at the fold and the product captures follow below it. All five gallery scenes and the three proof moments were inspected. [Product assets, provenance and reusable captions](../../../apps/web/public/product/README.md) are the handoff to #23.

## Entry and accessibility checks

- `/` and `/judge` render before sign-in; seller entry remains reachable from the header. Demo entry opened an isolated synthetic shop, and sign-out returned to the welcome page.
- Initial session checking disables judge entry. An incorrect seller passcode returns an actionable error with reconnect instructions beside the submitted form. Busy-state and initial-session-error display were not re-exercised on this page. No session, isolation or API logic was changed.
- The first Tab press focuses the skip link with a 3 px outline. The other controls were not walked by keyboard in this pass.
- All 12 rendered images load and have text alternatives; each product image opens in the in-page viewer. The Pack check tab labels its photos as AI-generated illustrations, not app results.
- No horizontal page overflow or offscreen links, buttons or inputs at 1440, 390 or 375 px on either route, or on `/judge` in dark mode at 1440 and 390 px. The measured table scrolls inside its own container on phones.
- Dark mode was inspected visually. Contrast was not measured with a tool in either theme.

## Validation

`npm run check`, `npm run test` and `npm run build` passed, with mocked providers in the tests. No new tests or dependencies were added for this presentation change.

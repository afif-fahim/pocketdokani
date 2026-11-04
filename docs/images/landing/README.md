# Landing-page review — issue #22

Local visual and entry checks on November 4, 2026. These captures show the welcome pages before sign-in, using reviewed synthetic product evidence. They do not establish hosted release readiness.

## Screenshots

| View | Capture |
| --- | --- |
| Judge, desktop | [First screen](judge-desktop.jpg) · [Full page](judge-desktop-full.jpg) |
| Judge, phone | [First screen](judge-phone.jpg) |
| Seller, desktop | [First screen](seller-desktop.jpg) |
| Seller, phone | [First screen](seller-phone.jpg) · [Sign-in and footer](seller-phone-entry.jpg) |

Desktop was checked at a 1440 × 1000 browser viewport. Phone layouts were checked at 390 × 844 and 375 × 812, including their reserved scrollbar gutter. The capture tool scales its JPEG output; saved image dimensions may differ from the requested browser viewport. The Next.js development indicator belongs to the local preview.

Both routes show the seller, concrete outcome, Bangla capability, demo action and a real extracted price/source quote on the first screen. All three proof moments were inspected, including the unsure parcel result and the Bangla answer with its supporting order chips. [Product assets, provenance and reusable captions](../../../apps/web/public/product/README.md) are the handoff to #23.

## Entry and accessibility checks

- `/` and `/judge` render before sign-in; seller entry remains reachable from the header. Demo entry opened an isolated synthetic shop, and sign-out returned to the welcome page.
- Initial session checking disables judge entry. Busy sign-in disables its controls. An incorrect seller passcode returns an actionable error and reconnect instructions beside the submitted form; initial session errors remain beside the hero action. No session, isolation or API logic was changed.
- Tab exposes the skip link with a visible focus ring. Inputs retain their labels, password autocomplete and required validation. Native links, buttons and forms remain keyboard accessible.
- All six product images have descriptive alternatives and links to full-size originals. Static image imports reserve their intrinsic dimensions. No image-driven jumps were observed.
- Neither phone width produced horizontal page overflow or offscreen links, buttons or inputs. Source-image details are deliberately cropped and labeled; full inputs remain available through their links. App-result text and seller controls remain readable.
- Established green, ink and muted text colors are preserved. Contrast and visible focus were checked against the existing light surfaces.

## Validation

`npm run check`, `npm run test` and `npm run build` passed. The existing test suite contains 3 COD checks and 13 courier/workflow checks. The sandboxed courier run stalled under local socket restrictions; the complete suite passed outside the sandbox with mocked providers. No new tests or dependencies were added for this presentation change.

## Standards

No findings. The scoped diff introduces no documented-standard violations or actionable baseline smells. Synthetic evidence disclosures, glossary terminology, seller confirmation language, and Next.js image usage are consistent with the repository's guidance.

## Spec

No findings. The first screen explains the seller, concrete outcome, Bangla support and demo entry, with an actual source-linked extraction capture. All three proof moments match the documented synthetic walkthrough, including the parcel's unsure result and the Bangla answer's three supporting records. Seller sign-in, simulated-courier disclosure, repository link and reusable asset provenance are present.

The two review agents inspected code and screenshots independently. Runtime and command checks above were performed by the implementing agent. Review baseline: `2d802c582f7be30d1c8d0523ec83256cbf8df3d0`, scoped to the welcome component, landing styles, product assets and these captures; separate #21 work was excluded.

Total findings: Standards 0; Spec 0.

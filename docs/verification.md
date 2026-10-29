# Issue #1 verification — October 29, 2026

These checks used constructed screenshots and temporary local sessions only.
No customer media, live model calls or hosted deployment were involved.

- Python strict typechecking, TypeScript typechecking and the Next.js
  production build passed.
- Local HTTP acceptance checks passed for original byte/hash/order retention,
  stable references and speaker confirmation after reload, independent seller
  and judge sessions, cross-judge/cross-context record and image denial,
  isolated judge reset, and sign-out token revocation.
- Invalid images, mismatched MIME types, unsupported layouts, more than 12
  files, files over 8 MiB and a streamed request over the batch limit were
  refused without adding a workspace. A simulated second-object write failure
  rolled back the batch and returned a sanitised error.
- PostgreSQL 17 migration upgrade/downgrade/upgrade and Alembic schema parity
  passed. Real PostgreSQL checks covered persistence, source reads and two
  competing resets: one succeeded and the stale reset received 409.
- PostgreSQL checks with simulated Supabase inherited client grants confirmed
  RLS on all application tables, removal of anonymous/authenticated table
  privileges, denied anonymous session-table access, and working owner-role
  API access. No hosted Supabase project was used.
- The built browser assets contained none of the configured credential values.
  The staged privacy guard and source-partition validator passed.
- Browser checks at a 390 × 844 viewport covered judge session loading,
  constructed catalogue eligibility, seller sign-in, file selection/reordering,
  side confirmation, saving, reload persistence and the full-original image
  dialog. These were browser viewport checks, not a physical-phone trial.

## Standards review

No documented-standard violations or actionable baseline code smells found.
Two correctness findings were fixed: pending-file keys now work on HTTP LAN
origins, and saved links resolve records outside the latest-100 list through
the authenticated detail endpoint. Focused follow-up: no remaining findings.

## Spec review

Three findings were fixed: the two frontend issues above and inherited Supabase
client-role grants. The migration now enables RLS without client policies and
revokes those grants. Focused follow-up: no remaining findings.

Standards: 0 remaining findings. Spec: 0 remaining findings.

Live hosting, real Supabase storage, host/proxy upload limits and a physical
phone remain to be verified, as agreed. The private shop catalogue is empty
pending seller-reviewed data. No persistent test files or test framework were
added; there is no automated full test suite in this slice.

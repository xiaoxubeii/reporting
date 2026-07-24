# Investment decision E2E results

- Date: 2026-07-24
- Branch: `feature/investment-decision-e2e`
- Worktree: `/home/ubuntu/workspace/reporting.worktrees/investment-decision-e2e`
- Fixture: CardioSignal Series A, isolated fund and identities
- Result: the real Pitch -> Deal -> Research -> Diligence -> expert collaboration -> evidence -> checklist -> score -> memo path completed end to end.

## Browser and data assertions

1. The public pitch form produced one processed inbound record and one extraction. The authenticated Inbound UI showed the expected company, stage, tags, founder, and location.
2. Adding the pitch as a deal created deal `6d13f943-e436-44ae-b80a-84de09134411`. Deal research completed with three source entries. The UI correctly disclosed that web search was off, so these results are pipeline evidence rather than independently verified web research.
3. Rejecting and then moving the deal to diligence exercised the status history and promotion controls. Promotion created exactly one linked diligence record, `2b88914e-04c6-4dc2-b427-1ab6944470d5`, while retaining the source deal and inbound source links.
4. Initial diligence ingestion produced 11 claims and 11 citations. Diligence research completed with six findings from two successful source attempts.
5. Expert validation request `f88e798d-1488-4364-a814-9e19e4f99f23` was invited and answered through the public response form. The answer completed materialization exactly once as private `industry_expert` document `17c339d1-fb10-498d-b292-b5cf606d403e` and one artifact.
6. Re-ingestion processed both documents and produced 21 claims and 21 citations. The expert document contributed 10 claims and 10 citations.
7. Checklist assessment produced 141 checklist items: 1 found, 15 partial, 123 missing, and 2 unknown. Scoring and memo drafting completed; the score narrative and memo both cited the expert evidence that the claimed 91% sensitivity and 87% specificity remain management assertions rather than decision-grade clinical evidence.
8. Memo self-review produced nine must-address items. The UI showed two of five diligence stages complete. This is the expected business result for deliberately incomplete source evidence, not a pipeline failure.

## Environment fallbacks

- The isolated fund's custom AI provider configuration was aligned with an existing working local configuration after the first synthetic submission exposed stale provider settings. No credentials or provider secrets are captured here.
- Expert embedding auto-match was unavailable because no embedding model was configured. The UI exposed the no-match state; the supported manual expert-selection endpoint was used to continue the workflow.
- Outbound email was not configured, so the documented copy-link invitation fallback was used.

## Verification

- Focused expert-validation, materialization, public-route, service, progress, memo, and cron tests: 11 files passed, 118 tests passed.
- Full Vitest suite: 129 files passed, 2 skipped; 1,128 tests passed, 4 skipped.
- TypeScript (`tsc --noEmit`): passed.
- Fixture ESLint: passed.
- Changed-scope secret scan and `git diff --check`: passed.
- Real authenticated browser acceptance: passed for public pitch, inbound conversion, Deal research/status/promotion, Diligence ingestion/research, expert invitation/public response/materialization, checklist, scoring, and memo.
- Browser evidence archive: sanitized data assertions are retained in this report, but screenshots, console logs, and failed-network traces were not preserved as commit-safe artifacts; the HarnessKit screenshot/console evidence requirement therefore remains open.
- Repository-wide lint and production build: code compilation succeeded, then the Next.js build failed on the repository's existing ESLint baseline (`no-explicit-any` and unused-variable errors across unrelated files). This branch changes no affected product files.
- `npm audit --omit=dev`: reports 19 existing production dependency findings (15 high, 4 moderate), including Next.js and transitive packages. This branch changes neither `package.json` nor the lockfile; remediation requires a separate dependency-upgrade/security lane.

## Conclusion

The system-level investment workflow is operational and preserves provenance from the original pitch through the final memo. The fixture is intentionally not investment-ready: the product correctly carries unresolved clinical, regulatory, commercial, and team evidence gaps forward instead of treating pipeline completion as diligence completion.

# Memo Research Reporting Search browser verification

- Date: 2026-07-28 UTC
- Entry point: authenticated tenant Diligence detail page, Research tab
- Fixture: isolated synthetic Fund, user, deal, and ingested Memo draft
- Provider: the Fund's configured real OpenAI-compatible external model
- Execution path: Research button -> generalized `memo_research` job -> dispatcher -> attempt-authenticated worker -> Reporting Search tool -> persisted Memo Research output -> browser diagnostics

## Observed terminal state

- The generalized job and compatibility Memo job both reached success without a manual dispatcher call.
- The model made three `reporting_search` tool calls; all three internal Search requests returned HTTP 200.
- The final output recorded `search_backend: reporting`, `research_mode: with_web_search`, and nine accepted sources.
- Accepted source hosts contained no `linkedin.com` or `lnkd.in`; the public query normalized the verified company hostname without a leading `www.`.
- The model did not return any accepted source IDs in its final findings. The server therefore persisted zero grounded findings rather than treating model memory or URLs as verification.
- The rendered page showed: `External Search`, `Backend: Reporting Search`, `Searches performed: 3`, `Sources collected: 9`, and `Grounded findings: 0/6`.
- No relevant browser page error, console error, or failed feature request was observed at terminal state.

## Evidence and cleanup

- Final screenshot: `screenshot-1785224781397.png`
- Earlier stage screenshot: `research-stage.png`
- The synthetic Fund, user, deal, Memo/background jobs, persisted state, and temporary local credential link were deleted after capture and verified absent.

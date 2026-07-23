# Browser Verification Policy

Use this file before UI, browser-visible, auth, workflow, or frontend/backend boundary changes.

## Required Browser Flow

- Run the real app from the external user entrypoint.
- Exercise the real controls, routes, forms, and async flows involved in the change.
- Inspect console errors, page errors, failed network requests, async runtime events, and final UI state.
- Capture screenshot or trace evidence when visual state matters.

## Failure Protocol

A browser failure is a diagnostic entrypoint, not a stopping point.

Classify the failure:

- selector/test fragility
- timing or async state bug
- frontend state/rendering bug
- frontend/backend contract failure
- auth/session/user context handling bug
- network, API, streaming, or backend contract failure
- backend schema, data, permission, or persistence bug
- real product behavior bug

Run a narrowed reproduction and capture:

- entrypoint URL and account or fixture used
- exact user flow tested
- console and page errors
- failed requests and response status
- final UI state and screenshot or trace path

## Completion Gate

Browser-visible work is not complete until the real browser flow is verified or the final report explicitly says browser not run and why.

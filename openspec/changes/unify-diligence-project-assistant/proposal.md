## Why

The diligence detail page has a separate, visually thin Q&A surface while the application already has a persistent right-side Assistant. Users need one consistent assistant that automatically understands the current diligence project without weakening the Assistant on other pages or losing earlier project conversations.

## What Changes

- Bind the global right-side Assistant to the current diligence project on detail, memo draft, and legacy Q&A pages.
- Remove the embedded project Q&A from the main diligence detail and retain old Q&A history as a read-only migration view.
- Store new project conversations as private, user-owned threads with evidence citations and exact project scope.
- Answer project questions from the existing diligence evidence path while independently enforcing diligence, relationships, and write permissions.
- Archive eligible Assistant answers as clearly marked, unverified derived evidence that is excluded from memo/scoring until a user explicitly includes it.
- Harden direct database access, Markdown rendering, conversation restoration, evidence provenance, and concurrent evidence writes.

## Capabilities

### New Capabilities

- `diligence-project-assistant`: Page-scoped project conversations, cited answers, private history, read-only legacy history, and safe derived-evidence handling in the global Assistant.

### Modified Capabilities

None.

## Impact

- Assistant context, panel UI, conversation APIs, diligence Q&A answering, memo-agent Q&A persistence, and diligence project pages.
- Supabase migrations for private history, server-only evidence access, and row-locked JSONB evidence updates.
- Localized Assistant copy and focused route, UI, permission, provenance, and concurrency tests.

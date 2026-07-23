## Why

The settings UI exposes an OpenRouter-specific provider even though the backend already uses an OpenAI-compatible client and accepts a configurable base URL. Funds need that capability presented and validated as a generic provider so services such as MiniMax and codex-lb can be configured without provider-specific code branches.

## What Changes

- Replace the OpenRouter-only settings language with a generic **Custom (OpenAI-compatible)** provider.
- Let an administrator configure its API key, base URL, exact model identifier, and optional JSON request parameters.
- Keep the existing encrypted OpenRouter-named secret fields and provider key as an internal compatibility detail, and add one generic JSONB request-parameters column rather than provider-specific flags.
- Route the custom provider and its validated request parameters through the existing `OpenAIProvider` chat-completions implementation and existing default-provider selection.
- Validate that base URL and model are present before the custom provider can be selected as default.

## Capabilities

### New Capabilities

- `custom-ai-provider`: Configure one fund-level OpenAI-compatible endpoint and use it as the default AI provider across the existing reporting pipelines.

### Modified Capabilities

None.

## Impact

- Settings response and update validation in `app/api/settings/route.ts`.
- Provider configuration/factory behavior in `lib/ai` and `lib/pipeline/processEmail.ts`.
- AI Provider settings UI in `app/(app)/settings/page.tsx` and provider labels in memo-agent settings.
- Focused contract tests and real browser verification of the settings flow.
- One additive JSONB column; no new dependency, database table, or secret storage mechanism.

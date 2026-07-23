## Context

The application already has one OpenAI-compatible hosted-provider path under the internal key and database column prefix `openrouter`. The UI and defaults present it as OpenRouter, while the API accepts an arbitrary safe HTTP(S) base URL and the provider factory passes that URL to the OpenAI SDK. This creates a naming gap rather than a need for a new inference pipeline.

The worktree contains unrelated user changes, so this change must stay within the provider settings/factory surface and focused tests.

## Goals / Non-Goals

**Goals:**

- Make one arbitrary OpenAI-compatible endpoint a first-class, understandable settings option, including optional provider-defined request parameters.
- Support OpenRouter, MiniMax, codex-lb, and similar chat-completions endpoints through the same factory used by existing reporting features.
- Require an explicit base URL and model identifier, encrypt the API key with the existing envelope-encryption path, and retain current SSRF validation.
- Preserve existing OpenRouter configuration and default-provider values.

**Non-Goals:**

- Multiple custom endpoints per fund.
- A provider plugin registry, dynamic capabilities, or provider-specific adapters.
- Automatic model discovery or normalization of provider-specific model names.
- Supporting non-OpenAI-compatible protocols such as Anthropic Messages behind the custom entry.
- Renaming existing database columns or stored `openrouter` provider values.

## Decisions

### Present a generic provider while retaining the internal compatibility key

The Settings UI will label the existing `openrouter` slot as **Custom (OpenAI-compatible)** and explain the required `/chat/completions` compatibility. The default-provider value, usage labels, and encrypted storage fields remain `openrouter` internally.

This avoids renaming or duplicating existing configuration and keeps all existing jobs, saved memo-agent defaults, usage records, and fund settings valid. Adding a new `custom` key with duplicate columns was rejected because it would create two code paths for the same protocol. One additive JSONB column stores generic request extensions without changing the compatibility key.

### Keep configuration explicit and single-instance

Administrators enter API key, base URL, model, and optionally a bounded JSON object of request parameters. Testing sends a minimal chat-completions request with the exact model and parameters instead of requesting a model list, because lightweight gateways do not necessarily expose `/models`.

The UI will not include provider presets or provider-specific behavior. Parameters such as `thinking` remain administrator-supplied data rather than model or hostname heuristics.

### Keep provider extensions generic and subordinate to Reporting's request contract

Optional request parameters are stored in one additive `openrouter_request_parameters` JSONB column, retaining the existing internal compatibility prefix. The value defaults to an empty object and is not required for provider completeness. They are configuration rather than secret storage: the UI forbids secrets, the API recursively rejects credential-like keys, and only fund administrators receive the saved object from Settings.

The API accepts only a bounded JSON object, rejects system-controlled root keys, and recursively rejects credential-like keys. `OpenAIProvider` merges validated parameters first and writes Reporting's core request fields afterward as a second safety boundary. This supports extensions such as `{"thinking":{"type":"disabled"}}` without a MiniMax-specific branch and without allowing an administrator to change the prompt, model, streaming contract, tool behavior, credentials, or token limit supplied by the calling feature.

### Reuse current security and execution boundaries

The API key continues through the existing envelope-encryption implementation and is never returned to the browser. Custom Base URLs use a hosted-provider validator that rejects embedded credentials, local/private/link-local destinations, and hostnames resolving to non-public addresses; requests reject redirects. The provider factory instantiates `OpenAIProvider(apiKey, baseUrl, { requestParameters, rejectRedirects: true })`.

The custom option is considered configured only when a key, base URL, and model are present. This prevents selecting a default that would silently fall back to an OpenRouter URL or model.

## Risks / Trade-offs

- [Some providers implement only part of the OpenAI API] → Require only the existing chat-completions behavior; do not call `/models` as part of normal configuration.
- [A compatible endpoint may use proprietary request fields] → Accept one bounded JSON object and pass it through without interpreting provider-specific keys.
- [Custom parameters could override core behavior, persist plaintext credentials, or create oversized payloads] → Reject protected root keys and credential-like keys at any depth, enforce input-size and nesting boundaries, and merge Reporting-controlled fields last.
- [Internal names still say OpenRouter] → Keep them deliberately documented as compatibility details and expose only generic language in the user-facing configuration.
- [Endpoint URL can be an SSRF surface] → Retain server-side URL validation before persistence and again before provider construction.

## Migration Plan

Add one JSONB column with an empty-object default. Existing OpenRouter settings continue to work unchanged because absent parameters resolve to `{}`. Rollback removes the UI/API pass-through while the inert JSONB value can remain without affecting requests.

## Open Questions

None for V1.

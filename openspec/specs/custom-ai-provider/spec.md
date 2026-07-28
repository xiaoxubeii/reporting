# custom-ai-provider Specification

## Purpose
TBD - created by archiving change add-custom-ai-provider. Update Purpose after archive.
## Requirements
### Requirement: Configure one OpenAI-compatible provider
The system SHALL allow a fund administrator to configure one custom OpenAI-compatible provider with an API key, HTTP(S) base URL, and exact model identifier.

#### Scenario: Save a complete custom provider
- **WHEN** an administrator submits a non-empty API key, valid base URL, and non-empty model identifier
- **THEN** the system stores the key using the existing encrypted secret path and stores the base URL and model for that fund

#### Scenario: Preserve an existing secret
- **WHEN** an administrator edits the base URL or model while leaving the masked API-key input blank
- **THEN** the system keeps the previously encrypted API key

#### Scenario: Reject an unsafe endpoint
- **WHEN** an administrator submits a disallowed protocol, cloud metadata address, or blocked private-network address
- **THEN** the system rejects the configuration without persisting the invalid base URL

### Requirement: Select only a complete custom provider
The system MUST treat the custom provider as configured only when its API key, base URL, and model are all present.

#### Scenario: Complete provider can be selected
- **WHEN** all three custom provider fields are configured
- **THEN** the Settings default-provider control enables the custom provider option

#### Scenario: Incomplete provider cannot be selected
- **WHEN** any required custom provider field is missing
- **THEN** the Settings default-provider control disables the custom provider option and the API rejects attempts to make it default

### Requirement: Use the existing reporting inference path
The system SHALL execute custom-provider requests through the existing OpenAI-compatible chat-completions implementation used by Reporting pipelines.

#### Scenario: Reporting uses the custom default
- **WHEN** the custom provider is the fund default and an existing Reporting feature creates an AI provider
- **THEN** the provider factory uses the configured API key, base URL, and exact model identifier without a provider-specific branch

### Requirement: Configure optional request parameters
The system SHALL allow a fund administrator to configure one optional JSON object whose values are merged into Custom Provider chat-completions requests without provider-specific hard-coding.

#### Scenario: Send a provider extension parameter
- **WHEN** an administrator saves `{"thinking":{"type":"disabled"}}` as the custom request parameters
- **THEN** subsequent Custom Provider chat-completions requests include that object in the request body

#### Scenario: Preserve system-controlled request fields
- **WHEN** custom request parameters contain `model`, `messages`, `max_tokens`, or `stream`
- **THEN** the system rejects the configuration and does not allow those fields to override Reporting's request contract

#### Scenario: Reject malformed custom parameters
- **WHEN** custom request parameters are not a bounded JSON object
- **THEN** the system rejects the configuration with a user-facing validation error

#### Scenario: Omit custom parameters
- **WHEN** no custom request parameters are configured
- **THEN** Custom Provider requests retain the existing request body and behavior

### Requirement: Test and update the custom provider key
The Settings UI SHALL let an administrator test and update the custom-provider API key while retaining explicit Base URL, Model, and optional Custom parameters fields.

#### Scenario: Administrator tests a custom provider key
- **WHEN** an administrator enters an API key with a Base URL, Model, and valid Custom parameters and clicks Test
- **THEN** the system sends a minimal chat-completions request to that endpoint using that exact model and those parameters and reports whether it succeeded

#### Scenario: Administrator updates a custom provider
- **WHEN** an administrator enters a new API key with a Base URL and Model and clicks Update
- **THEN** the system saves the complete configuration through the existing encrypted settings path

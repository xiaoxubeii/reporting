## ADDED Requirements

### Requirement: Tool-loop contract is available on verified providers
Anthropic and OpenAI-compatible providers SHALL implement the shared `createToolLoop` contract with model messages, function definitions, server-side execution, tool-result messages, a final assistant response, usage, and an ordered tool-call audit.

#### Scenario: Anthropic function tool call
- **WHEN** Anthropic returns one or more client tool-use blocks
- **THEN** the provider SHALL execute the registered tools, append matching tool results, and continue until final text or a bounded terminal error

#### Scenario: OpenAI-compatible function tool call
- **WHEN** OpenAI/OpenRouter/custom returns assistant `tool_calls`
- **THEN** the provider SHALL append the complete assistant tool-call message, execute each registered function deterministically, append matching `role = tool` messages, and continue to a final response

#### Scenario: Multiple tool calls in one round
- **WHEN** a provider requests multiple tools in one assistant turn
- **THEN** all allowed calls SHALL be recorded and resolved with matching provider call ids before the next model round

### Requirement: Provider tool input and errors are contained
The provider loop SHALL reject unknown tools, malformed arguments, non-object inputs, and executor failures without allowing model-supplied identity or transport authority.

#### Scenario: Unknown tool name
- **WHEN** the model requests a tool not present in the supplied definitions
- **THEN** the loop SHALL return a bounded error tool result or terminal failure and SHALL not call arbitrary code

#### Scenario: Executor throws
- **WHEN** a registered executor throws or returns an error
- **THEN** the loop SHALL record an error without exposing credentials or stack traces to the model

### Requirement: Iterations, deadlines, and usage are deterministic
The provider loop SHALL enforce a positive maximum iteration count, honor the caller's abort signal/deadline, aggregate token usage across every model round, and require a final assistant response.

#### Scenario: Successful multi-round loop
- **WHEN** several model rounds and tools complete before the limit
- **THEN** returned usage SHALL equal the sum of all reported round usage and tool calls SHALL retain execution order

#### Scenario: Maximum iteration reached on a tool call
- **WHEN** the final allowed model round still requests a tool
- **THEN** the loop SHALL terminate with an explicit exhaustion error rather than returning empty or partial text

#### Scenario: Caller aborts
- **WHEN** the shared AbortSignal is triggered
- **THEN** the provider request and remaining tool execution SHALL stop and surface an abort/timeout failure

### Requirement: Unsupported provider endpoints fail closed for grounded Research
Deal Research SHALL require a verified tool-loop provider and SHALL not fall back to a plain model response when tool calling is unavailable or rejected.

#### Scenario: Provider object lacks tool-loop capability
- **WHEN** the configured Deal Research provider does not implement `createToolLoop`
- **THEN** the job SHALL finish with an explicit unsupported-provider result and SHALL not call `createMessage` as a fallback

#### Scenario: Custom endpoint rejects tools
- **WHEN** an OpenAI-compatible endpoint rejects the tool request or returns an incompatible tool-call protocol
- **THEN** the job SHALL record a bounded actionable provider error and SHALL not present model-memory output as external Research

### Requirement: Existing non-tool provider behavior remains compatible
Adding OpenAI-compatible tool loops SHALL not change the existing `createMessage`, `createChat`, custom request-parameter filtering, redirect rejection, or model-list contracts.

#### Scenario: Existing plain completion call
- **WHEN** a feature invokes `createMessage` or `createChat` without tool-loop use
- **THEN** the provider SHALL preserve the existing request and response behavior

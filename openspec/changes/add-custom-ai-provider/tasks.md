## 1. Contract and validation

- [x] 1.1 Add focused tests for generic provider labels, completeness, and default-provider validation
- [x] 1.2 Add a shared custom-provider completeness helper without changing stored compatibility keys

## 2. Backend execution path

- [x] 2.1 Return the complete custom-provider state from Settings without exposing the API key
- [x] 2.2 Enforce complete custom-provider configuration when saving or selecting it as default
- [x] 2.3 Verify the existing provider factory uses the saved base URL and exact model

## 3. Settings experience

- [x] 3.1 Replace OpenRouter-only labels with Custom (OpenAI-compatible) across settings surfaces
- [x] 3.2 Explain chat-completions compatibility using generic provider language
- [x] 3.3 Disable default selection until API key, base URL, and model are complete and surface save errors
- [x] 3.4 Add Custom API key Test/Update controls and remove provider-specific helper copy

## 4. Verification

- [x] 4.1 Run focused tests, typecheck, and HarnessKit fast/targeted verification
- [x] 4.2 Run the authenticated Settings browser flow and inspect UI, network, and console results
- [x] 4.3 Review the final diff for scope, security, and backward compatibility
- [x] 4.4 Verify the custom-provider test route, Settings UI, and updated copy

## 5. Generic request parameters

- [x] 5.1 Add failing tests for bounded JSON parsing, protected keys, provider request merging, factory propagation, and the Test route
- [x] 5.2 Add one JSONB compatibility column and generated database types for Custom Provider request parameters
- [x] 5.3 Validate, return, and persist generic Custom Provider request parameters through Settings
- [x] 5.4 Pass validated parameters through the provider factory and merge them safely into both OpenAI-compatible request methods
- [x] 5.5 Add a Custom parameters JSON editor and send the same parameters through Test and Update
- [x] 5.6 Run focused tests, typecheck, OpenSpec/HarnessKit verification, live MiniMax inference, browser verification, and final security review

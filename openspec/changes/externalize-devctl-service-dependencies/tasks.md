## 1. Contract and Regression Tests

- [x] 1.1 Update focused CLI and manager tests so only Web/Cron are selectable and default lifecycle actions never invoke Miniflux/SearXNG Compose commands.
- [x] 1.2 Add probe/status tests for configured, unconfigured, invalid, healthy, and unreachable external Miniflux, SearXNG, and Supabase dependencies.
- [x] 1.3 Add legacy-state coverage proving old Miniflux/SearXNG records are dropped without stopping containers or deleting volumes.

## 2. External Dependency Implementation

- [x] 2.1 Restrict managed adapters, CLI service names, port mappings, lifecycle state, and logs to Web and Cron.
- [x] 2.2 Implement bounded side-effect-free external dependency probes and status formatting for Miniflux, SearXNG, and Supabase.
- [x] 2.3 Stop overriding Miniflux/SearXNG endpoints, token files, ports, and secrets in Web/Cron child environments.
- [x] 2.4 Update local-development documentation and HarnessKit feature state to describe the external ownership boundary.

## 3. Verification and Runtime Migration

- [x] 3.1 Pass focused devctl tests, changed-scope lint/type checks, strict OpenSpec validation, HarnessKit fast, and diff hygiene.
- [x] 3.2 Restart the real devctl Web/Cron runtime and prove status uses external 8085/8086 while creating or stopping no external container.
- [x] 3.3 Complete correctness and security review, resolve findings, and record remaining operator cleanup for legacy duplicate containers.

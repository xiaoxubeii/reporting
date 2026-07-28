## ADDED Requirements

### Requirement: Fund guidance is isolated by memo-agent stage
The system SHALL store partner-authored memo-agent guidance by fund and stage and SHALL inject only the guidance whose stage matches the active agent run.

#### Scenario: Research run uses research guidance
- **WHEN** a research-stage system prompt is built for a fund with different ingest and research guidance
- **THEN** the prompt contains the research guidance and does not contain the ingest guidance

#### Scenario: Empty stage guidance uses shipped behavior
- **WHEN** the active stage has no non-empty fund guidance
- **THEN** the prompt omits the partner-authored stage-guidance block

### Requirement: Stage guidance has one fund-level source of truth
The system SHALL use `memo_agent_prompts`, keyed by fund and stage, as the only partner-editable guidance source for memo-agent system prompts.

#### Scenario: Deal has no project-wide prompt preferences
- **WHEN** a diligence deal is read, updated, or used to build a system prompt
- **THEN** the system neither persists nor injects project-level analysis preferences

#### Scenario: Guidance edit applies at fund scope
- **WHEN** a fund member saves guidance for one stage
- **THEN** subsequent runs of that stage for deals in the same fund use the saved guidance

### Requirement: Guidance editing follows the configured stage
The diligence interface SHALL present guidance editing in a stage-aware agent-workflow or schema context and SHALL clearly identify that the guidance applies to all deals in the fund.

#### Scenario: User edits current stage guidance
- **WHEN** a user opens the guidance control associated with a stage
- **THEN** the editor loads and saves the `memo_agent_prompts` value for that exact stage

#### Scenario: Project-wide analysis preferences are absent
- **WHEN** a user views a diligence project header
- **THEN** no project-wide analysis-preferences button or sheet is displayed

### Requirement: Existing project analysis-preference data is removed
The system SHALL remove the `diligence_deals.analysis_preferences` column without converting its values into stage guidance.

#### Scenario: Forward migration is applied
- **WHEN** the restoration migration runs on a database containing `analysis_preferences`
- **THEN** the column and its stored values are removed while `memo_agent_prompts` remains unchanged

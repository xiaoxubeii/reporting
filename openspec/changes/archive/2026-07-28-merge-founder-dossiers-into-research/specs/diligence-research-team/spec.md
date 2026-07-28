## ADDED Requirements

### Requirement: Founder dossiers live in the Research workspace
The diligence workspace SHALL present founder and core-team dossiers as a section of Research and SHALL NOT expose a separate top-level Founders tab.

#### Scenario: Partner reviews research navigation
- **WHEN** an authorized partner opens a diligence project
- **THEN** the top-level navigation omits Founders and the Research page contains a localized Founders & Core Team section after Competitive Landscape

### Requirement: Team section remains compact and contextual
The Research workspace SHALL summarize founder dossiers compactly and SHALL expose full editing in a contextual side sheet rather than expanding full forms inline.

#### Scenario: Existing founder dossier is reviewed
- **WHEN** the Research output contains one or more founder dossiers
- **THEN** each dossier is represented by a concise summary with its role, background preview, source count, and open-question count
- **AND** selecting a dossier opens an editable side sheet without navigating away from Research

#### Scenario: Research has no founder dossiers
- **WHEN** a Research output exists but contains no founder dossiers
- **THEN** the section shows a compact localized empty state and an authorized editor can add a dossier

### Requirement: Pre-research state prevents ineffective edits
The team section MUST NOT expose an add action that cannot persist before a Research output exists.

#### Scenario: Research has not run
- **WHEN** a draft exists without a `research_output`
- **THEN** the section explains that Research must run before team dossiers can be generated or edited
- **AND** no active add action is shown

### Requirement: Founder edits use the existing Research persistence contract
The workspace SHALL persist add, edit, and remove operations through the existing authorized draft `research_output.founder_dossiers` patch contract.

#### Scenario: Partner edits a founder dossier
- **WHEN** an authorized editor saves changes in the founder side sheet
- **THEN** the updated dossier array is patched into the current draft Research output
- **AND** the Research view reflects the server response without a separate draft fetch or state owner

### Requirement: Research reruns preserve existing founder dossiers
The Research stage SHALL merge generated founder dossiers with existing stored dossiers instead of replacing existing entries silently.

#### Scenario: Generated founder matches an existing dossier
- **WHEN** a Research rerun generates a founder whose normalized name matches an existing dossier
- **THEN** existing editable values and order are preserved
- **AND** newly generated unique sources are appended

#### Scenario: Research discovers a new founder
- **WHEN** a Research rerun generates a founder not represented in existing dossiers
- **THEN** the new founder is appended after preserved existing dossiers

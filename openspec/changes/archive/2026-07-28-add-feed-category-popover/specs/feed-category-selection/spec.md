## ADDED Requirements

### Requirement: Follow opens contextual category selection
The personal Follow sources interface SHALL open an anchored category menu from each available Follow action instead of reserving a permanent category input on the page.

#### Scenario: Open category menu
- **WHEN** a user activates Follow for an unfollowed source
- **THEN** the system displays a menu anchored to that source action with Uncategorized, existing categories, and New category choices

#### Scenario: Dismiss without following
- **WHEN** a user presses Escape or interacts outside an open category menu before choosing a category
- **THEN** the system closes the menu without creating a subscription or category

### Requirement: Existing category selection follows immediately
The category menu SHALL follow the selected source into Uncategorized or the chosen existing Miniflux category without an additional confirmation step.

#### Scenario: Follow as uncategorized
- **WHEN** a user chooses Uncategorized
- **THEN** the system submits the selected source with no category and closes the menu after success

#### Scenario: Follow into an existing category
- **WHEN** a user chooses an existing category
- **THEN** the system submits the selected source with that category and refreshes the source catalog after success

### Requirement: New category is created inline with the follow
The category menu SHALL let a user enter a bounded new category name and explicitly confirm creation as part of the source-follow mutation.

#### Scenario: Create category and follow
- **WHEN** a user enters a non-blank new category name and confirms
- **THEN** the system follows the selected source using the existing subscription endpoint and Miniflux category creation or reuse behavior

#### Scenario: Blank category cannot be submitted
- **WHEN** the inline category name is blank after trimming
- **THEN** the confirmation action remains unavailable and no request is sent

### Requirement: Category selection exposes safe progress and recovery
The menu SHALL prevent duplicate follow mutations, keep a failed mutation error visible in context, and remain usable on supported desktop and mobile viewports.

#### Scenario: Follow is pending
- **WHEN** a category follow mutation is in progress
- **THEN** the trigger and menu choices prevent a second mutation and expose a localized pending state

#### Scenario: Follow fails
- **WHEN** the follow mutation returns an error
- **THEN** the menu remains open, displays the localized error, and allows the user to retry or dismiss it

#### Scenario: Narrow viewport
- **WHEN** the category menu opens on a narrow mobile viewport
- **THEN** it remains within the visible viewport and its category list is scrollable when necessary

### Requirement: Category choices include all existing Miniflux categories
The source catalog SHALL expose all existing Miniflux category identities for follow selection while preserving non-empty topic cards for source browsing.

#### Scenario: Empty existing category is selectable
- **WHEN** Miniflux returns a category with zero feeds
- **THEN** the source catalog includes it in category choices but excludes it from the non-empty topic-card collection

### Requirement: Category selection matches the application control system
The category menu SHALL retain the reference folder-picker composition while using the same semantic theme colors, compact control scale, typography, icon sizing, radius, and elevation as adjacent Reporting controls, with responsive collision handling and accessible names.

#### Scenario: Open the theme-aware category picker
- **WHEN** a user activates the Follow action in either light or dark mode
- **THEN** the system focuses the top category filter and displays Uncategorized plus matching existing categories as compact folder rows above the New Folder action using the active application theme

#### Scenario: Start a new folder from the picker
- **WHEN** a user activates New Folder
- **THEN** the same top field accepts the bounded new category name and the footer exposes explicit cancel and create-and-follow actions

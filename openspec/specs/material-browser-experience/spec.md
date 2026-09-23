# material-browser-experience Specification

## Purpose
Defines the authenticated browser experience for safely discovering, viewing, downloading, filtering, and uploading class-scoped teaching materials while preserving server-side authorization as the security boundary.

## Requirements

### Requirement: Browser restores trusted identity and renders role-appropriate actions
The authenticated materials page SHALL load the current identity from `GET /api/me`, redirect to login on HTTP 401, show upload controls only to teachers, and offer logout. Hiding a control SHALL NOT replace server authorization.

#### Scenario: Teacher sees upload workflow
- **WHEN** an authenticated teacher opens the materials page
- **THEN** the page shows the trusted role/class identity, upload controls, material browsing controls, retrieval, download, and logout

#### Scenario: Student does not see upload workflow
- **WHEN** an authenticated student opens the materials page
- **THEN** the page shows same-class browsing, detail, download, and retrieval but does not render the upload control

#### Scenario: Logout returns browser to login
- **WHEN** an authenticated user activates logout
- **THEN** the browser calls the logout operation, clears displayed protected state, and navigates to the login page

### Requirement: Materials can be safely browsed and inspected
The page SHALL present database-backed same-class materials in responsive list and grid modes, provide local filtering over the loaded same-class set, and open an allowed material detail view. Markdown display MUST NOT execute embedded scripts or unsafe HTML.

#### Scenario: User switches list and grid views
- **WHEN** an authenticated user selects list or grid view
- **THEN** the same authorized materials remain visible in the selected responsive layout without changing authorization scope

#### Scenario: Local filtering stays inside loaded class data
- **WHEN** a user filters materials by filename or type
- **THEN** only the already authorized same-class material collection is filtered and no cross-class request parameter is introduced

#### Scenario: Markdown script is not executed
- **WHEN** an allowed Markdown material contains embedded script or unsafe HTML
- **THEN** the detail presentation escapes or sanitizes it and no script executes

#### Scenario: Material source can be downloaded
- **WHEN** a user activates download for an allowed material
- **THEN** the browser uses the authenticated file operation and receives the source file

### Requirement: Browser provides course-aligned interaction feedback
The materials page SHALL support light/dark theme switching, a keyboard command palette opened by Command/Ctrl+K, visible upload progress for teachers, and toast or inline feedback for success and 401/403/404/validation failures.

#### Scenario: Theme can be changed
- **WHEN** a user switches theme
- **THEN** the page updates between readable light and dark presentations and preserves the preference locally without treating it as identity or authorization data

#### Scenario: Command palette opens from keyboard
- **WHEN** the focused page receives Command+K or Ctrl+K
- **THEN** a command palette opens with available navigation and role-appropriate actions

#### Scenario: Upload shows progress and completion feedback
- **WHEN** a teacher uploads a valid material
- **THEN** the page displays transfer progress and then reports success and refreshes the same-class material list

#### Scenario: Protected failure is presented without leakage
- **WHEN** a browser operation receives 401, 403, 404, or validation failure
- **THEN** the page redirects or displays a bounded user-facing message without exposing SQL, storage paths, secrets, or cross-class metadata

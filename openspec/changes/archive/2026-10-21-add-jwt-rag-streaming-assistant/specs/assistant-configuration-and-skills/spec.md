# Spec Delta

## Purpose

Defines class-scoped teacher control over the assistant role prompt and guided-solving skill, ensuring students can use the resulting behavior but cannot modify instructional configuration.

## ADDED Requirements

### Requirement: Each class has a saved assistant prompt
The system SHALL maintain a class-scoped assistant system prompt. Authenticated teachers may read and update their own class prompt; students may use but SHALL NOT modify it. A successful update SHALL affect subsequent answers rather than already persisted messages.

#### Scenario: Teacher updates own class prompt
- **WHEN** a class-A teacher saves a bounded valid prompt
- **THEN** the class-A configuration is updated and the next class-A answer uses the new prompt

#### Scenario: Student prompt update is forbidden
- **WHEN** a student calls the prompt update operation directly
- **THEN** the server returns HTTP 403 and no prompt changes

#### Scenario: Cross-class prompt override is ignored
- **WHEN** a class-A teacher supplies class B in the update request
- **THEN** only class A's prompt is read or modified

### Requirement: Teacher controls guided-solving skill state
The system SHALL provide one class-scoped `guided-solving` skill that teachers may enable or disable. Students may observe the effective state needed for UI explanation but SHALL NOT change it.

#### Scenario: Teacher enables guided solving
- **WHEN** a teacher enables the skill
- **THEN** subsequent class answers receive server instructions to provide reasoning guidance and cited hints without directly giving the final answer

#### Scenario: Disabled skill changes answer instructions
- **WHEN** the teacher disables guided solving
- **THEN** subsequent answers omit the guided-solving instruction while retaining prompt, class retrieval, grounding, and citations

#### Scenario: Student skill update is forbidden
- **WHEN** a student calls the skill update operation
- **THEN** the server returns HTTP 403 and the class skill state is unchanged

### Requirement: Prompt skill and retrieval participate in one answer
Every generated assistant answer SHALL use the saved class prompt, current guided-solving state, and authenticated class retrieval result in one server-composed instruction set.

#### Scenario: Provider request includes all three inputs
- **WHEN** a grounded answer with evidence is generated
- **THEN** the provider request can be verified to include the saved class prompt, the current skill instruction or disabled state, and numbered same-class evidence

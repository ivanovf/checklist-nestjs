# Specification Quality Checklist: Wrongly Typed Fields Are Refused, Not Server Errors

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-02
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- HTTP statuses (400, 500), `null`, and route paths appear because the product here is an API
  contract; this matches the house style of specs 006–011. No framework, library or code
  structure is named.
- The Background states the cause in plain terms (the converted value is checked, the sent
  value is stored) because it explains why the defect spans every route. How to fix it is left
  to the plan.
- Both clarifications were resolved on 2026-10-02: wrongly typed values are refused even when
  convertible (FR-004), and `null` for a required field on a change is refused (FR-007).
- Evidence: two probe runs on 2026-10-02 against the e2e test app, covering every route with a
  body on create and change. Reservation creates with a wrongly typed text field were masked by
  the availability check in the first run and are covered by the change cases.

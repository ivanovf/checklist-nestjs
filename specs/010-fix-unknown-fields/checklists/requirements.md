# Specification Quality Checklist: Refuse Unknown Fields in Requests

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-01
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

- Both clarifications were resolved on 2026-10-01 (see the spec's Clarifications): D15 is fixed
  here, so `lockUser` is stored and `userLock` refused (US3, FR-010, FR-011), and unknown list
  query parameters keep being ignored (FR-007, SC-006).
- Field names (`_id`, `createdAt`, `userLock`) and status codes appear because they are the
  API's observable contract, the same convention specs 006–008 use. They are not
  implementation choices.
- Behaviour in Background was observed by running every create and change operation against
  the e2e app on 2026-10-01, not read from the source.

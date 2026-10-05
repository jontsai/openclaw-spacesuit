# Operator semantics v1

## Goal

Give the human a strategy desk: explain what matters, what needs intervention,
and when usable capacity can advance ready, valuable work. Do not optimize for
token consumption or confuse a recommendation with permission to execute.

## This change

- Document a versioned semantic layer and ownership of facts, judgments and actions.
- Add a pure, read-only Eisenhower classifier for explicitly accepted judgments.
- Preserve unknown, stale, suggested and conflicting information as unassessed.
- Use synthetic fixtures; no provider calls, credentials, scheduler or UI changes.

## Acceptance

- All four importance/urgency combinations have stable machine-readable codes.
- Missing, expired, future-dated or proposal-only assessments never become facts.
- Scope and outcome identity are checked before combining judgments.
- Expiry is enforced at the boundary; no priority is inferred from token usage.
- Results carry evidence and policy identity; no result authorizes delegation.
- Full repository suites pass; existing project/flavor contracts are unchanged.

## Follow-up, not implemented here

Read-only live tracker transport, knowledge retrieval, priority-assessment editing,
capacity forecasting, banked-reset provider semantics, dashboard strategy views,
and execution controls require their own reviewed slices. Keep unknown provider
reset rules unknown until authoritative evidence is available.

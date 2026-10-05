# Operator strategy and the semantic layer

Status: architecture plus a tested, pure priority evaluator. No strategy UI,
capacity adviser, live tracker transport, memory search or automatic execution is
installed by this change.

## Product objective

Think endurance-race strategy desk: show the human what matters, the available
levers, the evidence behind a recommendation, and the consequences of using a lever.
The objective is valuable outcomes and protected human attention, not maximum
tokens, agents, concurrency or utilization. Spare quota never creates valuable work.

The human should be able to answer:

1. What is progressing, stuck, awaiting me, or failing verification?
2. What can agents advance without me, inside existing authority?
3. What Important / Non-Urgent planning time should I protect?
4. What capacity constraints, reserves and reset options affect the next decision?
5. What changed, how do we know, and what does the system NOT know?

## Ownership

- OpenClaw owns runtime execution, provider access, native retrieval and permissions.
- Spacesuit owns adapters, semantic mappings, optional strategy policies and provenance.
- Command Center owns provider-independent presentation and explicit operator controls.
- Private workspaces own source bindings, policies, identities and human judgments.

Do not add a second task tracker, scheduler or memory engine. Start with versioned,
bounded records and explicit relationships; a graph database is not a prerequisite.

## Common vocabulary

| Entity               | Meaning                                                           | Primary authority                              |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| Outcome/project      | A result being pursued; not an agent session                      | Tracker plus human definition                  |
| Work item            | A scoped action contributing to an outcome                        | Tracker                                        |
| Run/session          | An execution attempt, not proof of completion                     | OpenClaw                                       |
| Artifact             | Produced document, patch, build or other deliverable              | Artifact store                                 |
| Verification         | Evidence that acceptance criteria passed/failed                   | Named verifier with receipt                    |
| Topic                | A grouping for navigating related evidence                        | Explicit topic adapter                         |
| Knowledge claim      | A sourced statement, possibly disputed or superseded              | Source/provenance records                      |
| Assessment           | Importance, urgency or readiness judgment                         | Accepted human/policy record                   |
| Capacity pool/window | A provider/account's reported allowance and constraints           | Provider observations                          |
| Reset option         | A distinct intervention with availability, eligibility and effect | Verified provider rule and account observation |
| Recommendation       | An explanation and proposed next action                           | Versioned advisory policy                      |

Use source-native IDs, not title matching. The existing `(sourceId, projectId)`
identity is scoped to workspace/profile/agent; source bindings must identify the
correct provider account. Cross-workspace aggregation needs an explicit authorized
projection, not a global scan of private records.

Relationships are typed: `contributes_to`, `executes`, `produces`, `verifies`,
`depends_on`, `cites`, `discusses`, `supersedes`. Suggested relationships remain
proposals until accepted by a human or a named reviewed policy. Every edge has
source, observation time and scope. A similarly named topic is not automatically
the same project; a session ending is not an outcome completing.

## Facts, interpretation and decisions

Store four separate layers:

1. **Observations:** original native ID/status, source reference, observed time,
   collection result, completeness and freshness. Collection time is not event time.
2. **Accepted interpretation:** explicit mapping/policy ID and version, inputs,
   explanation and effective scope. Keep native values alongside normalized values.
3. **Proposals:** agent suggestions, evidence and uncertainty; never overwrite facts
   or masquerade as human approval. Retrieval similarity is not truth confidence.
4. **Decisions/authority:** who accepted what, when, scope, expiry and revocation.
   Displaying or recording a recommendation does not grant execution permission.

Conflicts remain visible. Unknown is not false, zero, low priority or Done. A
human-approved override has provenance and expiry; it does not rewrite the tracker.
Retraction/supersession must invalidate derived views. Preserve evidence references
so every badge can answer "why?", "according to whom?", and "as of when?".

## Eisenhower classification (implemented library)

`lib/semantics/priority.js` exports `evaluatePriority` and returns stable codes,
not UI strings. It is side-effect free and is not yet attached to project snapshots
or Command Center. A later UI must localize labels in every supported locale.

Inputs: trusted `scope`, `target`, explicit current epoch-ms `now`, and up to 64
assessment records. `scope` contains `workspaceId`, `profile`, `agentId`; `target`
contains `sourceId`, `projectId`. Each record repeats scope/target and supplies:

```json
{
  "dimension": "importance",
  "value": true,
  "authority": "human",
  "assertedBy": "operator-example",
  "observedAt": "2026-01-02T10:00:00Z",
  "expiresAt": "2026-01-03T10:00:00Z",
  "evidenceRefs": ["decision-1"]
}
```

Importance means contribution to an explicitly valued outcome. Urgency means time
sensitivity with a consequence, not loudness, message recency, task size or importance.
False values are explicit judgments. Missing judgments remain unassessed. The caller
must authenticate records: `authority: human` in arbitrary JSON is NOT authentication.

Only fresh matching human/policy assertions classify. Proposals, malformed evidence,
expired or future observations are rejected with reason codes. Conflicting accepted
values remain `conflict`; no silent latest-wins policy. Output includes evidence IDs,
assessors, validity, policy identity and `advisoryOnly: true`.

| Quadrant   | Interpretation                         | Advisory posture                                           |
| ---------- | -------------------------------------- | ---------------------------------------------------------- |
| Q1         | Important and urgent                   | Triage and identify the actual human decision              |
| Q2         | Important and non-urgent               | Protect planning time; agents can prepare research/options |
| Q3         | Not important but urgent               | Consider delegation, subject to readiness and authority    |
| Q4         | Neither                                | Consider deferral or elimination; do not auto-delete       |
| Unassessed | Missing, stale or conflicting judgment | Clarify before prioritizing                                |

Human planning and agent execution are not separate quadrants. Agents may support
Q1 and Q2; humans retain outcome selection and necessary decisions. Delegation still
requires acceptance criteria, capability, readiness, bounded budget and authorization.

## Capacity and reset semantics (proposed, not implemented)

Track shared allowance by **provider/account/pool**, not once per agent. Five agents
sharing one allowance do not have five times the budget. Keep these concepts distinct:

- Scheduled reset: provider-supplied window and reset timestamp.
- Remaining allowance: observed utilization in that window; not rollover credit.
- Purchased credits: balance and documented expiry, independent of plan allowance.
- Banked/manual reset: available count, eligibility, expiry, replenishment rule,
  effect on each window, stacking behavior and cost, only when supported by evidence.

Unknown reset semantics stay unknown. Do not infer reset inventory from percentages,
a plan name or a successful past reset. Do not invoke a manual reset automatically.
Show observation time, source and unavailable/stale states. When a timestamp passes,
refresh rather than fabricating a replenished balance. Scope rules per provider and
account; a reset can affect a shared pool used by other applications.

An eventual strategy view can offer:

- **Push:** valuable approved work is ready, required capacity is available, evidence
  is fresh, and the proposed batch respects a human-selected reserve/budget.
- **Conserve:** preserve capacity for committed work, await a reset, or lower concurrency.
- **Unblock:** resolve a dependency or human decision instead of spawning more agents.
- **Replan:** reconsider outcomes when assumptions, deadlines or constraints changed.
- **Unknown:** evidence is insufficient for a capacity recommendation.

Forecasts require measured consumption by comparable workload plus uncertainty bands.
Do not extrapolate from one percentage sample or claim unused allowance will expire
unless the provider rule confirms it. Compare options and their consequences, including
"do nothing"; finishing work is more important than consuming expiring quota.

Levers: approved work batch, model choice, concurrency, spend ceiling, capacity reserve,
pause/resume and supported reset action. Each control needs a consequence preview,
appropriate runtime authorization, an audit receipt and a verified result. The semantic
layer is advisory; it cannot weaken OpenClaw permissions or create a parallel scheduler.

## Memory and retrieval

Topic and retrieval adapters expose citations, source revisions, scope, timestamps,
index freshness, retrieval method and explicit coverage. Keyword/vector/hybrid/graph
retrieval can differ without changing project identity. Do not compare relevance
scores across engines as calibrated confidence. A retrieved claim is evidence to
inspect, not an instruction to execute or an automatic priority override.

The project cockpit joins explicitly linked outcomes, tasks, runs, artifacts,
decisions and knowledge. Memory is evidence behind a decision, not a second tracker.

## Delivery sequence

1. Versioned contract and pure priority evaluator (this change).
2. Read-only live tracker collection with trustworthy freshness and native identity.
3. Accepted importance/urgency overlays and a project cockpit with evidence links.
4. Provider-backed capacity inventory, documented reset semantics and reserve controls.
5. Explainable strategy recommendations and operator-authorized execution controls.
6. Citation-backed knowledge retrieval and explicit project/topic relationships.

Contract evolution is additive where possible. Incompatible changes get a new major
schema version and fixtures shared with the host. Preserve profile isolation,
localization and one shared live-update feed. Never deploy UI code that presents a
proposed capability as connected or automatically operational.

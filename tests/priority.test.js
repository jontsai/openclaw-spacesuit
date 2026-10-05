const { test } = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePriority } = require("../lib/semantics/priority");
const scope = {
  workspaceId: "workspace-example",
  profile: "work",
  agentId: "main",
};
const target = { sourceId: "linear-example", projectId: "outcome-1" };
const now = Date.parse("2026-01-02T12:00:00Z");
function assessment(dimension, value, overrides = {}) {
  return {
    scope,
    target,
    dimension,
    value,
    authority: "human",
    assertedBy: "operator-example",
    observedAt: "2026-01-02T10:00:00Z",
    expiresAt: "2026-01-03T10:00:00Z",
    evidenceRefs: ["decision-1"],
    ...overrides,
  };
}
function run(assessments, overrides = {}) {
  return evaluatePriority({ scope, target, now, assessments, ...overrides });
}
test("all quadrants preserve the important/non-urgent planning distinction", () => {
  for (const [i, u, q, posture] of [
    [true, true, "q1", "triage"],
    [true, false, "q2", "protect_planning"],
    [false, true, "q3", "consider_delegation"],
    [false, false, "q4", "consider_deferral"],
  ]) {
    const r = run([assessment("importance", i), assessment("urgency", u)]);
    assert.equal(r.quadrant, q);
    assert.equal(r.posture, posture);
    assert.equal(r.advisoryOnly, true);
  }
});
test("absent judgments remain unknown rather than non-urgent or unimportant", () => {
  assert.equal(run([]).quadrant, "unassessed");
  assert.equal(
    run([assessment("importance", true)]).dimensions.urgency.value,
    null,
  );
});
test("an agent proposal cannot promote itself into an accepted judgment", () => {
  const r = run([
    assessment("importance", true, { authority: "proposal" }),
    assessment("urgency", true),
  ]);
  assert.equal(r.quadrant, "unassessed");
  assert.deepEqual(r.dimensions.importance.rejectedReasons, ["not_accepted"]);
});
test("fresh accepted conflicts are exposed without last-write-wins", () => {
  const inputs = [
    assessment("importance", true),
    assessment("importance", false, {
      authority: "policy",
      assertedBy: "policy-example",
    }),
    assessment("urgency", false),
  ];
  assert.equal(run(inputs).dimensions.importance.status, "conflict");
  assert.deepEqual(run(inputs), run([...inputs].reverse()));
});
test("expired and future observations do not compete with accepted current evidence", () => {
  const r = run([
    assessment("importance", true),
    assessment("urgency", false),
    assessment("importance", false, { expiresAt: "2026-01-02T12:00:00Z" }),
    assessment("importance", false, { observedAt: "2026-01-02T13:00:00Z" }),
  ]);
  assert.equal(r.quadrant, "q2");
  assert.deepEqual(r.dimensions.importance.rejectedReasons, [
    "expired",
    "future_observation",
  ]);
});
test("workspace, profile, agent and tracker outcome identity cannot cross-contaminate", () => {
  for (const overrides of [
    { scope: { ...scope, workspaceId: "other" } },
    { scope: { ...scope, profile: "other" } },
    { scope: { ...scope, agentId: "other" } },
    { target: { ...target, sourceId: "other" } },
    { target: { ...target, projectId: "other" } },
  ]) {
    const r = run([
      assessment("importance", true, overrides),
      assessment("urgency", false),
    ]);
    assert.equal(r.quadrant, "unassessed");
    assert.deepEqual(r.dimensions.importance.rejectedReasons, [
      "identity_mismatch",
    ]);
  }
});
test("malformed dates, values or missing evidence do not become facts", () => {
  for (const overrides of [
    { value: "true" },
    { value: null },
    { evidenceRefs: [] },
    { observedAt: "yesterday" },
    { expiresAt: "2026-01-01T10:00:00Z" },
    { observedAt: "2026-01-02T10:00:00" },
    { expiresAt: "2026-02-30T10:00:00Z" },
    { assertedBy: "" },
  ]) {
    const r = run([
      assessment("importance", true, overrides),
      assessment("urgency", false),
    ]);
    assert.equal(r.quadrant, "unassessed");
  }
});
test("no classification survives its evidence expiry", () => {
  const r = run(
    [assessment("importance", true), assessment("urgency", false)],
    { now: Date.parse("2026-01-03T10:00:00Z") },
  );
  assert.equal(r.quadrant, "unassessed");
});
test("result preserves references and policy identity without mutating input or echoing extra fields", () => {
  const inputs = [
    assessment("importance", true, { rawNote: "private source prose" }),
    assessment("urgency", false),
  ];
  const before = JSON.stringify(inputs);
  const r = run(inputs);
  assert.equal(JSON.stringify(inputs), before);
  assert.equal(r.policyId, "eisenhower-explicit-v1");
  assert.deepEqual(r.dimensions.importance.evidenceRefs, ["decision-1"]);
  assert.equal(JSON.stringify(r).includes("private source prose"), false);
});
test("input size and caller identity are bounded and required", () => {
  assert.throws(() => run(Array(65).fill(null)), /INVALID_PRIORITY_INPUT/);
  assert.throws(() => run([], { scope: null }), /INVALID_PRIORITY_INPUT/);
  assert.throws(() => run([], { now: NaN }), /INVALID_PRIORITY_INPUT/);
  assert.throws(() => run([], { now: 1e30 }), /INVALID_PRIORITY_INPUT/);
});

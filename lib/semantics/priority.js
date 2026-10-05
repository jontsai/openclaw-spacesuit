// Pure advisory logic. This module cannot authorize or perform an action.
const CONTRACT = "spacesuit.priority.v1";
const POLICY = "eisenhower-explicit-v1";
const DIMENSIONS = ["importance", "urgency"];
const key = (v) => typeof v === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(v);
const instant = (v) => {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v)
  )
    return NaN;
  const calendar = Date.parse(v.slice(0, 10) + "T00:00:00Z");
  if (
    !Number.isFinite(calendar) ||
    new Date(calendar).toISOString().slice(0, 10) !== v.slice(0, 10)
  )
    return NaN;
  return Date.parse(v);
};
const validScope = (s) =>
  s &&
  key(s.workspaceId) &&
  key(s.agentId) &&
  typeof s.profile === "string" &&
  /^[a-zA-Z0-9_-]{0,64}$/.test(s.profile);
const validTarget = (t) => t && key(t.sourceId) && key(t.projectId);
const sameScope = (a, b) =>
  validScope(a) &&
  a.workspaceId === b.workspaceId &&
  a.profile === b.profile &&
  a.agentId === b.agentId;
const sameTarget = (a, b) =>
  validTarget(a) && a.sourceId === b.sourceId && a.projectId === b.projectId;

/**
 * Classify accepted, fresh judgments, not tracker status or estimated usage.
 * Caller supplies trusted scope and current time. Authority fields are assertions
 * from an authenticated producer, NOT an authentication or authorization system.
 */
function evaluatePriority({ scope, target, assessments = [], now } = {}) {
  if (
    !validScope(scope) ||
    !validTarget(target) ||
    !Number.isFinite(now) ||
    !Number.isFinite(new Date(now).getTime()) ||
    !Array.isArray(assessments) ||
    assessments.length > 64
  ) {
    throw new Error("INVALID_PRIORITY_INPUT");
  }
  const dimensions = {};
  for (const dimension of DIMENSIONS) {
    const candidates = assessments.filter(
      (a) => a && a.dimension === dimension,
    );
    const eligible = [];
    const rejected = new Set();
    for (const a of candidates) {
      let reason = null;
      const observed = instant(a.observedAt);
      const expires = instant(a.expiresAt);
      if (!sameScope(a.scope, scope) || !sameTarget(a.target, target)) {
        reason = "identity_mismatch";
      } else if (!["human", "policy"].includes(a.authority)) {
        reason = "not_accepted";
      } else if (
        typeof a.value !== "boolean" ||
        !key(a.assertedBy) ||
        !Array.isArray(a.evidenceRefs) ||
        a.evidenceRefs.length < 1 ||
        a.evidenceRefs.length > 16 ||
        !a.evidenceRefs.every(key) ||
        !Number.isFinite(observed) ||
        !Number.isFinite(expires) ||
        expires <= observed
      ) {
        reason = "invalid_assessment";
      } else if (observed > now) {
        reason = "future_observation";
      } else if (expires <= now) {
        reason = "expired";
      }
      if (reason) rejected.add(reason);
      else eligible.push(a);
    }
    const values = new Set(eligible.map((a) => a.value));
    // Conflicts between accepted assertions require reconciliation, never last-write-wins.
    const status =
      values.size > 1 ? "conflict" : values.size === 1 ? "assessed" : "unknown";
    dimensions[dimension] = {
      status,
      value: status === "assessed" ? eligible[0].value : null,
      evidenceRefs: [
        ...new Set(eligible.flatMap((a) => a.evidenceRefs)),
      ].sort(),
      assertedBy: [...new Set(eligible.map((a) => a.assertedBy))].sort(),
      validUntil: eligible.length
        ? new Date(
            Math.min(...eligible.map((a) => instant(a.expiresAt))),
          ).toISOString()
        : null,
      rejectedReasons: [...rejected].sort(),
    };
  }
  const importance = dimensions.importance.value;
  const urgency = dimensions.urgency.value;
  let quadrant = "unassessed";
  let posture = "clarify";
  if (importance !== null && urgency !== null) {
    if (importance && urgency) {
      quadrant = "q1";
      posture = "triage";
    } else if (importance) {
      quadrant = "q2";
      posture = "protect_planning";
    } else if (urgency) {
      quadrant = "q3";
      posture = "consider_delegation";
    } else {
      quadrant = "q4";
      posture = "consider_deferral";
    }
  }
  return {
    schemaVersion: 1,
    contract: CONTRACT,
    policyId: POLICY,
    scope: {
      workspaceId: scope.workspaceId,
      profile: scope.profile,
      agentId: scope.agentId,
    },
    target: { sourceId: target.sourceId, projectId: target.projectId },
    evaluatedAt: new Date(now).toISOString(),
    dimensions,
    quadrant,
    posture,
    advisoryOnly: true,
  };
}

module.exports = { evaluatePriority, CONTRACT, POLICY };

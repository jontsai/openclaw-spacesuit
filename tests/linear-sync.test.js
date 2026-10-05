const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { collect, LINEAR_QUERY } = require("../lib/projects/adapters");
const { createLinearRequest } = require("../lib/projects/linear");
const { run, read } = require("../lib/projects/runtime");
const fixture = require("./fixtures/projects/linear.json");
const source = {
  id: "linear-example",
  provider: "linear",
  label: "Planning",
  enabled: true,
  organizationId: "org-example",
  credentialEnv: "LINEAR_API_KEY",
};
const env = { LINEAR_API_KEY: "synthetic-test-credential" };
function page() {
  const p = structuredClone(fixture.pages[0]);
  p.data.organization = { id: source.organizationId };
  return p;
}
const response = (value = page()) => new Response(JSON.stringify(value));
const descriptor = () => ({
  provider: "linear",
  method: "POST",
  path: "/graphql",
  query: LINEAR_QUERY,
  variables: { first: 50, after: null },
  signal: new AbortController().signal,
});
function ws(t, sources = [source]) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "linear-sync-")),
  );
  fs.writeFileSync(
    path.join(root, "config.json"),
    JSON.stringify({ schemaVersion: 1, profile: "", agentId: "main", sources }),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
const args = (root, op = "sync-preview") => [
  op,
  "--workspace",
  root,
  "--config",
  "config.json",
];
test("fixed endpoint/query, explicit auth, redirect rejection and read-only paging", async () => {
  const seen = [];
  const request = createLinearRequest(source, {
    env,
    fetchImpl: async (url, options) => {
      seen.push({ url, options });
      const p = page();
      p.data.projects.nodes[0].id = `project-${seen.length}`;
      p.data.projects.pageInfo = {
        hasNextPage: seen.length === 1,
        endCursor: "page-2",
      };
      return response(p);
    },
  });
  const result = await collect({ source, request });
  assert.equal(result.status, "ready");
  assert.equal(result.projects.length, 2);
  assert.equal(seen[0].url, "https://api.linear.app/graphql");
  assert.equal(seen[0].options.redirect, "error");
  assert.equal(seen[0].options.headers.Authorization, env.LINEAR_API_KEY);
  assert.equal(JSON.parse(seen[1].options.body).variables.after, "page-2");
  assert.equal(JSON.stringify(result).includes(env.LINEAR_API_KEY), false);
});
test("mutations, arbitrary paths/providers and paging overrides never reach fetch", async () => {
  let calls = 0;
  const request = createLinearRequest(source, {
    env,
    fetchImpl: async () => {
      calls++;
      return response();
    },
  });
  for (const override of [
    { query: "mutation { dangerous }" },
    { path: "/other" },
    { method: "GET" },
    { provider: "jira" },
    { variables: { first: 10000, after: null } },
  ]) {
    await assert.rejects(
      request({ ...descriptor(), ...override }),
      /INVALID_REQUEST/,
    );
  }
  assert.equal(calls, 0);
});
test("wrong organization and GraphQL errors cannot become fresh projects", async () => {
  for (const mutate of [
    (p) => {
      p.data.organization.id = "other-org";
    },
    (p) => {
      p.errors = [{ message: "private provider message" }];
    },
  ]) {
    const p = page();
    mutate(p);
    const result = await collect({
      source,
      request: createLinearRequest(source, {
        env,
        fetchImpl: async () => response(p),
      }),
    });
    assert.equal(result.status, "error");
    assert.equal(result.projects.length, 0);
    assert.equal(JSON.stringify(result).includes("private provider"), false);
  }
});
test("HTTP errors are not retried or leaked", async () => {
  for (const status of [401, 429, 500]) {
    let count = 0;
    const request = createLinearRequest(source, {
      env,
      fetchImpl: async () => {
        count++;
        return new Response("private error", { status });
      },
    });
    await assert.rejects(
      request(descriptor()),
      (e) => e.code.startsWith("PROJECT_") && !e.message.includes("private"),
    );
    assert.equal(count, 1);
  }
});
test("response cap applies to streaming bytes even without content length", async () => {
  let canceled = false;
  const request = createLinearRequest(source, {
    env,
    fetchImpl: async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(65536));
          },
          cancel() {
            canceled = true;
          },
        }),
      ),
  });
  await assert.rejects(request(descriptor()), /RESPONSE_LIMIT/);
  assert.equal(canceled, true);
});
test("collector deadline bounds a stalled fetch and signals cancellation", async () => {
  let signal;
  const result = await collect({
    source,
    timeoutMs: 20,
    request: createLinearRequest(source, {
      env,
      fetchImpl: (_u, opts) => {
        signal = opts.signal;
        return new Promise(() => {});
      },
    }),
  });
  assert.equal(result.status, "error");
  assert.equal(signal.aborted, true);
});
test("bindings require named organization and host credential; OAuth is explicit", async () => {
  assert.throws(
    () => createLinearRequest(source, { env: {} }),
    /CREDENTIAL_UNAVAILABLE/,
  );
  for (const override of [
    { organizationId: "" },
    { input: "export.json" },
    { provider: "jira" },
    { credentialEnv: "OTHER_SECRET" },
  ])
    assert.throws(
      () => createLinearRequest({ ...source, ...override }, { env }),
      /INVALID_LINEAR_BINDING/,
    );
  let auth;
  await createLinearRequest(
    { ...source, authType: "oauth" },
    {
      env,
      fetchImpl: async (_url, o) => {
        auth = o.headers.Authorization;
        return response();
      },
    },
  )(descriptor());
  assert.equal(auth, `Bearer ${env.LINEAR_API_KEY}`);
});
test("preview writes nothing; sync writes bounded snapshots without credentials", async (t) => {
  const root = ws(t);
  const opts = { env, fetchImpl: async () => response() };
  const preview = await run(args(root), opts);
  assert.equal(preview.mode, "live-linear-once");
  assert.equal(preview.snapshots[0].status, "ready");
  assert.equal(fs.existsSync(path.join(root, "state")), false);
  const applied = await run(args(root, "sync"), opts);
  assert.equal(applied.status, "applied");
  const raw = read(root, "state/command-center/projects/linear-example.json");
  assert.equal(JSON.parse(raw).organizationId, source.organizationId);
  assert.equal(raw.includes(env.LINEAR_API_KEY), false);
  assert.equal(
    read(root, "state/command-center/project-sources.json").includes(
      "credentialEnv",
    ),
    false,
  );
});
test("failed refresh retains same-org data and original time", async (t) => {
  const root = ws(t);
  const first = await run(args(root, "sync"), {
    env,
    fetchImpl: async () => response(),
  });
  const next = await run(args(root, "sync"), {
    env,
    fetchImpl: async () => new Response("", { status: 429 }),
  });
  assert.equal(next.snapshots[0].status, "error");
  assert.deepEqual(next.snapshots[0].projects, first.snapshots[0].projects);
  assert.equal(next.snapshots[0].observedAt, first.snapshots[0].observedAt);
});
test("an organization binding cannot silently change or lose identity in offline mode", async (t) => {
  const root = ws(t);
  const opts = { env, fetchImpl: async () => response() };
  await run(args(root, "sync"), opts);
  const config = JSON.parse(fs.readFileSync(path.join(root, "config.json")));
  config.sources[0].organizationId = "other-org";
  fs.writeFileSync(path.join(root, "config.json"), JSON.stringify(config));
  await assert.rejects(run(args(root, "sync"), opts), /ORGANIZATION_MISMATCH/);
  delete config.sources[0].organizationId;
  config.sources[0].input = "export.json";
  fs.writeFileSync(path.join(root, "config.json"), JSON.stringify(config));
  await assert.rejects(run(args(root, "apply"), opts), /ORGANIZATION_MISMATCH/);
});
test("one missing credential does not hide another ready source", async (t) => {
  const root = ws(t, [
    source,
    { ...source, id: "linear-other", credentialEnv: "LINEAR_MISSING" },
  ]);
  const out = await run(args(root), { env, fetchImpl: async () => response() });
  assert.deepEqual(
    out.snapshots.map((s) => s.status),
    ["ready", "error"],
  );
});

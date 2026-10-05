// Host-side read-only transport. Never serialize credentials or provider errors.
const { LINEAR_QUERY, fail } = require("./adapters");
const ENDPOINT = "https://api.linear.app/graphql";
const BODY_LIMIT = 1024 * 1024;

function validateLinearBinding(source) {
  if (
    source.provider !== "linear" ||
    typeof source.organizationId !== "string" ||
    !/^[a-zA-Z0-9-]{1,128}$/.test(source.organizationId) ||
    typeof source.credentialEnv !== "string" ||
    !/^LINEAR_[A-Z0-9_]{1,80}$/.test(source.credentialEnv) ||
    ![undefined, "api-key", "oauth"].includes(source.authType) ||
    source.input !== undefined
  )
    fail("INVALID_LINEAR_BINDING");
}

function createLinearRequest(
  source,
  { env = process.env, fetchImpl = globalThis.fetch } = {},
) {
  validateLinearBinding(source);
  const credential = env[source.credentialEnv];
  if (
    typeof credential !== "string" ||
    !credential ||
    /[\r\n]/.test(credential)
  )
    fail("CREDENTIAL_UNAVAILABLE");
  if (typeof fetchImpl !== "function") fail("TRANSPORT_UNAVAILABLE");

  return async (descriptor) => {
    // The adapter cannot turn this transport into an arbitrary GraphQL client.
    const { variables, signal } = descriptor;
    if (
      descriptor.provider !== "linear" ||
      descriptor.method !== "POST" ||
      descriptor.path !== "/graphql" ||
      descriptor.query !== LINEAR_QUERY ||
      !variables ||
      variables.first !== 50 ||
      !(
        variables.after === null ||
        (typeof variables.after === "string" &&
          variables.after.length > 0 &&
          variables.after.length <= 2048)
      ) ||
      !signal ||
      typeof signal.addEventListener !== "function"
    )
      fail("INVALID_REQUEST");

    let response;
    let reader;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        redirect: "error",
        signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization:
            source.authType === "oauth" ? `Bearer ${credential}` : credential,
        },
        body: JSON.stringify({
          query: LINEAR_QUERY,
          variables: { first: 50, after: variables.after },
        }),
      });
      if (!response.ok)
        fail(response.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE");
      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length > BODY_LIMIT)
        fail("RESPONSE_LIMIT");
      reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > BODY_LIMIT) fail("RESPONSE_LIMIT");
        chunks.push(Buffer.from(value));
      }
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (value.errors?.length) fail("PROVIDER_ERROR");
      if (value.data?.organization?.id !== source.organizationId)
        fail("ORGANIZATION_MISMATCH");
      return value;
    } catch (error) {
      // Do not emit fetch exceptions, headers, response bodies or GraphQL messages.
      const code = error.code;
      if (
        [
          "PROJECT_RATE_LIMITED",
          "PROJECT_PROVIDER_UNAVAILABLE",
          "PROJECT_RESPONSE_LIMIT",
          "PROJECT_PROVIDER_ERROR",
          "PROJECT_ORGANIZATION_MISMATCH",
        ].includes(code)
      )
        throw error;
      fail(signal.aborted ? "REQUEST_ABORTED" : "TRANSPORT_FAILED");
    } finally {
      if (reader) await reader.cancel().catch(() => {});
      else if (response?.body) await response.body.cancel().catch(() => {});
    }
  };
}

module.exports = { createLinearRequest, validateLinearBinding };

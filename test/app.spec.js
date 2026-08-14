import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import worker from "../src/index.js";

const validGpx = "<?xml version=\"1.0\"?><gpx><trk><name>test</name></trk></gpx>";
const apiToken = "test-api-token";

function createEnv(options = {}) {
  const entries = new Map();
  const { failPut = false, failGet = false, failDelete = false } = options;
  const env = {
    ANEMOCHORE_API_KEYS: apiToken,
    GPX_STORE: {
      async put(key, value, options) {
        if (failPut) {
          throw new Error("simulated KV failure");
        }
        entries.set(key, JSON.parse(value));
        this.lastPutOptions = options;
      },
      async get(key, type) {
        if (failGet) {
          throw new Error("simulated KV failure");
        }
        const value = entries.get(key);
        return type === "json" ? value ?? null : JSON.stringify(value);
      },
      async delete(key) {
        if (failDelete) {
          throw new Error("simulated KV failure");
        }
        entries.delete(key);
      },
    },
    UPLOAD_RATE_LIMITER: {
      async limit() {
        return { success: true };
      }
    },
    DELETE_RATE_LIMITER: {
      async limit() {
        return { success: true };
      }
    }
  };

  env.entries = entries;
  return env;
}

async function upload(app, env, headers = {}) {
  const formData = new FormData();
  formData.set("file", new File([validGpx], "route.gpx", { type: "application/gpx+xml" }));
  return app.fetch(new Request("https://worker.example/api/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      ...headers,
    },
    body: formData,
  }), env);
}

function parseAuditLogs(logCalls) {
  return logCalls
    .map((call) => String(call[0]))
    .filter((entry) => entry.startsWith("{"))
    .map((entry) => JSON.parse(entry));
}

describe("Hono migration compatibility", () => {
  it("emits structured audit logs across upload, retrieval, and delete flows", async () => {
    const app = createApp();
    const env = createEnv();
    const logCalls = [];
    const originalLog = console.log;
    console.log = (...args) => logCalls.push(args);

    try {
      const requestId = "audit-request-123";
      const uploadResponse = await upload(app, env, {
        "X-Request-Id": requestId,
        "X-Client-IP": "203.0.113.7",
      });
      const uploaded = await uploadResponse.json();

      const getResponse = await app.fetch(new Request(uploaded.url, {
        headers: {
          "X-Request-Id": requestId,
          "X-Client-IP": "203.0.113.7",
        },
      }), env);
      expect(getResponse.status).toBe(200);

      const deleteResponse = await app.fetch(new Request(uploaded.url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "X-Delete-Key": uploaded.delete_key,
          "X-Request-Id": requestId,
          "X-Client-IP": "203.0.113.7",
        },
      }), env);
      expect(deleteResponse.status).toBe(200);

      const auditEvents = parseAuditLogs(logCalls);
      const eventNames = auditEvents.map((entry) => entry.event);
      const requestIds = new Set(auditEvents.map((entry) => entry.request_id));

      expect(eventNames).toEqual(expect.arrayContaining([
        "request_received",
        "upload_received",
        "kv_stored",
        "gpx_retrieval_requested",
        "kv_fetched",
        "gpx_deletion_requested",
        "kv_deleted",
        "response_sent",
      ]));
      expect(requestIds).toEqual(new Set([requestId]));
      expect(JSON.stringify(logCalls)).not.toContain(apiToken);
      expect(JSON.stringify(logCalls)).not.toContain(uploaded.delete_key);
    } finally {
      console.log = originalLog;
    }
  });

  it("logs auth rejection without leaking the rejected API key", async () => {
    const app = createApp();
    const env = createEnv();
    const logCalls = [];
    const originalLog = console.log;
    console.log = (...args) => logCalls.push(args);

    try {
      const response = await app.fetch(new Request("https://worker.example/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer wrong-token`,
          "X-Request-Id": "audit-auth-401",
          "X-Client-IP": "203.0.113.9",
        },
        body: new FormData(),
      }), env);

      expect(response.status).toBe(401);
      const auditEvents = parseAuditLogs(logCalls);
      const events = new Map(auditEvents.map((entry) => [entry.event, entry]));
      expect(events.get("request_received")?.request_id).toBe("audit-auth-401");
      expect(events.get("api_key_rejected")?.result).toBe("failure");
      expect(events.get("api_key_rejected")?.status).toBe(401);
      expect(events.get("api_key_rejected")?.failure_reason).toBe("invalid_api_key");
      expect(JSON.stringify(logCalls)).not.toContain("wrong-token");
      expect(JSON.stringify(logCalls)).not.toContain("Bearer wrong-token");
    } finally {
      console.log = originalLog;
    }
  });

  it("logs API key configuration errors separately from invalid key rejections", async () => {
    const app = createApp();
    const env = { ...createEnv(), ANEMOCHORE_API_KEYS: undefined };
    const logCalls = [];
    const originalLog = console.log;
    console.log = (...args) => logCalls.push(args);

    try {
      const response = await app.fetch(new Request("https://worker.example/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "X-Request-Id": "audit-auth-misconfigured",
          "X-Client-IP": "203.0.113.13",
        },
        body: (() => {
          const formData = new FormData();
          formData.set("file", new File([validGpx], "route.gpx", { type: "application/gpx+xml" }));
          return formData;
        })(),
      }), env);

      expect(response.status).toBe(500);
      const auditEvents = parseAuditLogs(logCalls);
      const events = new Map(auditEvents.map((entry) => [entry.event, entry]));
      expect(events.get("api_key_configuration_error")?.result).toBe("failure");
      expect(events.get("api_key_configuration_error")?.status).toBe(500);
      expect(events.get("api_key_configuration_error")?.failure_reason).toBe("api_key_not_configured");
      expect(events.get("api_key_rejected")).toBeUndefined();
    } finally {
      console.log = originalLog;
    }
  });

  it("logs KV write failures for upload with the failure reason and error message", async () => {
    const app = createApp();
    const env = createEnv({ failPut: true });
    const logCalls = [];
    const originalLog = console.log;
    console.log = (...args) => logCalls.push(args);

    try {
      const requestId = "audit-kv-upload-failure";
      const response = await app.fetch(new Request("https://worker.example/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "X-Request-Id": requestId,
          "X-Client-IP": "203.0.113.42",
        },
        body: (() => {
          const formData = new FormData();
          formData.set("file", new File([validGpx], "route.gpx", { type: "application/gpx+xml" }));
          return formData;
        })(),
      }), env);

      expect(response.status).toBe(500);

      const auditEvents = parseAuditLogs(logCalls);
      const failureEvent = auditEvents.find((entry) => entry.event === "kv_stored" && entry.result === "failure");

      expect(failureEvent).toMatchObject({
        event: "kv_stored",
        result: "failure",
        failure_reason: "kv_write_failed",
        request_id: requestId,
      });
      expect(failureEvent.error_message).toBeTruthy();
      expect(failureEvent.error_message).toContain("simulated KV failure");
      expect(JSON.stringify(logCalls)).not.toContain(apiToken);
    } finally {
      console.log = originalLog;
    }
  });

  it("serves requests through the module-level Worker app", async () => {
    const response = await worker.fetch(
      new Request("https://worker.example/api/health"),
      createEnv(),
      {},
    );

    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns the original health response and CORS headers", async () => {
    const response = await createApp().fetch(new Request("https://worker.example/api/health"), createEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Content-Security-Policy")).toContain("form-action 'self'");
  });

  it("keeps the original CORS preflight response for every path", async () => {
    const response = await createApp().fetch(new Request("https://worker.example/unknown", {
      method: "OPTIONS",
    }), createEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, DELETE, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Delete-Key");
  });

  it("uploads, retrieves, and deletes a GPX with the original JSON fields", async () => {
    const app = createApp();
    const env = createEnv();
    const uploadResponse = await upload(app, env);
    const result = await uploadResponse.json();

    expect(Object.keys(result).sort()).toEqual(["delete_key", "id", "url"]);
    expect(result.url).toBe(`https://worker.example/api/gpx/${result.id}`);
    expect(env.GPX_STORE.lastPutOptions).toEqual({ expirationTtl: 86400 });
    expect(env.entries.get(result.id)).toMatchObject({
      format: "gpx",
      content_type: "application/gpx+xml; charset=utf-8",
      extension: "gpx",
      content: validGpx,
    });
    expect(env.entries.get(result.id).delete_key).toEqual(expect.any(String));
    expect(new Date(env.entries.get(result.id).created_at).toISOString()).toBe(env.entries.get(result.id).created_at);

    const gpxResponse = await app.fetch(new Request(result.url), env);
    expect(gpxResponse.headers.get("Content-Type")).toBe("application/gpx+xml; charset=utf-8");
    expect(await gpxResponse.text()).toBe(validGpx);

    const deleted = await app.fetch(new Request(result.url, {
      method: "DELETE",
      headers: {
        "X-Delete-Key": result.delete_key,
        Authorization: `Bearer ${apiToken}`,
      },
    }), env);
    expect(await deleted.json()).toEqual({ deleted: true });
  });

  it("keeps upload validation error messages", async () => {
    const app = createApp();
    const env = createEnv();
    const invalid = new FormData();
    invalid.set("file", new File(["<gpx></gpx>"], "invalid.gpx"));

    const invalidResponse = await app.fetch(new Request("https://worker.example/api/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
      body: invalid,
    }), env);
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toEqual({ error: "invalid GPX file" });

    const tooLarge = await app.fetch(new Request("https://worker.example/api/upload", {
      method: "POST",
      headers: {
        "Content-Length": String(2 * 1024 * 1024 + 1),
        Authorization: `Bearer ${apiToken}`,
      },
      body: new FormData(),
    }), env);
    expect(await tooLarge.json()).toEqual({ error: "file too large" });
  });

  it("rejects malformed XML and XML that is not GPX", async () => {
    const app = createApp();
    const env = createEnv();

    for (const content of ["<gpx><trk></gpx>", "<document><track /></document>"]) {
      const formData = new FormData();
      formData.set("file", new File([content], "invalid.gpx"));
      const response = await app.fetch(new Request("https://worker.example/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
        body: formData,
      }), env);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid GPX file" });
    }
  });

  it("uses the stored content type and supports legacy stored GPX records", async () => {
    const app = createApp();
    const env = createEnv();
    await env.GPX_STORE.put("stored-type", JSON.stringify({
      format: "gpx",
      content_type: "application/example-gpx+xml",
      content: validGpx,
      delete_key: "stored-type-key",
    }));
    await env.GPX_STORE.put("legacy-gpx", JSON.stringify({
      content: validGpx,
      delete_key: "legacy-key",
    }));

    const storedTypeResponse = await app.fetch(new Request("https://worker.example/api/gpx/stored-type"), env);
    expect(storedTypeResponse.headers.get("Content-Type")).toBe("application/example-gpx+xml");

    const legacyResponse = await app.fetch(new Request("https://worker.example/api/gpx/legacy-gpx"), env);
    expect(legacyResponse.headers.get("Content-Type")).toBe("application/gpx+xml; charset=utf-8");
    expect(await legacyResponse.text()).toBe(validGpx);
  });

});

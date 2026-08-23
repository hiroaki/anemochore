import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import worker from "../src/index.js";
import { hashDeleteKey } from "../src/utils/delete-key.js";

const validCanonicalPayload = {
  schema_version: 1,
  data_type: "gpx",
  data: {
    tracks: [
      {
        name: "test",
        segments: [{ points: [{ coordinates: [135.0, 35.0] }] }],
      },
    ],
    routes: [],
    waypoints: [],
  },
};

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

async function upload(app, env, headers = {}, payload = validCanonicalPayload) {
  return app.fetch(new Request("https://worker.example/api/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
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
      const gpxUrl = `https://worker.example/api/gpx/${uploaded.id}`;

      const getResponse = await app.fetch(new Request(gpxUrl, {
        headers: {
          "X-Request-Id": requestId,
          "X-Client-IP": "203.0.113.7",
        },
      }), env);
      expect(getResponse.status).toBe(200);

      const deleteResponse = await app.fetch(new Request(gpxUrl, {
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
          "Content-Type": "application/json",
          "X-Request-Id": "audit-auth-401",
          "X-Client-IP": "203.0.113.9",
        },
        body: JSON.stringify(validCanonicalPayload),
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
      const response = await upload(app, env, {
        "X-Request-Id": "audit-auth-misconfigured",
        "X-Client-IP": "203.0.113.13",
      });

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
      const response = await upload(app, env, {
        "X-Request-Id": requestId,
        "X-Client-IP": "203.0.113.42",
      });

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
});

describe("canonical geodata storage", () => {
  it("stores the two-part KV shape and only ever returns {id, delete_key} from upload", async () => {
    const app = createApp();
    const env = createEnv();
    const uploadResponse = await upload(app, env);
    const result = await uploadResponse.json();

    expect(Object.keys(result).sort()).toEqual(["delete_key", "id"]);
    expect(env.GPX_STORE.lastPutOptions).toEqual({ expirationTtl: 86400 });

    const stored = env.entries.get(result.id);
    expect(Object.keys(stored).sort()).toEqual(
      ["content", "content_type", "created_at", "delete_key_hash", "format"],
    );
    expect(stored.format).toBe("canonical-geodata");
    expect(stored.content_type).toBe("application/json");
    expect(stored.delete_key_hash).toBe(await hashDeleteKey(result.delete_key));
    expect(stored).not.toHaveProperty("delete_key");
    expect(new Date(stored.created_at).toISOString()).toBe(stored.created_at);
    expect(stored.content).toEqual(validCanonicalPayload);
  });

  it("returns exactly the canonical payload from GET, with no service metadata at any level", async () => {
    const app = createApp();
    const env = createEnv();
    const uploadResponse = await upload(app, env);
    const { id } = await uploadResponse.json();

    const gpxUrl = `https://worker.example/api/gpx/${id}`;
    const gpxResponse = await app.fetch(new Request(gpxUrl), env);

    expect(gpxResponse.headers.get("Content-Type")).toContain("application/json");

    const body = await gpxResponse.json();
    expect(body).toEqual(validCanonicalPayload);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("delete_key");
    expect(serialized).not.toContain("created_at");
    expect(serialized).not.toContain("canonical-geodata");
  });

  it("deletes using the returned delete_key and rejects a mismatched key", async () => {
    const app = createApp();
    const env = createEnv();
    const uploadResponse = await upload(app, env);
    const { id, delete_key: deleteKey } = await uploadResponse.json();
    const gpxUrl = `https://worker.example/api/gpx/${id}`;

    const wrongKeyResponse = await app.fetch(new Request(gpxUrl, {
      method: "DELETE",
      headers: {
        "X-Delete-Key": "wrong-key",
        Authorization: `Bearer ${apiToken}`,
      },
    }), env);
    expect(wrongKeyResponse.status).toBe(403);

    const deleted = await app.fetch(new Request(gpxUrl, {
      method: "DELETE",
      headers: {
        "X-Delete-Key": deleteKey,
        Authorization: `Bearer ${apiToken}`,
      },
    }), env);
    expect(await deleted.json()).toEqual({ deleted: true });

    const afterDelete = await app.fetch(new Request(gpxUrl), env);
    expect(afterDelete.status).toBe(404);
  });

  it("rejects a canonical payload with the wrong data_type", async () => {
    const app = createApp();
    const env = createEnv();

    const response = await upload(app, env, {}, {
      schema_version: 1,
      data_type: "geojson",
      data: { tracks: [], routes: [], waypoints: [{ coordinates: [1, 2] }] },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid canonical geodata payload" });
  });

  it("accepts a canonical payload with empty GPX collections because Anemochore does not enforce GPX semantics", async () => {
    const app = createApp();
    const env = createEnv();

    const response = await upload(app, env, {}, {
      schema_version: 1,
      data_type: "gpx",
      data: { tracks: [], routes: [], waypoints: [] },
    });

    expect(response.status).toBe(200);
  });

  it("accepts payloads without GPX semantic coordinate validation", async () => {
    const app = createApp();
    const env = createEnv();

    const response = await upload(app, env, {}, {
      schema_version: 1,
      data_type: "gpx",
      data: { tracks: [], routes: [], waypoints: [{ coordinates: [200, 2] }] },
    });

    expect(response.status).toBe(200);
  });

  it("accepts canonical payloads with empty nested GPX collections because Anemochore does not enforce GPX structure", async () => {
    const app = createApp();
    const env = createEnv();

    const response = await upload(app, env, {}, {
      schema_version: 1,
      data_type: "gpx",
      data: { tracks: [{ arbitrary: "canonical-data" }], routes: [], waypoints: [] },
    });

    expect(response.status).toBe(200);
  });

  it("rejects malformed JSON bodies", async () => {
    const app = createApp();
    const env = createEnv();

    const response = await app.fetch(new Request("https://worker.example/api/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: "{ not valid json",
    }), env);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid canonical geodata payload" });
  });

  it("rejects an oversized payload", async () => {
    const app = createApp();
    const env = createEnv();

    const response = await app.fetch(new Request("https://worker.example/api/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "Content-Length": String(2 * 1024 * 1024 + 1),
      },
      body: JSON.stringify(validCanonicalPayload),
    }), env);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "payload too large" });
  });

  it("rejects a payload whose actual UTF-8 body size exceeds the limit even without a Content-Length header", async () => {
    const app = createApp();
    const env = createEnv();
    const oversizedPayload = {
      schema_version: 1,
      data_type: "gpx",
      data: {
        tracks: [],
        routes: [],
        waypoints: [],
        padding: "x".repeat(2 * 1024 * 1024),
      },
    };

    const response = await app.fetch(new Request("https://worker.example/api/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(oversizedPayload),
    }), env);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "payload too large" });
  });

  it("returns 404 (not 500) from GET/DELETE when a KV record has no delete_key_hash", async () => {
    const app = createApp();
    const env = createEnv();

    await env.GPX_STORE.put(
      "no-delete-key",
      JSON.stringify({
        content: validCanonicalPayload,
      }),
    );

    const getResponse = await app.fetch(
      new Request(
        "https://worker.example/api/gpx/no-delete-key",
      ),
      env,
    );

    expect(getResponse.status).toBe(200);

    const deleteResponse = await app.fetch(
      new Request(
        "https://worker.example/api/gpx/no-delete-key",
        {
          method: "DELETE",
          headers: {
            "X-Delete-Key": "anything",
            Authorization: `Bearer ${apiToken}`,
          },
        },
      ),
      env,
    );

    expect(deleteResponse.status).toBe(404);
  });
});

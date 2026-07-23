import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import worker from "../src/index.js";
import { uploadResultPage } from "../src/views/upload.js";

const validGpx = "<?xml version=\"1.0\"?><gpx><trk><name>test</name></trk></gpx>";

function createEnv() {
  const entries = new Map();
  const env = {
    GPX_STORE: {
      async put(key, value, options) {
        entries.set(key, JSON.parse(value));
        this.lastPutOptions = options;
      },
      async get(key, type) {
        const value = entries.get(key);
        return type === "json" ? value ?? null : JSON.stringify(value);
      },
      async delete(key) {
        entries.delete(key);
      },
    },
    UPLOAD_RATE_LIMITER: {
      async limit() {
        return { success: true };
      }
    }
  };

  env.entries = entries;
  return env;
}

async function upload(app, env) {
  const formData = new FormData();
  formData.set("file", new File([validGpx], "route.gpx", { type: "application/gpx+xml" }));
  return app.fetch(new Request("https://worker.example/api/upload", {
    method: "POST",
    body: formData,
  }), env);
}

describe("Hono migration compatibility", () => {
  it("escapes dynamic HTML values through Hono's html helper", () => {
    const page = String(uploadResultPage({
      url: 'https://worker.example/api/gpx/x"><script>alert(1)</script>',
      delete_url: "https://worker.example/delete?key=<unsafe>",
    }));

    expect(page).not.toContain("<script>alert(1)</script>");
    expect(page).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(page).toContain("&lt;unsafe&gt;");
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

    expect(Object.keys(result).sort()).toEqual(["delete_url", "id", "url"]);
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
      headers: { "X-Delete-Key": new URL(result.delete_url).searchParams.get("key") },
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
      body: invalid,
    }), env);
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toEqual({ error: "invalid GPX file" });

    const tooLarge = await app.fetch(new Request("https://worker.example/api/upload", {
      method: "POST",
      headers: { "Content-Length": String(2 * 1024 * 1024 + 1) },
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

  it("uses the same upload error message for the browser form", async () => {
    const formData = new FormData();
    formData.set("file", new File(["<gpx></gpx>"], "invalid.gpx"));
    const response = await createApp().fetch(new Request("https://worker.example/upload", {
      method: "POST",
      body: formData,
    }), createEnv());

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=UTF-8");
    expect(await response.text()).toBe("Upload failed: invalid GPX file");
  });

  it("shows the confirmation page and rejects an invalid key", async () => {
    const app = createApp();
    const env = createEnv();
    const result = await (await upload(app, env)).json();
    const confirmation = await app.fetch(new Request(result.delete_url), env);
    expect(confirmation.status).toBe(200);
    expect(await confirmation.text()).toContain("This operation cannot be undone.");

    const rejected = await app.fetch(new Request(`https://worker.example/gpx/${result.id}/delete?key=wrong`), env);
    expect(rejected.status).toBe(403);
    expect(await rejected.text()).toBe("Invalid delete key");
  });
});

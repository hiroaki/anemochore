import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const validGpx = "<?xml version=\"1.0\"?><gpx><trk><name>test</name></trk></gpx>";

function createEnv() {
  const entries = new Map();
  return {
    VIEWER_URL: "https://viewer.example/?existing=value",
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
  };
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
  it("returns the original health response and CORS headers", async () => {
    const response = await createApp().fetch(new Request("https://worker.example/api/health"), createEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("uploads, retrieves, and deletes a GPX with the original JSON fields", async () => {
    const app = createApp();
    const env = createEnv();
    const uploadResponse = await upload(app, env);
    const result = await uploadResponse.json();

    expect(Object.keys(result).sort()).toEqual(["delete_url", "id", "url", "viewer_url"]);
    expect(result.url).toBe(`https://worker.example/api/gpx/${result.id}`);
    expect(result.viewer_url).toBe(`https://viewer.example/?existing=value&gpx=${encodeURIComponent(result.url)}`);
    expect(env.GPX_STORE.lastPutOptions).toEqual({ expirationTtl: 86400 });

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

  it("shows the confirmation page and rejects an invalid key", async () => {
    const app = createApp();
    const env = createEnv();
    const result = await (await upload(app, env)).json();
    const confirmation = await app.fetch(new Request(result.delete_url), env);
    expect(confirmation.status).toBe(200);
    expect(await confirmation.text()).toContain("This operation cannot be undone.");

    const rejected = await app.fetch(new Request(`https://worker.example/api/gpx/${result.id}/delete?key=wrong`), env);
    expect(rejected.status).toBe(403);
    expect(await rejected.text()).toBe("Invalid delete key");
  });
});

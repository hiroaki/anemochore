import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { readBoundedBody, BodyLimitError } from "../src/utils/bounded-body.js";
import { encodeCanonicalJson } from "../src/utils/canonical-json.js";
import { MAX_CANONICAL_JSON_BYTES as cap, MAX_PAYLOAD_BYTES as transport } from "../src/validators/geodata.js";

function canonicalBytes(size) {
  const d = {schema_version: 1, data_type: "gpx", data: {
    tracks: [{segments: [{points: [{coordinates: [0.000001, 0], time: "2026-10-19T00:00:00.1Z"}]}]}], routes: [], waypoints: [],
  }};
  const extra = size - Buffer.byteLength(JSON.stringify(d));
  if (extra < 0) throw new Error("fixture too small");
  d.data.tracks[0].segments[0].points[0].time = "2026-10-19T00:00:00." + "1".repeat(extra + 1) + "Z";
  return d;
}
function env() {
  const entries = new Map();
  return {entries, ANEMOCHORE_API_KEYS: "test", GPX_STORE: {
    put: vi.fn(async (id, value, options) => entries.set(id, {value, options})),
    get: vi.fn(async id => {const record = entries.get(id); return record ? JSON.parse(record.value) : null;}),
    delete: vi.fn(),
  }, UPLOAD_RATE_LIMITER: {limit: async () => ({success: true})}};
}
function upload(app, environment, body, headers = {}) {
  return app.fetch(new Request("https://example/api/upload", {method: "POST", headers: {Authorization: "Bearer test", ...headers}, body, duplex: "half"}), environment);
}
function stream(chunks, cancel = vi.fn()) {
  let index = 0;
  return new ReadableStream({pull(c) {if (index < chunks.length) c.enqueue(chunks[index++]); else c.close();}, cancel}, {highWaterMark: 0});
}
let output;
beforeEach(() => { output = []; for (const name of ["log", "error"]) vi.spyOn(console, name).mockImplementation((...args) => output.push(args.map(String).join(" "))); });
afterEach(() => vi.restoreAllMocks());

describe("B3 canonical content and HTTP transport budgets", () => {
  it("accepts exact 10 MiB, stores the larger envelope and returns exact compact content", async () => {
    const d = canonicalBytes(cap), json = encodeCanonicalJson(d);
    const app = createApp(), environment = env();
    expect(Buffer.byteLength(json)).toBe(cap);
    const response = await upload(app, environment, json);
    expect(response.status).toBe(200);
    const {id, delete_key} = await response.json();
    const {value, options} = environment.entries.get(id);
    expect(Buffer.byteLength(value)).toBeGreaterThan(cap);
    expect(options).toEqual({expirationTtl: 86400});
    expect(JSON.parse(value).content).toEqual(d);
    const retrieval = await app.fetch(new Request(`https://example/api/gpx/${id}`), environment);
    expect(retrieval.status).toBe(200); expect(await retrieval.text()).toBe(json);
    expect(value).not.toContain(delete_key);
  });
  it("rejects valid canonical +1 before any put", async () => {
    const environment = env(); const result = await upload(createApp(), environment, JSON.stringify(canonicalBytes(cap + 1)));
    expect(result.status).toBe(400); expect(await result.json()).toEqual({error: "payload too large"});
    expect(environment.GPX_STORE.put).not.toHaveBeenCalled();
  });
  it("accepts exactly 20 MiB actual HTTP bytes with whitespace and false short length", async () => {
    const json = JSON.stringify(canonicalBytes(256));
    const body = stream([new TextEncoder().encode(json), new Uint8Array(transport - Buffer.byteLength(json)).fill(32)]);
    const environment = env(); const result = await upload(createApp(), environment, body, {"Content-Length": "1"});
    expect(result.status).toBe(200); expect(environment.GPX_STORE.put).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });
  it.each([false, true])("rejects actual 20 MiB +1, chunked=%s, no writes", async chunked => {
    const cancel = vi.fn();
    const body = chunked ? stream([new Uint8Array(transport), new Uint8Array(1)], cancel) : stream([new Uint8Array(transport + 1)], cancel);
    const environment = env(); const result = await upload(createApp(), environment, body, {"Content-Length": "1"});
    expect(result.status).toBe(400); expect(await result.json()).toEqual({error: "payload too large"});
    expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false); expect(environment.GPX_STORE.put).not.toHaveBeenCalled();
  });
  it("accepts escaped representation above content cap when compact content is exactly at cap", async () => {
    const json = JSON.stringify(canonicalBytes(cap)).replace('"schema_version"', '"\\u0073chema_version"');
    expect(Buffer.byteLength(json)).toBe(cap + 5);
    const environment = env(); const result = await upload(createApp(), environment, json, {"Content-Length": "999999999"});
    expect(result.status).toBe(200); expect(environment.GPX_STORE.put).toHaveBeenCalledOnce();
  });
  it("counts multibyte/escaped metadata at the exact content boundary", async () => {
    const d = canonicalBytes(cap); d.data.tracks[0].name = '日本😀\r"\\';
    const extra = Buffer.byteLength(JSON.stringify(d)) - cap;
    const point = d.data.tracks[0].segments[0].points[0];
    point.time = point.time.slice(0, -extra - 1) + "Z";
    const json = encodeCanonicalJson(d); expect(Buffer.byteLength(json)).toBe(cap);
    const environment = env(); const result = await upload(createApp(), environment, json);
    expect(result.status).toBe(200); expect(environment.GPX_STORE.put).toHaveBeenCalledOnce();
  });
  it("does not wait for stalled cancellation before releasing and rejecting", async () => {
    const body = stream([new Uint8Array(5)], vi.fn(() => new Promise(() => {})));
    await expect(readBoundedBody(body, 4)).rejects.toBeInstanceOf(BodyLimitError);
    expect(body.locked).toBe(false);
  });
  it("rejects numeric expansion beyond canonical cap despite a smaller wire body", async () => {
    const json = JSON.stringify(canonicalBytes(cap + 1)).replace("0.000001", "1e-6");
    expect(Buffer.byteLength(json)).toBeLessThan(cap);
    const environment = env(); const result = await upload(createApp(), environment, json);
    expect(result.status).toBe(400); expect(environment.GPX_STORE.put).not.toHaveBeenCalled();
  });
  it("preserves multibyte and escaped text split across single-byte chunks", async () => {
    const d = canonicalBytes(256); d.data.tracks[0].name = '日😀\r"\\';
    const json = encodeCanonicalJson(d); expect(Buffer.byteLength(json)).toBeGreaterThan(json.length);
    const body = stream(Array.from(new TextEncoder().encode(json), b => Uint8Array.of(b)));
    const environment = env(); const result = await upload(createApp(), environment, body);
    expect(result.status).toBe(200); expect(body.locked).toBe(false);
    const {value} = [...environment.entries.values()][0]; expect(JSON.parse(value).content).toEqual(d);
  });
  it.each(['{"PRIVATE_BODY":', '{}', '{"schema_version":1}', 'null']) ("rejects invalid JSON/envelope safely %j", async body => {
    const environment = env(); const result = await upload(createApp(), environment, body);
    expect(result.status).toBe(400); expect(await result.json()).toEqual({error: "invalid canonical geodata payload"});
    expect(environment.GPX_STORE.put).not.toHaveBeenCalled(); expect(output.join()).not.toContain("PRIVATE_BODY");
  });
  it("hides stream/UTF-8 failures without writes", async () => {
    for (const body of [stream([Uint8Array.of(0xff)]), new ReadableStream({pull() {throw new Error("PRIVATE_STREAM");}})]) {
      const environment = env(); const result = await upload(createApp(), environment, body);
      expect(result.status).toBe(400); expect(environment.GPX_STORE.put).not.toHaveBeenCalled(); expect(body.locked).toBe(false);
      expect(await result.text()).not.toContain("PRIVATE");
    }
    expect(output.join()).not.toContain("PRIVATE_STREAM");
  });
  it("rejects oversized stored content with fixed internal error, no private response/logs", async () => {
    const environment = env(); const d = canonicalBytes(cap + 1); d.data.tracks[0].name = "PRIVATE_STORED";
    environment.entries.set("test-id", {value: JSON.stringify({content: d})});
    const response = await createApp().fetch(new Request("https://example/api/gpx/test-id"), environment);
    expect(response.status).toBe(500); expect(await response.text()).not.toContain("PRIVATE_STORED");
    expect(output.join()).not.toContain("PRIVATE_STORED");
  });
  it("retains original overflow when cancellation rejects and releases lock", async () => {
    const cancel = vi.fn(() => Promise.reject(new Error("PRIVATE_CANCEL")));
    const body = stream([new Uint8Array(5)], cancel);
    await expect(readBoundedBody(body, 4)).rejects.toBeInstanceOf(BodyLimitError);
    expect(body.locked).toBe(false); expect(cancel).toHaveBeenCalledOnce();
  });
  it("does not parse or decode until bounded reading completes", async () => {
    const body = stream([new Uint8Array(5)]); const parse = vi.spyOn(JSON, "parse");
    await expect(readBoundedBody(body, 4)).rejects.toBeInstanceOf(BodyLimitError);
    expect(parse).not.toHaveBeenCalled();
  });
});

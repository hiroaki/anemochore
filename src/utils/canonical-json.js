import { MAX_CANONICAL_JSON_BYTES } from "../validators/geodata.js";

export class CanonicalJsonLimitError extends Error {
  constructor() { super("canonical JSON too large"); }
}

export function encodeCanonicalJson(content) {
  const json = JSON.stringify(content);
  if (typeof json !== "string") throw new Error("invalid canonical JSON");
  if (new TextEncoder().encode(json).byteLength > MAX_CANONICAL_JSON_BYTES) {
    throw new CanonicalJsonLimitError();
  }
  return json;
}

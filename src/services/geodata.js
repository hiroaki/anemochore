import { readBoundedBody, BodyLimitError } from "../utils/bounded-body.js";
import { encodeCanonicalJson, CanonicalJsonLimitError } from "../utils/canonical-json.js";
import { UploadError } from "../errors/upload-error.js";
import { MAX_PAYLOAD_BYTES, validateCanonicalPayload } from "../validators/geodata.js";
import { hashDeleteKey, generateDeleteKey } from "../utils/delete-key.js";

const EXPIRATION_SECONDS = 60 * 60 * 24;
const CANONICAL_FORMAT = "canonical-geodata";
const CANONICAL_CONTENT_TYPE = "application/json";

export function createGeodataService({ storage }) {
  return {
    async upload(request) {
      const payload = await readCanonicalPayload(request);
      const id = crypto.randomUUID();
      const deleteKey = generateDeleteKey();
      const deleteKeyHash = await hashDeleteKey(deleteKey);

      await storage.put(id, {
        format: CANONICAL_FORMAT,
        content_type: CANONICAL_CONTENT_TYPE,
        delete_key_hash: deleteKeyHash,
        created_at: new Date().toISOString(),
        content: payload,
      }, {
        expirationTtl: EXPIRATION_SECONDS,
      });

      return {
        id,
        delete_key: deleteKey,
      };
    },

    get(id) {
      return storage.get(id);
    },

    delete(id) {
      return storage.delete(id);
    },
  };
}

async function readCanonicalPayload(request) {
  let payload;
  try {
    const bytes = await readBoundedBody(request.body, MAX_PAYLOAD_BYTES);
    const rawBody = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    payload = JSON.parse(rawBody);
  } catch (error) {
    if (error instanceof BodyLimitError) throw new UploadError("payload too large");
    throw new UploadError("invalid canonical geodata payload");
  }

  if (!validateCanonicalPayload(payload)) {
    throw new UploadError("invalid canonical geodata payload");
  }

  try { encodeCanonicalJson(payload); }
  catch (error) {
    if (error instanceof CanonicalJsonLimitError) throw new UploadError("payload too large");
    throw new UploadError("invalid canonical geodata payload");
  }
  return payload;
}


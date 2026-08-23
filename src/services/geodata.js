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
  const contentLength = request.headers.get("Content-Length");
  if (contentLength && Number(contentLength) > MAX_PAYLOAD_BYTES) {
    throw new UploadError("payload too large");
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new UploadError("payload too large");
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new UploadError("invalid canonical geodata payload");
  }

  if (!validateCanonicalPayload(payload)) {
    throw new UploadError("invalid canonical geodata payload");
  }

  return payload;
}


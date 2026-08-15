import { UploadError } from "../errors/upload-error.js";
import { MAX_UPLOAD_BYTES, validateGeodata } from "../validators/geodata.js";

const EXPIRATION_SECONDS = 60 * 60 * 24;
const GPX_FORMAT = "gpx";
const GPX_CONTENT_TYPE = "application/gpx+xml; charset=utf-8";
const GPX_EXTENSION = "gpx";

export function createGeodataService({ storage, viewerUrl }) {
  return {
    async uploadGpx(request) {
      const content = await readUploadedGpx(request);
      const id = crypto.randomUUID();
      const deleteKey = crypto.randomUUID();

      await storage.put(id, {
        format: GPX_FORMAT,
        content_type: GPX_CONTENT_TYPE,
        extension: GPX_EXTENSION,
        content,
        delete_key: deleteKey,
        created_at: new Date().toISOString(),
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

async function readUploadedGpx(request) {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength && Number(contentLength) > MAX_UPLOAD_BYTES) {
    throw new UploadError("file too large");
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new UploadError("file is required");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError("file too large");
  }

  const content = await file.text();
  if (!validateGeodata(GPX_FORMAT, content)) {
    throw new UploadError("invalid GPX file");
  }

  return content;
}

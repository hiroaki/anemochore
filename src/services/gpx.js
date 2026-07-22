import { createDeleteUrl, createGpxUrl, createViewerUrl } from "../utils/urls.js";
import { MAX_UPLOAD_BYTES, validateGpx } from "../utils/validation.js";

const GPX_EXPIRATION_SECONDS = 60 * 60 * 24;

export async function uploadGpx(request, env) {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength && Number(contentLength) > MAX_UPLOAD_BYTES) {
    throw new Error("file too large");
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("file is required");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("file too large");
  }

  const content = await file.text();
  if (!validateGpx(content)) {
    throw new Error("invalid GPX file");
  }

  const id = crypto.randomUUID();
  const deleteKey = crypto.randomUUID();
  await env.GPX_STORE.put(id, JSON.stringify({ content, delete_key: deleteKey }), {
    expirationTtl: GPX_EXPIRATION_SECONDS,
  });

  const gpxUrl = createGpxUrl(request, id);
  return {
    id,
    url: gpxUrl,
    viewer_url: createViewerUrl(env.VIEWER_URL, gpxUrl),
    delete_url: createDeleteUrl(request, id, deleteKey),
  };
}

export async function getGpx(id, env) {
  return env.GPX_STORE.get(id, "json");
}

export async function deleteGpx(id, env) {
  return env.GPX_STORE.delete(id);
}

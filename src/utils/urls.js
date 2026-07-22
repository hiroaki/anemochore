export function createGpxUrl(request, id) {
  return `${new URL(request.url).origin}/api/gpx/${id}`;
}

export function createDeleteUrl(request, id, deleteKey) {
  const url = new URL(request.url);
  return `${url.origin}/api/gpx/${id}/delete?key=${encodeURIComponent(deleteKey)}`;
}

export function createViewerUrl(viewerUrl, gpxUrl) {
  if (!viewerUrl) return null;

  const url = new URL(viewerUrl);
  url.searchParams.set("gpx", gpxUrl);
  return url.toString();
}

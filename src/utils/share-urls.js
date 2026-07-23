export function createGpxUrl(request, id) {
  return `${new URL(request.url).origin}/api/gpx/${id}`;
}

export function createViewerUrl(viewerUrl, geodataUrl) {
  if (!viewerUrl) return null;

  const url = new URL(viewerUrl);
  url.searchParams.set("gpx", geodataUrl);
  return url.toString();
}

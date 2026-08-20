// Anemochore's own structural/defensive validation of the canonical payload —
// independent of Xylem's semantic validation, never parses GPX/XML itself.
export const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const MAX_TRACKS = 20;
const MAX_SEGMENTS_PER_TRACK = 20;
const MAX_POINTS_PER_SEGMENT = 5000;
const MAX_ROUTES = 20;
const MAX_POINTS_PER_ROUTE = 2000;
const MAX_WAYPOINTS = 500;
const MAX_NAME_LENGTH = 200;
const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;
const MIN_LATITUDE = -90;
const MAX_LATITUDE = 90;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidCoordinates(value) {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) {
    return false;
  }

  const [lon, lat, elevation] = value;

  if (typeof lon !== "number" || !Number.isFinite(lon) || lon < MIN_LONGITUDE || lon > MAX_LONGITUDE) {
    return false;
  }

  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < MIN_LATITUDE || lat > MAX_LATITUDE) {
    return false;
  }

  if (value.length === 3 && (typeof elevation !== "number" || !Number.isFinite(elevation))) {
    return false;
  }

  return true;
}

function isValidOptionalName(value) {
  if (value === undefined) {
    return true;
  }

  return typeof value === "string" && value.length > 0 && value.length <= MAX_NAME_LENGTH;
}

function isValidOptionalTime(value) {
  if (value === undefined) {
    return true;
  }

  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isValidTrack(track) {
  if (!isPlainObject(track)) return false;
  if (!isValidOptionalName(track.name)) return false;

  const { segments } = track;
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > MAX_SEGMENTS_PER_TRACK) {
    return false;
  }

  return segments.every((segment) => {
    if (!isPlainObject(segment)) return false;

    const { points } = segment;
    if (!Array.isArray(points) || points.length === 0 || points.length > MAX_POINTS_PER_SEGMENT) {
      return false;
    }

    return points.every((point) =>
      isPlainObject(point) &&
      isValidCoordinates(point.coordinates) &&
      isValidOptionalTime(point.time));
  });
}

function isValidRoute(route) {
  if (!isPlainObject(route)) return false;
  if (!isValidOptionalName(route.name)) return false;

  const { points } = route;
  if (!Array.isArray(points) || points.length === 0 || points.length > MAX_POINTS_PER_ROUTE) {
    return false;
  }

  return points.every((point) => isPlainObject(point) && isValidCoordinates(point.coordinates));
}

function isValidWaypoint(waypoint) {
  return isPlainObject(waypoint) &&
    isValidCoordinates(waypoint.coordinates) &&
    isValidOptionalName(waypoint.name);
}

export function validateCanonicalGpxPayload(payload) {
  if (!isPlainObject(payload)) return false;
  if (payload.schema_version !== 1) return false;
  if (payload.data_type !== "gpx") return false;
  if (!isPlainObject(payload.data)) return false;

  const { tracks, routes, waypoints } = payload.data;

  if (!Array.isArray(tracks) || tracks.length > MAX_TRACKS || !tracks.every(isValidTrack)) {
    return false;
  }

  if (!Array.isArray(routes) || routes.length > MAX_ROUTES || !routes.every(isValidRoute)) {
    return false;
  }

  if (!Array.isArray(waypoints) || waypoints.length > MAX_WAYPOINTS || !waypoints.every(isValidWaypoint)) {
    return false;
  }

  return tracks.length > 0 || routes.length > 0 || waypoints.length > 0;
}


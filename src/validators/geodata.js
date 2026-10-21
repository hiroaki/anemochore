// Separate actual HTTP transport and serialized canonical-content budgets.
export const MAX_PAYLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_CANONICAL_JSON_BYTES = 10 * 1024 * 1024;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasAllowedValueShape(value) {
  if (Array.isArray(value)) {
    return false;
  }

  if (value === null || value === undefined) {
    return false;
  }

  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "object";
}

// Only validate the minimal canonical envelope required for storage.
// GPX semantics and domain constraints are owned by Xylem.
export function validateCanonicalPayload(payload) {
  if (!isPlainObject(payload)) return false;
  if (payload.schema_version !== 1) return false;
  if (payload.data_type !== "gpx") return false;
  if (!isPlainObject(payload.data)) return false;

  const { tracks, routes, waypoints } = payload.data;

  if (!Array.isArray(tracks) || !Array.isArray(routes) || !Array.isArray(waypoints)) {
    return false;
  }

  return tracks.every(hasAllowedValueShape) && routes.every(hasAllowedValueShape) && waypoints.every(hasAllowedValueShape);
}


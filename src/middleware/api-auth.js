// TODO: Consider implementing token expiration,
// rotation, and a managed API key lifecycle.
export function apiAuth(c, next) {
  const configuredKeys = c.env.ANEMOCHORE_API_KEYS;

  const authorization = c.req.header("Authorization");

  if (!configuredKeys) {
    return c.json({ error: "API key is not configured" }, 500);
  }

  const tokens = configuredKeys
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  let isValid = false;
  for (const token of tokens) {
    if (timingSafeEqual(authorization, `Bearer ${token}`)) {
      isValid = true;
      // Don't break the loop to avoid timing attacks that could reveal valid tokens.
    }
  }
  if (!isValid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
}

// Helper function for timing-safe comparison of two strings
function timingSafeEqual(a, b) {
  const aStr = typeof a === "string" ? a : "";
  const bStr = typeof b === "string" ? b : "";
  const maxLen = Math.max(aStr.length, bStr.length);
  let diff = aStr.length ^ bStr.length;

  for (let i = 0; i < maxLen; i += 1) {
    const aCode = i < aStr.length ? aStr.charCodeAt(i) : 0;
    const bCode = i < bStr.length ? bStr.charCodeAt(i) : 0;
    diff |= aCode ^ bCode;
  }

  return diff === 0;
}

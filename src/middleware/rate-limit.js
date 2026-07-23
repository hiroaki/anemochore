import { apiJson } from "../utils/responses.js";

export async function uploadRateLimit(c, next) {
  const ip =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For") ??
    "unknown";

  const limiter = c.env.UPLOAD_RATE_LIMITER;
  if (!limiter) {
    throw new Error(
      "UPLOAD_RATE_LIMITER binding is not configured."
    );
  }

  const { success } = await limiter.limit({
    key: ip,
  });

  if (!success) {
    if (c.req.path.startsWith("/api/")) {
      return apiJson(c, { error: "rate limit exceeded" }, 429);
    }

    return c.text(
      "Too many upload requests. Please wait a minute and try again.",
      429
    );
  }
  await next();
}

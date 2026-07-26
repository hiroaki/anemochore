import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { handlePreflight } from "./middleware/cors.js";
import { applySecurityHeaders } from "./middleware/security-headers.js";
import { attachServices } from "./middleware/services.js";
import { uploadRateLimit, deleteRateLimit } from "./middleware/rate-limit.js";
import { browserRoutes } from "./routes/browser.js";
import { apiRoutes } from "./routes/api.js";
import { UploadError } from "./errors/upload-error.js";
import { respondError } from "./utils/responses.js";
import { apiAuth } from "./middleware/api-auth.js";

export function createApp() {
  const app = new Hono();

  app.use("*", applySecurityHeaders);
  app.use("*", handlePreflight);
  app.use("*", attachServices);

  app.route("/", browserRoutes);
  app.route("/api", apiRoutes);

  app.notFound((c) => {
    console.warn(`Not Found: ${c.req.method} ${c.req.url}`);
    return respondError(c, "Not Found", 404);
  });

  app.onError((error, c) => {
    console.error(error);

    if (error instanceof UploadError) {
      const status = error.status || 500;
      return respondError(c, error.message, status);
    }

    if (error instanceof HTTPException) {
      return respondError(c, error.message, error.status);
    }

    // Unexpected error should not expose its message to the outside
    return respondError(c, "Internal Server Error", 500);
  });

  return app;
}

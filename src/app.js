import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { handlePreflight } from "./middleware/cors.js";
import { applySecurityHeaders } from "./middleware/security-headers.js";
import { attachServices } from "./middleware/services.js";
import { uploadRateLimit, deleteRateLimit } from "./middleware/rate-limit.js";
import { browserRoutes } from "./routes/browser.js";
import { apiRoutes } from "./routes/api.js";
import { UploadError } from "./errors/upload-error.js";
import { apiJson } from "./utils/responses.js";
import { apiAuth } from "./middleware/api-auth.js";

export function createApp() {
  const app = new Hono();

  app.use("*", applySecurityHeaders);
  app.use("*", handlePreflight);

  app.use("/upload", uploadRateLimit, csrf());
  app.use("/gpx/:id/delete", async (c, next) => {
    if (c.req.method !== "POST") {
      return next();
    }
    await csrf()(c, async () => {
      return deleteRateLimit(c, next);
    });
  });
  app.use("/api/upload", uploadRateLimit, apiAuth);
  app.use("/api/gpx/:id", async (c, next) => {
    if (c.req.method !== "DELETE") {
      return next();
    }
    await apiAuth(c, async () => {
      return deleteRateLimit(c, next);
    });
  });

  app.use("*", attachServices);

  app.route("/", browserRoutes);
  app.route("/api", apiRoutes);
  app.notFound((c) => c.text("Not Found", 404));
  app.onError((error, c) => {
    if (error instanceof UploadError) {
      if (c.req.path === "/api/upload") {
        return apiJson(c, { error: error.message }, error.status);
      }

      if (c.req.path === "/upload") {
        return c.text(`Upload failed: ${error.message}`, error.status);
      }
    }

    console.error(error);
    return c.text("Internal Server Error", 500);
  });

  return app;
}

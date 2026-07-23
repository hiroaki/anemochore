import { Hono } from "hono";
import { handlePreflight } from "./middleware/cors.js";
import { applySecurityHeaders } from "./middleware/security-headers.js";
import { attachServices } from "./middleware/services.js";
import { uploadRateLimit } from "./middleware/rate-limit.js";
import { browserRoutes } from "./routes/browser.js";
import { apiRoutes } from "./routes/api.js";
import { UploadError } from "./errors/upload-error.js";
import { apiJson } from "./utils/responses.js";

export function createApp() {
  const app = new Hono();

  app.use("*", applySecurityHeaders);
  app.use("*", handlePreflight);
  app.use("*", attachServices);
  app.use("/api/upload", uploadRateLimit);
  app.use("/upload", uploadRateLimit);
  app.route("/", browserRoutes);
  app.route("/", apiRoutes);
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

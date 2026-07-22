import { Hono } from "hono";
import { cors } from "./middleware/cors.js";
import { browserRoutes } from "./routes/browser.js";
import { apiRoutes } from "./routes/api.js";

export function createApp() {
  const app = new Hono();

  app.use("*", cors);
  app.route("/", browserRoutes);
  app.route("/", apiRoutes);
  app.notFound((c) => c.text("Not Found", 404));

  return app;
}

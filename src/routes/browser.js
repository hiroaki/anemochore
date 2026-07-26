import { Hono } from "hono";
import { html } from "../utils/responses.js";
import { deleteConfirmationPage, deletedPage } from "../views/delete.js";
import { uploadPage, uploadResultPage } from "../views/upload.js";
import { uploadRateLimit, deleteRateLimit } from "../middleware/rate-limit.js";
import { csrf } from "hono/csrf";

export const browserRoutes = new Hono();

browserRoutes.use("/upload", uploadRateLimit, csrf());
browserRoutes.use("/gpx/:id/delete", async (c, next) => {
  if (c.req.method !== "POST") {
    return next();
  }
  await csrf()(c, async () => {
    return deleteRateLimit(c, next);
  });
});

// Upload page
browserRoutes.get("/", (c) => html(c, uploadPage()));

// Handle GPX file upload
browserRoutes.post("/upload", async (c) => html(
  c,
  uploadResultPage(await c.get("geodata").uploadGpx(c.req.raw)),
));

// Delete confirmation page
browserRoutes.get("/gpx/:id/delete", async (c) => {
  const id = c.req.param("id");
  const key = c.req.query("key");
  const data = await c.get("geodata").get(id);

  if (!data || data.delete_key !== key) {
    return c.text("Invalid delete key", 403);
  }

  return html(c, deleteConfirmationPage(id, key));
});

// Handle deletion of GPX data
browserRoutes.post("/gpx/:id/delete", async (c) => {
  const id = c.req.param("id");
  const formData = await c.req.raw.formData();
  const key = formData.get("key");
  const geodata = c.get("geodata");
  const data = await geodata.get(id);

  if (!data || data.delete_key !== key) {
    return c.text("Invalid delete key", 403);
  }

  await geodata.delete(id);
  return html(c, deletedPage());
});

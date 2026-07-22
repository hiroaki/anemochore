import { Hono } from "hono";
import { html } from "../utils/responses.js";
import { deleteConfirmationPage, deletedPage } from "../views/delete.js";
import { uploadPage, uploadResultPage } from "../views/upload.js";

export const browserRoutes = new Hono();

browserRoutes.get("/", (c) => html(c, uploadPage()));

browserRoutes.post("/upload", async (c) => html(
  c,
  uploadResultPage(await c.get("geodata").uploadGpx(c.req.raw)),
));

browserRoutes.get("/api/gpx/:id/delete", async (c) => {
  const id = c.req.param("id");
  const key = c.req.query("key");
  const data = await c.get("geodata").get(id);

  if (!data || data.delete_key !== key) {
    return c.text("Invalid delete key", 403);
  }

  return html(c, deleteConfirmationPage(id, key));
});

browserRoutes.post("/api/gpx/:id/delete", async (c) => {
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

import { Hono } from "hono";
import { deleteGpx, getGpx, uploadGpx } from "../services/gpx.js";
import { deleteConfirmationPage, deletedPage } from "../views/delete.js";
import { uploadPage, uploadResultPage } from "../views/upload.js";

export const browserRoutes = new Hono();

function html(c, body) {
  return c.body(body, 200, { "Content-Type": "text/html; charset=utf-8" });
}

browserRoutes.get("/", (c) => html(c, uploadPage()));

browserRoutes.post("/upload", async (c) => {
  try {
    const result = await uploadGpx(c.req.raw, c.env);
    return html(c, uploadResultPage(result));
  } catch (error) {
    return c.text(`Upload failed: ${error.message}`, 400);
  }
});

browserRoutes.get("/api/gpx/:id/delete", async (c) => {
  const id = c.req.param("id");
  const key = c.req.query("key");
  const data = await getGpx(id, c.env);

  if (!data || data.delete_key !== key) {
    return c.text("Invalid delete key", 403);
  }

  return html(c, deleteConfirmationPage(id, key));
});

browserRoutes.post("/api/gpx/:id/delete", async (c) => {
  const id = c.req.param("id");
  const formData = await c.req.raw.formData();
  const key = formData.get("key");
  const data = await getGpx(id, c.env);

  if (!data || data.delete_key !== key) {
    return c.text("Invalid delete key", 403);
  }

  await deleteGpx(id, c.env);
  return html(c, deletedPage());
});

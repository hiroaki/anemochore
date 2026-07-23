import { Hono } from "hono";
import { apiCorsHeaders } from "../middleware/cors.js";
import { apiJson } from "../utils/responses.js";

export const apiRoutes = new Hono();

apiRoutes.get("/health", (c) => apiJson(c, { status: "ok" }));

apiRoutes.post("/upload", async (c) => apiJson(
  c,
  await c.get("geodata").uploadGpx(c.req.raw),
));

apiRoutes.get("/gpx/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return c.text("Not Found", 404);

  const data = await c.get("geodata").get(id);
  if (!data) return apiJson(c, { error: "not found" }, 404);

  return c.body(data.content, 200, apiCorsHeaders({
    "Content-Type": data.content_type || "application/gpx+xml; charset=utf-8",
  }));
});

apiRoutes.delete("/gpx/:id", async (c) => {
  const id = c.req.param("id");
  const geodata = c.get("geodata");
  const data = await geodata.get(id);

  if (!data) return apiJson(c, { error: "not found" }, 404);

  const deleteKey = c.req.header("X-Delete-Key");
  if (!deleteKey || deleteKey !== data.delete_key) {
    return apiJson(c, { error: "invalid delete key" }, 403);
  }

  await geodata.delete(id);
  return apiJson(c, { deleted: true });
});

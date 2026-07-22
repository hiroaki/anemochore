import { Hono } from "hono";
import { withCors } from "../middleware/cors.js";
import { deleteGpx, getGpx, uploadGpx } from "../services/gpx.js";

export const apiRoutes = new Hono();

apiRoutes.get("/api/health", (c) => c.json({ status: "ok" }, 200, withCors()));

apiRoutes.post("/api/upload", async (c) => {
  try {
    return c.json(await uploadGpx(c.req.raw, c.env), 200, withCors());
  } catch (error) {
    return c.json({ error: error.message }, 400, withCors());
  }
});

apiRoutes.get("/api/gpx/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return c.text("Not Found", 404);

  const data = await getGpx(id, c.env);
  if (!data) return c.json({ error: "not found" }, 404, withCors());

  return c.body(data.content, 200, withCors({
    "Content-Type": "application/gpx+xml; charset=utf-8",
  }));
});

apiRoutes.delete("/api/gpx/*", async (c) => {
  const id = c.req.path.split("/").pop();
  const data = await getGpx(id, c.env);

  if (!data) return c.json({ error: "not found" }, 404, withCors());

  const deleteKey = c.req.header("X-Delete-Key");
  if (!deleteKey || deleteKey !== data.delete_key) {
    return c.json({ error: "invalid delete key" }, 403, withCors());
  }

  await deleteGpx(id, c.env);
  return c.json({ deleted: true }, 200, withCors());
});

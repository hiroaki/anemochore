import { Hono } from "hono";
import { apiJson } from "../utils/responses.js";
import { uploadRateLimit, deleteRateLimit } from "../middleware/rate-limit.js";
import { apiAuth } from "../middleware/api-auth.js";
import { emitAuditEvent } from "../utils/audit.js";

export const apiRoutes = new Hono();

apiRoutes.use("/upload", uploadRateLimit, apiAuth);
apiRoutes.use("/gpx/:id", async (c, next) => {
  if (c.req.method !== "DELETE") {
    return next();
  }
  await apiAuth(c, async () => {
    return deleteRateLimit(c, next);
  });
});

// Health check endpoint
apiRoutes.get("/health", (c) => apiJson(c, { status: "ok" }));

// Upload endpoint
apiRoutes.post("/upload", async (c) => {
  emitAuditEvent(c, "upload_received", { result: "success" });

  let result;
  try {
    result = await c.get("geodata").upload(c.req.raw);
  } catch (error) {
    emitAuditEvent(c, "kv_stored", {
      result: "failure",
      failure_reason: "kv_write_failed",
      error_message: error?.message ?? "unknown error",
    });
    throw error;
  }

  emitAuditEvent(c, "kv_stored", {
    result: "success",
    status: 200,
    gpx_id: result.id,
  });

  return apiJson(c, result);
});

// Get GPX data by ID
apiRoutes.get("/gpx/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return c.text("Not Found", 404);

  emitAuditEvent(c, "gpx_retrieval_requested", {
    result: "success",
    gpx_id: id,
  });

  let data;
  try {
    data = await c.get("geodata").get(id);
  } catch (error) {
    emitAuditEvent(c, "kv_fetched", {
      result: "failure",
      gpx_id: id,
      failure_reason: "kv_read_failed",
      error_message: error?.message ?? "unknown error",
    });
    throw error;
  }

  // Defensive: treat records without a canonical `content` payload (missing,
  // or from a pre-migration storage shape) as not found rather than crashing.
  if (!data || typeof data.content !== "object" || data.content === null) {
    emitAuditEvent(c, "kv_fetched", {
      result: "failure",
      status: 404,
      gpx_id: id,
      failure_reason: "kv_not_found",
    });
    return apiJson(c, { error: "Not found" }, 404);
  }

  emitAuditEvent(c, "kv_fetched", {
    result: "success",
    status: 200,
    gpx_id: id,
  });

  // Only the canonical payload is ever returned — service metadata (delete_key,
  // created_at, format, content_type) never leaves this response.
  return apiJson(c, data.content);
});

// Delete GPX data by ID
apiRoutes.delete("/gpx/:id", async (c) => {
  const id = c.req.param("id");
  const geodata = c.get("geodata");

  emitAuditEvent(c, "gpx_deletion_requested", {
    result: "success",
    gpx_id: id,
  });

  const data = await geodata.get(id);

  if (!data || typeof data.delete_key !== "string") {
    emitAuditEvent(c, "kv_deleted", {
      result: "failure",
      status: 404,
      gpx_id: id,
      failure_reason: "kv_not_found",
    });
    return apiJson(c, { error: "Not found" }, 404);
  }

  const deleteKey = c.req.header("X-Delete-Key");
  if (!deleteKey || deleteKey !== data.delete_key) {
    emitAuditEvent(c, "gpx_deletion_rejected", {
      result: "failure",
      status: 403,
      gpx_id: id,
      failure_reason: "invalid_delete_key",
    });
    return apiJson(c, { error: "invalid delete key" }, 403);
  }

  try {
    await geodata.delete(id);
  } catch (error) {
    emitAuditEvent(c, "kv_deleted", {
      result: "failure",
      gpx_id: id,
      failure_reason: "kv_delete_failed",
      error_message: error?.message ?? "unknown error",
    });
    throw error;
  }

  emitAuditEvent(c, "kv_deleted", {
    result: "success",
    status: 200,
    gpx_id: id,
  });
  return apiJson(c, { deleted: true });
});

import { Hono } from "hono";
import { html } from "../utils/responses.js";
import { deleteConfirmationPage, deletedPage } from "../views/delete.js";
import { uploadPage, uploadResultPage } from "../views/upload.js";
import { uploadRateLimit, deleteRateLimit } from "../middleware/rate-limit.js";
import { csrf } from "hono/csrf";
import { emitAuditEvent } from "../utils/audit.js";

export const browserRoutes = new Hono();

browserRoutes.use("*", async (c, next) => {
  const requestId = c.req.header("X-Request-Id") ?? c.req.header("x-request-id");
  if (!requestId && !c.get("generatedRequestId")) {
    c.set("generatedRequestId", crypto.randomUUID());
  }
  await next();
});

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
browserRoutes.post("/upload", async (c) => {
  emitAuditEvent(c, "upload_received", { result: "success", entrypoint: "browser" });

  let result;
  try {
    result = await c.get("geodata").uploadGpx(c.req.raw);
  } catch (error) {
    emitAuditEvent(c, "kv_stored", {
      result: "failure",
      failure_reason: "kv_write_failed",
      error_message: error?.message ?? "unknown error",
      entrypoint: "browser",
    });
    throw error;
  }

  emitAuditEvent(c, "kv_stored", {
    result: "success",
    status: 200,
    gpx_id: result.id,
    entrypoint: "browser",
  });

  return html(c, uploadResultPage(result));
});

// Delete confirmation page
browserRoutes.get("/gpx/:id/delete", async (c) => {
  const id = c.req.param("id");
  const key = c.req.query("key");
  emitAuditEvent(c, "delete_confirmation_viewed", {
    result: "success",
    gpx_id: id,
    entrypoint: "browser",
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
      entrypoint: "browser",
    });
    throw error;
  }

  if (!data || data.delete_key !== key) {
    emitAuditEvent(c, "gpx_deletion_rejected", {
      result: "failure",
      status: 403,
      gpx_id: id,
      failure_reason: "invalid_delete_key",
      entrypoint: "browser",
    });
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

  emitAuditEvent(c, "gpx_deletion_requested", {
    result: "success",
    gpx_id: id,
    entrypoint: "browser",
  });

  let data;
  try {
    data = await geodata.get(id);
  } catch (error) {
    emitAuditEvent(c, "kv_fetched", {
      result: "failure",
      gpx_id: id,
      failure_reason: "kv_read_failed",
      error_message: error?.message ?? "unknown error",
      entrypoint: "browser",
    });
    throw error;
  }

  if (!data || data.delete_key !== key) {
    emitAuditEvent(c, "gpx_deletion_rejected", {
      result: "failure",
      status: 403,
      gpx_id: id,
      failure_reason: "invalid_delete_key",
      entrypoint: "browser",
    });
    return c.text("Invalid delete key", 403);
  }

  try {
    await geodata.delete(id);
  } catch (error) {
    emitAuditEvent(c, "kv_deleted", {
      result: "failure",
      gpx_id: id,
      failure_reason: "kv_delete_failed",
      error_message: error?.message ?? "unknown error",
      entrypoint: "browser",
    });
    throw error;
  }

  emitAuditEvent(c, "kv_deleted", {
    result: "success",
    status: 200,
    gpx_id: id,
    entrypoint: "browser",
  });
  return html(c, deletedPage());
});

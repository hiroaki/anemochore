import { apiCorsHeaders } from "../middleware/cors.js";

export function apiJson(c, body, status = 200) {
  return c.json(body, status, apiCorsHeaders());
}

export function html(c, body) {
  return c.body(String(body), 200, { "Content-Type": "text/html; charset=utf-8" });
}

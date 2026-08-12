export function buildAuditMetadata(c, extra = {}) {
  const requestId =
    c.req.header("X-Request-Id") ??
    c.req.header("x-request-id") ??
    c.get("generatedRequestId") ??
    null;
  const callerIp =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("cf-connecting-ip") ??
    null;
  // Browser routes are direct callers, so the connected IP is the end user IP when no intermediary supplies X-Client-IP.
  const clientIp =
    c.req.header("X-Client-IP") ??
    c.req.header("x-client-ip") ??
    callerIp ??
    null;

  return {
    timestamp: new Date().toISOString(),
    service: "anemochore",
    ...(requestId ? { request_id: requestId } : {}),
    ...(clientIp ? { client_ip: clientIp } : {}),
    ...(callerIp ? { caller_ip: callerIp } : {}),
    method: c.req.method,
    path: c.req.path,
    ...extra,
  };
}

export function emitAuditEvent(c, event, payload = {}) {
  const entry = {
    ...buildAuditMetadata(c),
    event,
    ...(payload.result !== undefined ? { result: payload.result } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.gpx_id !== undefined ? { gpx_id: payload.gpx_id } : {}),
    ...(payload.failure_reason !== undefined ? { failure_reason: payload.failure_reason } : {}),
    ...(payload.error_message !== undefined ? { error_message: payload.error_message } : {}),
    ...(payload.entrypoint !== undefined ? { entrypoint: payload.entrypoint } : {}),
  };

  console.log(JSON.stringify(entry));
}

export function resultFromStatus(status) {
  return status >= 400 ? "failure" : "success";
}

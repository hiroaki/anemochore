const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Delete-Key",
};

export function cors(c, next) {
  if (c.req.method === "OPTIONS") {
    return c.body(null, 200, headers);
  }

  return next();
}

export function withCors(headersToMerge = {}) {
  return { ...headers, ...headersToMerge };
}

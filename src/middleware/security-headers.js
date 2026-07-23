const securityHeaders = {
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

export async function applySecurityHeaders(c, next) {
  for (const [name, value] of Object.entries(securityHeaders)) {
    c.header(name, value);
  }

  await next();
}

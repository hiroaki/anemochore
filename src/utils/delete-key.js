export function generateDeleteKey() {
  return crypto.randomUUID();
}

export async function hashDeleteKey(deleteKey) {
  const data = new TextEncoder().encode(deleteKey);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

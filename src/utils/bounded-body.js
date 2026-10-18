export class BodyLimitError extends Error {
  constructor() { super("payload too large"); }
}

// Count actual bytes, independently of Content-Length. Retain no overflow chunk.
export async function readBoundedBody(body, limit) {
  let reader;
  const chunks = [];
  let length = 0;
  try {
    reader = body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.byteLength > limit - length) throw new BodyLimitError();
        length += value.byteLength;
        if (value.byteLength) chunks.push(value.slice());
      }
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch (error) {
    // Cancellation can reject or stall; never replace the original rejection.
    if (reader) void reader.cancel().catch(() => {});
    if (error instanceof BodyLimitError) throw error;
    throw new Error("request body read failed");
  } finally {
    chunks.length = 0;
    reader?.releaseLock();
  }
}

import { createGeodataService } from "../services/geodata.js";
import { createStorage } from "../services/storage.js";

export async function attachServices(c, next) {
  const storage = createStorage(c.env.GPX_STORE);
  c.set("geodata", createGeodataService({
    storage,
    viewerUrl: c.env.VIEWER_URL,
  }));

  await next();
}

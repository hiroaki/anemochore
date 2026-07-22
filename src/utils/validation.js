import { XMLParser } from "fast-xml-parser";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export function validateGpx(content) {
  const parser = new XMLParser({ ignoreAttributes: false });

  try {
    const parsed = parser.parse(content);
    if (!parsed.gpx) return false;

    const { gpx } = parsed;
    return Boolean(gpx.trk || gpx.rte || gpx.wpt);
  } catch {
    return false;
  }
}

import { XMLParser, XMLValidator } from "fast-xml-parser";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const validators = {
  gpx: validateGpx,
};

export function validateGeodata(format, content) {
  return validators[format]?.(content) ?? false;
}

function validateGpx(content) {
  const parser = new XMLParser({ ignoreAttributes: false });

  try {
    if (XMLValidator.validate(content) !== true) return false;

    const parsed = parser.parse(content);
    if (!parsed.gpx) return false;

    const { gpx } = parsed;
    return Boolean(gpx.trk || gpx.rte || gpx.wpt);
  } catch {
    return false;
  }
}

export class UploadError extends Error {
  constructor(message) {
    super(message);
    this.name = "UploadError";
    this.status = 400;
  }
}

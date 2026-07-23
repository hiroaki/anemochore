import { html } from "hono/html";
import { page } from "./layout.js";

export function uploadPage() {
  return page("Anemochore", html`

<h1>Anemochore</h1>

<form method="POST" action="/upload" enctype="multipart/form-data">
  <input type="file" name="file" accept=".gpx">
  <button type="submit">Upload</button>
</form>
`);
}

export function uploadResultPage(result) {
  return page("Uploaded", html`

<h1>Uploaded</h1>

<p>
GPX URL:
<br>
<a href="${result.url}">
${result.url}
</a>
</p>

<p>
Delete URL:
<br>
<a href="${result.delete_url}">
${result.delete_url}
</a>
</p>
`);
}

import { html } from "hono/html";
import { page } from "./layout.js";

export function deleteConfirmationPage(id, key) {
  return page("Delete GPX", html`

<h1>Delete GPX</h1>

<p>
This operation cannot be undone.
</p>

<form method="POST" action="/gpx/${id}/delete">
<input type="hidden" name="key" value="${key}">
<button type="submit">
Delete
</button>
</form>
`);
}

export function deletedPage() {
  return page("Deleted", html`

<h1>Deleted</h1>

<p>
The GPX file has been deleted.
</p>
`);
}

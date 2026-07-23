import { html } from "hono/html";

export function page(title, body) {
  return html`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
</head>
<body>
${body}
</body>
</html>
`;
}

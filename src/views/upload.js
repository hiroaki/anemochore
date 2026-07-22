export function uploadPage() {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Anemochore</title>
</head>
<body>

<h1>Anemochore</h1>

<form method="POST" action="/upload" enctype="multipart/form-data">
  <input type="file" name="file" accept=".gpx">
  <button type="submit">Upload</button>
</form>

</body>
</html>
`;
}

export function uploadResultPage(result) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Uploaded</title>
</head>
<body>

<h1>Uploaded</h1>

<p>
GPX URL:
<br>
<a href="${result.url}">
${result.url}
</a>
</p>

${result.viewer_url ? `
<p>
View:
<br>
<a href="${result.viewer_url}">
${result.viewer_url}
</a>
</p>
` : ""}

<p>
Delete URL:
<br>
<a href="${result.delete_url}">
${result.delete_url}
</a>
</p>

</body>
</html>
`;
}

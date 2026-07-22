export function deleteConfirmationPage(id, key) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Delete GPX</title>
</head>
<body>

<h1>Delete GPX</h1>

<p>
This operation cannot be undone.
</p>

<form method="POST" action="/api/gpx/${id}/delete">
<input type="hidden" name="key" value="${key}">
<button type="submit">
Delete
</button>
</form>

</body>
</html>
`;
}

export function deletedPage() {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Deleted</title>
</head>
<body>

<h1>Deleted</h1>

<p>
The GPX file has been deleted.
</p>

</body>
</html>
`;
}

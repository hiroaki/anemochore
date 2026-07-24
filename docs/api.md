# Anemochore API Specification


## Overview

Anemochore is a lightweight API service for temporarily storing geographic data files and sharing them through URLs.

Currently, Anemochore supports GPX files.

The service does not provide user accounts or ownership management. Uploaded data is treated as publicly accessible data during its lifetime.


## Authentication

Anemochore uses Bearer token authentication for write operations.

The following endpoints require authentication:

- `POST /api/upload`
- `DELETE /api/gpx/:id`

Required header:

```http
Authorization: Bearer <token>
```

API tokens are currently issued and managed manually by the service administrator.

Read-only operations do not require authentication.

Deletion operations additionally require a deletion key issued at upload time.

The deletion key:

- is generated randomly for each upload
- must be treated as a secret
- is only returned in the upload response
- is not included in GPX retrieval responses


## Upload API

### POST /api/upload

Uploads a GPX file and creates a temporary shared resource.

### Authentication

Required:

```http
Authorization: Bearer <token>
```

### Request

| Name | Type | Required | Description |
|---|---|---|---|
| file | File | Yes | GPX file to upload. Request Content-Type must be `multipart/form-data`. |

The original filename is not stored or returned.

This is intentional to avoid exposing potentially sensitive information contained in filenames.

### Response

| Status Code | Message | Example |
|---|---|---|
| 200 OK | Upload succeeded | See success response below |
| 400 Bad Request | Invalid request or invalid GPX file | `{ "error": "file too large" }` |
| 401 Unauthorized | Missing or invalid Bearer token | `{ "error": "unauthorized" }` |
| 429 Too Many Requests | Rate limit exceeded | `{ "error": "rate limit exceeded" }` |

Success response:

```json
{
  "id": "abc123",
  "url": "https://example.com/api/gpx/abc123",
  "delete_key": "xxxxxxxx"
}
```

| Field | Description |
|---|---|
| id | Unique identifier of the stored GPX data |
| url | URL for retrieving the GPX data |
| delete_key | Secret key required for deletion |


### Limitations

| Item | Value | Description |
|---|---|---|
| Maximum upload size | 2 MB | Larger files are rejected. |
| Storage lifetime | 24 hours | Data is automatically deleted after expiration. |
| Rate limit | 10 requests / 60 seconds | Applied to upload requests. |

---

## GPX Retrieval API

### GET /api/gpx/:id

Retrieves a stored GPX file.

### Request

| Name | Type | Required | Description |
|---|---|---|---|
| id | Path parameter | Yes | Identifier of the stored GPX data. |

### Response

| Status Code | Message | Example |
|---|---|---|
| 200 OK | GPX data returned | GPX XML document |
| 404 Not Found | Resource does not exist or has expired | `{ "error": "not found" }` |

Success response:

Content-Type:

```
application/gpx+xml; charset=utf-8
```

Response body:

```xml
<gpx>
...
</gpx>
```

### Limitations

| Item | Value | Description |
|---|---|---|
| Storage lifetime | 24 hours | Expired resources cannot be retrieved. |

---

## Delete API

### DELETE /api/gpx/:id

Deletes a stored GPX file.

### Authentication

Required:

```http
Authorization: Bearer <token>
```

### Request

| Name | Type | Required | Description |
|---|---|---|---|
| id | Path parameter | Yes | Identifier of the stored GPX data. |
| X-Delete-Key | Header | Yes | Delete key issued when uploading the GPX file. |

### Response

| Status Code | Message | Example |
|---|---|---|
| 200 OK | Delete succeeded | `{ "deleted": true }` |
| 401 Unauthorized | Missing or invalid Bearer token | `{ "error": "unauthorized" }` |
| 403 Forbidden | Invalid delete key | `{ "error": "invalid delete key" }` |
| 404 Not Found | Resource does not exist or has expired | `{ "error": "not found" }` |
| 429 Too Many Requests | Rate limit exceeded | `{ "error": "rate limit exceeded" }` |


### Limitations

| Item | Value | Description |
|---|---|---|
| Rate limit | 10 requests / 60 seconds | Applied to delete requests. |

---

## Health Check API

### GET /api/health

Checks whether the API service is running.

### Request

No parameters required.

### Response

| Status Code | Message | Example |
|---|---|---|
| 200 OK | Service is available | `{ "status": "ok" }` |


---

## Error Response Format

API errors use the following common format:

```json
{
  "error": "error message"
}
```

The HTTP status code indicates the category of the error.

| Status Code | Meaning |
|---|---|
| 400 Bad Request | Invalid request |
| 401 Unauthorized | Authentication required or failed |
| 403 Forbidden | Operation not allowed |
| 404 Not Found | Resource does not exist |
| 429 Too Many Requests | Rate limit exceeded |
| 500 Internal Server Error | Server error |

The error message is intended for diagnostics and may change between versions.

Clients should rely primarily on HTTP status codes.

---

## Storage Policy

Uploaded GPX data is stored temporarily.

| Item | Description |
|---|---|
| Storage backend | Cloudflare Workers KV |
| Lifetime | 24 hours |
| User accounts | Not supported |
| Original filename | Not stored |

Stored metadata includes:

```json
{
  "format": "gpx",
  "content_type": "application/gpx+xml; charset=utf-8",
  "extension": "gpx",
  "content": "...",
  "delete_key": "...",
  "created_at": "..."
}
```

---

## Privacy Considerations

Anemochore does not associate uploaded data with user accounts.

Uploaded GPX files may contain location information. Users should ensure that the uploaded data is appropriate for public sharing.

The service does not attempt to determine ownership of uploaded files.

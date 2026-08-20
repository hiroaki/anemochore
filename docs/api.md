# Anemochore API Specification


## Overview

Anemochore is a lightweight API service for temporarily storing canonical geodata and sharing it through URLs.

Anemochore does not parse, validate, or convert GPX/GeoJSON/XML itself. It only accepts, stores, and returns a canonical JSON payload; parsing and normalization of user-supplied GPX/GeoJSON is entirely Xylem's responsibility. In practice, Anemochore's API is called by Xylem, not directly by browsers.

Currently, the canonical payload's `data_type` is always `"gpx"`. GeoJSON support (`data_type: "geojson"`) is planned for a future phase.

The service does not provide user accounts or ownership management. Uploaded data is treated as publicly accessible data during its lifetime.

### Canonical geodata payload

The canonical payload is the only body Anemochore ever reads or returns for `/api/upload` and `/api/gpx/:id`:

```json
{
  "schema_version": 1,
  "data_type": "gpx",
  "data": {
    "tracks": [],
    "routes": [],
    "waypoints": []
  }
}
```

Internally, Anemochore stores this payload alongside its own service metadata (`delete_key`, `created_at`, `format`, `content_type`) in a single KV record, but the canonical payload itself never contains service metadata, and service metadata is never returned from `GET /api/gpx/:id`.


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
- is not included in geodata retrieval responses (service metadata never appears in `GET /api/gpx/:id`)


## Upload API

### POST /api/upload

Accepts a canonical geodata payload and creates a temporary shared resource. The caller (Xylem) is responsible for having already parsed/validated/normalized the original GPX/GeoJSON; Anemochore performs only structural/defensive validation of the payload shape (required fields, types, array bounds, coordinate ranges, size/count limits) — it never parses GPX/XML.

### Authentication

Required:

```http
Authorization: Bearer <token>
```

### Request

| Name | Type | Required | Description |
|---|---|---|---|
| (body) | JSON | Yes | Canonical geodata payload. Request Content-Type must be `application/json`. |

### Response

| Status Code | Message | Example |
|---|---|---|
| 200 OK | Upload succeeded | See success response below |
| 400 Bad Request | Invalid or oversized canonical payload | `{ "error": "invalid canonical geodata payload" }` |
| 401 Unauthorized | Missing or invalid Bearer token | `{ "error": "unauthorized" }` |
| 429 Too Many Requests | Rate limit exceeded | `{ "error": "rate limit exceeded" }` |

Success response:

```json
{
  "id": "abc123",
  "delete_key": "xxxxxxxx"
}
```

| Field | Description |
|---|---|
| id | Unique identifier of the stored geodata |
| delete_key | Secret key required for deletion |

No other field (e.g. service metadata such as `created_at` or `format`) is ever included in this response.

### Limitations

| Item | Value | Description |
|---|---|---|
| Maximum payload size | 2 MB | Larger payloads are rejected. |
| Storage lifetime | 24 hours | Data is automatically deleted after expiration. |
| Rate limit | 10 requests / 60 seconds | Applied to upload requests. |

---

## Geodata Retrieval API

### GET /api/gpx/:id

Retrieves stored canonical geodata.

### Request

| Name | Type | Required | Description |
|---|---|---|---|
| id | Path parameter | Yes | Identifier of the stored geodata. |

### Response

| Status Code | Message | Example |
|---|---|---|
| 200 OK | Canonical geodata returned | See success response below |
| 404 Not Found | Resource does not exist, has expired, or is not in the current canonical shape | `{ "error": "Not found" }` |

Success response:

Content-Type:

```
application/json
```

Response body is exactly the canonical geodata payload — never the outer KV record, so `delete_key`/`created_at`/`format`/`content_type` are structurally impossible to leak here:

```json
{
  "schema_version": 1,
  "data_type": "gpx",
  "data": {
    "tracks": [],
    "routes": [],
    "waypoints": []
  }
}
```

Converting this back into GPX/GeoJSON (or any other display format) is the caller's (Xylem's) responsibility, not Anemochore's.

### Limitations

| Item | Value | Description |
|---|---|---|
| Storage lifetime | 24 hours | Expired resources cannot be retrieved. |

---

## Delete API

### DELETE /api/gpx/:id

Deletes stored geodata.

### Authentication

Required:

```http
Authorization: Bearer <token>
```

### Request

| Name | Type | Required | Description |
|---|---|---|---|
| id | Path parameter | Yes | Identifier of the stored geodata. |
| X-Delete-Key | Header | Yes | Delete key issued when uploading the geodata. |

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

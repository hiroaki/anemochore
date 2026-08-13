[Japanese README](README.ja.md)

# Anemochore

Anemochore is a Cloudflare Workers + Hono application that temporarily stores GPX files and generates sharing URLs.

Currently, Anemochore supports GPX files only. Stored data includes format metadata, allowing additional geographic data formats to be supported in the future.

## Requirements

- Node.js 22 or later
- npm
- Cloudflare account and Wrangler authentication
- Workers KV Namespace

## Installation

```bash
npm install
```

If installation fails due to native dependencies of `sharp`, use:

```bash
SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install
```

## Configuration and Local Development

Configuration files are not committed. Create them from samples:

```bash
cp wrangler.jsonc.sample wrangler.jsonc
cp .dev.vars.sample .dev.vars # only if needed
```

### Creating Workers KV Namespace

Create a KV Namespace for storing uploaded data.

The binding name must match the application configuration: `GPX_STORE`.

```bash
npx wrangler kv namespace create GPX_STORE
```

Set the generated ID in `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "GPX_STORE",
    "id": "YOUR_KV_NAMESPACE_ID"
  }
]
```

### Creating Rate Limit Bindings

Create a rate limiter for file uploads.

The default configuration limits uploads to 10 requests per 60 seconds.

```bash
npx wrangler rate-limit create UPLOAD_RATE_LIMITER --simple 10 60
```

Create a rate limiter for delete requests.

```bash
npx wrangler rate-limit create DELETE_RATE_LIMITER --simple 10 60
```

Configure both bindings in `wrangler.jsonc`:

```jsonc
"ratelimits": [
  {
    "name": "UPLOAD_RATE_LIMITER",
    "namespace_id": "YOUR_UPLOAD_RATE_LIMITER_ID",
    "simple": {
      "limit": 10,
      "period": 60
    }
  },
  {
    "name": "DELETE_RATE_LIMITER",
    "namespace_id": "YOUR_DELETE_RATE_LIMITER_ID",
    "simple": {
      "limit": 10,
      "period": 60
    }
  }
]
```

### API Key Configuration

Restricted endpoints require Bearer authentication.

Allowed API keys must be configured as the secret `ANEMOCHORE_API_KEYS`.

Multiple API keys can be specified as a comma-separated list.

```bash
npx wrangler secret put ANEMOCHORE_API_KEYS
```

API keys are sent by clients using the Bearer token format:

```http
Authorization: Bearer <API_KEY>
```

Rotate API keys when necessary.

Clients must keep API keys confidential. Avoid exposing API keys on client-side applications and store them securely on servers.

## Stored Data

Uploaded data is stored in Workers KV as JSON metadata.

Stored data is automatically deleted after 24 hours using TTL.

```json
{
  "format": "gpx",
  "content_type": "application/gpx+xml; charset=utf-8",
  "extension": "gpx",
  "content": "...",
  "delete_key": "...",
  "created_at": "2026-07-22T00:00:00.000Z"
}
```

The `delete_key` is a randomly generated secret used to authorize deletion of an individual resource.

## Development Server

```bash
npm run dev
```

## Tests

```bash
npm test
```

## Deployment

```bash
npm run deploy:staging
npm run deploy:production
```

## API Specification

See [API Documentation](docs/api.md) for details on the API endpoints, request formats, and response formats.


## License

This project is licensed under the Zero-Clause BSD License (0BSD). See the [LICENSE](LICENSE) file for details.

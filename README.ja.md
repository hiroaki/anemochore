[English README](README.md)

# Anemochore

Anemochore は、GPX ファイルを一時保存し、共有 URL を発行する Cloudflare Workers + Hono アプリケーションです。

現在、Anemochore は GPX ファイルのみをサポートしています。保存データにはフォーマット情報を含めており、将来的に追加の地理データ形式をサポートできる構成になっています。

## 必要環境

- Node.js 22 以降
- npm
- Cloudflare アカウントと Wrangler 認証
- Workers KV Namespace

## インストール

```bash
npm install
```

`sharp` のネイティブ依存関係による問題でインストールに失敗する場合は、以下を使用してください。

```bash
SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install
```

## 設定とローカル開発

設定ファイルはコミットしません。サンプルから作成してください。

```bash
cp wrangler.jsonc.sample wrangler.jsonc
cp .dev.vars.sample .dev.vars # 必要な場合のみ
```

### Workers KV Namespace の作成

アップロードされたデータを保存するための KV Namespace を作成します。

Binding 名はアプリケーション設定と一致する `GPX_STORE` にしてください。

```bash
npx wrangler kv namespace create GPX_STORE
```

作成時に出力された ID を `wrangler.jsonc` に設定します。

```jsonc
"kv_namespaces": [
  {
    "binding": "GPX_STORE",
    "id": "YOUR_KV_NAMESPACE_ID"
  }
]
```

### Rate Limit Binding の作成

ファイルアップロード用の Rate Limit を作成します。

デフォルト設定では、1 分間に 10 回までのアップロードを許可します。

```bash
npx wrangler rate-limit create UPLOAD_RATE_LIMITER --simple 10 60
```

削除リクエスト用の Rate Limit を作成します。

```bash
npx wrangler rate-limit create DELETE_RATE_LIMITER --simple 10 60
```

作成した Binding を `wrangler.jsonc` に設定します。

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

### API Key の設定

制限されたエンドポイントでは Bearer 認証を要求します。

アクセスを許可する API Key は、Secret `ANEMOCHORE_API_KEYS` に設定します。

複数の API Key を指定する場合は、カンマ区切りで設定できます。

```bash
npx wrangler secret put ANEMOCHORE_API_KEYS
```

API Key は Bearer トークン形式で送信します。

```http
Authorization: Bearer <API_KEY>
```

必要に応じて API Key をローテーションしてください。

API Key は秘密情報として扱う必要があります。クライアント側アプリケーションに露出させず、サーバー側で安全に管理してください。

## 保存データ

アップロードされたデータは Workers KV に JSON メタデータとして保存されます。

保存データは TTL により 24 時間後に自動削除されます。

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

`delete_key` はアップロードごとにランダム生成される秘密情報で、個別リソースの削除認証に使用します。

## 開発サーバー

```bash
npm run dev
```

## テスト

```bash
npm test
```

## デプロイ

```bash
npm run deploy:staging
npm run deploy:production
```

## API 仕様

詳細は [API ドキュメント](docs/api.md) を参照してください。API エンドポイント、リクエスト形式、レスポンス形式の詳細が記載されています。


## ライセンス

このプロジェクトは Zero-Clause BSD License (0BSD) の下で提供されています。詳細は [LICENSE](LICENSE) ファイルを参照してください。

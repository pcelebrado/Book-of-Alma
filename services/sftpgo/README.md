# OpenClaw SFTPGo (SSH/SFTP)

Optional SFTPGo service for book-source ingestion and operator file exchange.

## Purpose

- Provides SFTP over SSH on port `2022`.
- Provides WebAdmin/API on port `8080`.
- Persists user data and host keys on Railway volume (`/data/sftpgo`).
- Mirrors the active OpenClaw workspace at `/data/workspace`.

## Railway setup

1. Create service from this repo root:
   - Root directory: `services/sftpgo`
   - Config path: `/services/sftpgo/railway.toml`
2. Attach a volume at `/data`.
3. Set variables from `.env.example`.
4. Enable public networking for this service if external SFTP clients must connect.
5. Deploy.

The startup path also ensures these mappings exist:

- `/data/sftpgo/workspace` -> `/data/workspace`
- `/srv/sftpgo/workspace` -> `/data/workspace`

## First login

1. Open `https://<service-domain>/web/admin`.
2. Log in with `SFTPGO_DEFAULT_ADMIN_USERNAME` and `SFTPGO_DEFAULT_ADMIN_PASSWORD`.
3. Create protocol users with home directories rooted at `/data/workspace` (or `/srv/sftpgo/workspace`).

## SSH/SFTP readiness checks

- Health endpoint: `GET /healthz`.
- SFTP test:

```bash
sftp -P 2022 <username>@<service-domain>
```

## OpenClaw integration hint

If you set `BOOK_SOURCE_MODE=sftp`, point uploads to an SFTPGo user home or mapped
folder that resolves to `/data/workspace` and keep manifest/content paths aligned
with your web/core `BOOK_*` variables.

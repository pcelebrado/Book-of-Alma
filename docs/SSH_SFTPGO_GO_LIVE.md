# SSH + SFTPGo Go-Live Checklist

This checklist verifies SSH/SFTP readiness using the optional `services/sftpgo`
service.

## Service config

- Service root: `services/sftpgo`
- Railway config: `services/sftpgo/railway.toml`
- Docker image source: `services/sftpgo/Dockerfile`
- Persistent storage: volume mounted at `/data`

## Required Railway variables

- `SFTPGO_DEFAULT_ADMIN_USERNAME`
- `SFTPGO_DEFAULT_ADMIN_PASSWORD`
- `SFTPGO_DATA_PROVIDER__CREATE_DEFAULT_ADMIN=true`
- `SFTPGO_HTTPD__BINDINGS__0__PORT=8080`
- `SFTPGO_SFTPD__BINDINGS__0__PORT=2022`
- `SFTPGO_DATA_ROOT=/data/sftpgo`
- `OPENCLAW_WORKSPACE_VOLUME_DIR=/data/workspace`

## Deployment checks

1. Deploy service and verify health endpoint:

```bash
curl -fsS "https://<sftpgo-domain>/healthz"
```

2. Confirm admin UI is reachable:

`https://<sftpgo-domain>/web/admin`

3. Create a protocol user in SFTPGo WebAdmin with home directory `/data/workspace` (or `/srv/sftpgo/workspace`).

4. Verify SFTP over SSH:

```bash
sftp -P 2022 <username>@<sftpgo-domain>
```

5. Upload a probe file and confirm it appears under `/data/workspace` and is visible through the compatibility path `/root/.openclaw/workspace`.

## Operational notes

- SFTPGo SSH supports SFTP/SCP and selected built-in commands; shell login is not supported.
- Keep admin and protocol user credentials in Railway Variables / secret vault.
- Rotate admin and user credentials after initial validation.

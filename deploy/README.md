# Carbonio AI Assistant Deployment

Production deployment uses:

- Carbonio Iris component registry for the UI.
- Carbonio Nginx extension includes for `/api/ai/`.
- A private Node.js 22 runtime under `/opt/carbonio-ai-assistant/runtime/`.
- The `carbonio-ai-gateway.service` systemd unit.
- Persistent data under `/var/lib/carbonio-ai-assistant/`.

## Build a release

Run from a clean Git worktree:

```bash
pnpm run package:release
```

The generated versioned archive and SHA-256 checksum are written to `release/`,
for example `carbonio-ai-assistant-v0.0.2.tar.gz`.

## Install or upgrade

Copy the release archive to the Carbonio Proxy/Web UI server, then:

```bash
tar -xzf carbonio-ai-assistant-v0.0.2.tar.gz
cd carbonio-ai-assistant-v0.0.2
sudo ./install.sh
```

The installer is idempotent for an existing managed installation. It:

1. Downloads and verifies the pinned official Node.js runtime when missing.
2. Installs the versioned gateway release.
3. Registers and starts `carbonio-ai-gateway.service`.
4. Installs the Carbonio Nginx extension route.
5. Installs the versioned Iris UI component.
6. Rebuilds `components.json` and keeps a backup.
7. Validates Nginx and waits for gateway readiness.

Run the read-only post-deployment smoke test:

```bash
sudo /opt/carbonio-ai-assistant/bin/smoke-test.sh
```

Rollback to an already installed commit (gateway and UI together):

```bash
sudo /opt/carbonio-ai-assistant/bin/rollback.sh <40-character-commit> --yes
```

Database migrations are forward-only; application rollback never downgrades the schema.

## Service operations

```bash
systemctl status carbonio-ai-gateway
systemctl restart carbonio-ai-gateway
journalctl -u carbonio-ai-gateway -f
```

The service listens only on `127.0.0.1:8787`.

## Encrypted provider credential

Store or rotate the provider API key as a systemd encrypted credential. The clear-text
key is not persisted by the gateway settings file:

```bash
sudo /opt/carbonio-ai-assistant/bin/set-api-key.sh
```

For an existing installation whose key is still in `gateway.env`, migrate it without
printing the key and remove the old environment entry:

```bash
sudo /opt/carbonio-ai-assistant/bin/set-api-key.sh --migrate-env
```

Installations configured through the older Settings UI can migrate the legacy runtime
config in place. The helper removes the plaintext field only after encryption succeeds:

```bash
sudo /opt/carbonio-ai-assistant/bin/set-api-key.sh --migrate-config
```

## Uninstall

Interactive uninstall that preserves history and saved configuration:

```bash
sudo ./uninstall.sh
```

Non-interactive uninstall:

```bash
sudo ./uninstall.sh --yes
```

Remove the application and persistent data:

```bash
sudo ./uninstall.sh --yes --purge-data
```

The uninstaller refuses to remove files unless the managed installation marker
is present.

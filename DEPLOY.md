# FikaAI Production Deployment

This deployment runs PostgreSQL, FastAPI, the built React application, and Caddy on one Linux VPS. Caddy obtains and renews the HTTPS certificate automatically. HTTPS is required because browsers block camera access on non-secure public origins.

## Prerequisites

- A Linux VPS with at least 4 GB RAM, 2 CPU cores, and 20 GB free disk space
- Docker Engine with the Compose plugin (Podman Compose is also compatible)
- A domain name with an `A` record pointing to the VPS IPv4 address
- Ports `80/tcp`, `443/tcp`, and `443/udp` open in the VPS firewall

InsightFace `buffalo_l` weights are non-commercial research licensed. Review their license before commercial deployment.

## Configure

Clone the repository on the VPS, then create the production environment:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Edit `.env.production` and set at least:

- `DOMAIN` and `ACME_EMAIL`
- `CORS_ORIGINS=https://<your-domain>`
- `POSTGRES_PASSWORD` generated with `openssl rand -hex 24`
- `JWT_SECRET` generated with `openssl rand -hex 32`
- `EMBEDDING_ENCRYPTION_KEY` generated with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Back up `EMBEDDING_ENCRYPTION_KEY` in a password manager. Losing it makes existing FaceIDs unreadable. Never rotate it without a planned FaceID migration or student re-enrolment.

Set the real training coordinates and radius before enabling GPS. Keep `FAKE_FACE_ALWAYS_MATCH=false` in every production environment.

## Launch

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

The first start downloads approximately 330 MB of face models into the persistent `fikaai_models` volume. The backend remains unhealthy until the download and database migrations finish.

Monitor startup:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend caddy
```

Verify these URLs after all services are healthy:

- `https://<your-domain>/health` returns `{"status":"ok",...}`
- `https://<your-domain>` loads the student application
- Browser developer tools show the page as a secure context and camera permission can be granted

## Upgrade

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Alembic migrations run automatically before the backend starts. Existing encrypted FaceIDs and attendance data remain in named volumes.

## Back Up

Database backup:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > fikaai-backup.sql
```

Also back up `.env.production` securely, especially `EMBEDDING_ENCRYPTION_KEY`. Database backups without that key cannot decrypt FaceID embeddings.

Restore into an empty database:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < fikaai-backup.sql
```

## Operational Notes

- PostgreSQL and the backend have no public host ports; only Caddy exposes ports 80/443.
- `WEB_CONCURRENCY=1` avoids duplicating the large InsightFace model in RAM. Increase only after measuring VPS memory.
- Raw face images are processed in memory and are not stored. Encrypted embeddings and stable FaceID UUID references persist in PostgreSQL.
- Check logs and storage regularly. Add provider-level snapshots or scheduled `pg_dump` backups before accepting real attendance data.

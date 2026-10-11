# Deploy CodeLens now; add AI keys later

For beta and public-launch readiness checks, see [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). A successful deployment alone does not verify launch readiness.

No paid AI API or GitHub token is needed to start. CodeLens will import ZIPs and public GitHub repositories, compute source metrics/import graphs, search source, retain history, and export reports. Tutorials and Q&A stay explicitly unavailable until AI is configured. GitHub imports still need internet access and are subject to GitHub's unauthenticated limits.

You must configure a login account before production startup. There is no public sign-up or default production password.

## Option 1: Render

1. Put this project in a GitHub repository, including the three package lockfiles, Dockerfile, and `render.yaml`. Exclude `.env`, `node_modules`, and database files using the supplied `.gitignore`.
2. In Render, create a **Blueprint** from that repository. The supplied blueprint builds the Docker image, serves the frontend/API together, checks `/api/ready`, and mounts a persistent disk.
3. When prompted for `LOGIN_USERS`, set `you@example.com:a-unique-password-at-least-12-characters`. Do not use the example literally. This creates the account only if it does not already exist.
4. Deploy and open the HTTPS service URL. Sign in and upload a project ZIP to verify source exploration. No AI key is requested by the blueprint.

The blueprint specifies a disk-capable paid service. Keep one instance: SQLite and job processing share local persistent storage. Do not substitute an ephemeral filesystem for `/app/server/data`.

Reference: [Render Blueprint specification](https://render.com/docs/blueprint-spec), [health checks](https://render.com/docs/health-checks).

## Option 2: Docker Compose on your server

Install Docker with Compose, then:

```sh
cp server/.env.example server/.env
```

Edit `server/.env`, set `LOGIN_USERS`, and leave the API keys blank. Then run:

```sh
docker compose up --build -d
docker compose logs -f codelens
```

The app binds to `127.0.0.1:5000` on the host. Put an HTTPS reverse proxy in front of that address for public access. Set `ALLOWED_ORIGINS=https://your-domain.example` in `server/.env`; configure `TRUST_PROXY_HOPS` only for your actual trusted proxy topology, then recreate the container. Production session cookies require HTTPS for public domains. Do not expose an unencrypted public application port.

The named volume holds the database and pending uploads. Keep that volume when updating:

```sh
docker compose up --build -d
```

Do not use `docker compose down -v` unless you intend to delete all saved data.

Reference: [Docker Compose environment configuration](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).

## Add an AI provider later

In Render's environment settings, or `server/.env` for Compose, set:

```dotenv
AI_MODE=auto
LLM_PROVIDER=GEMINI
GEMINI_API_KEY=your-real-key
```

Other supported pairs:

| Provider | Key variable |
| --- | --- |
| `OPENAI` | `OPENAI_API_KEY` |
| `GROQ` | `GROQ_API_KEY` |
| `OPENROUTER` | `OPENROUTER_API_KEY` |

Restart/redeploy the server (Compose: `docker compose up -d --force-recreate codelens`), then refresh the browser. No frontend code change or frontend key is needed. Existing source-only imports show **Generate tutorials**, which uses their stored source. Q&A becomes available immediately against stored source.

`AI_MODE=disabled` keeps AI off even when a key is set. `FAKE_LLM=true` is a local test/demo feature and is rejected in production. Never put provider keys in a `VITE_` variable: those variables become public frontend code.

## Account management

`LOGIN_USERS` bootstraps missing accounts only. After first successful startup you may remove the bootstrap value from your platform environment because the account is stored on disk. Change passwords with:

```sh
docker compose exec codelens node server/scripts/create-user.js you@example.com
```

On Render, use the same Node command in the service shell. This also revokes the account's existing sessions. Passwords are 12–256 characters. Avoid commas in bootstrap passwords because `LOGIN_USERS` is comma-separated; the interactive account command supports them.

## Backup and health

- `/api/health`: process liveness.
- `/api/ready`: SQLite accessibility.
- Missing frontend build or missing production accounts causes a clear startup error.
- Missing AI keys is a supported mode, not a failed health check.

A backup example inside Compose:

```sh
docker compose exec codelens node server/scripts/backup.js /app/server/data/backup.db
docker compose cp codelens:/app/server/data/backup.db ./backup.db
```

Choose a new backup filename for each run; existing backups are not overwritten. The command requires an existing source database, includes committed WAL data, verifies SQLite integrity, and publishes the snapshot with owner-only file permissions. A mistyped `DB_PATH` fails instead of creating an empty database. Keep off-server backups. See README for restoring the database together with pending uploads.

## Release checks

```sh
npm run install-all
npm run check
npm run test:e2e
npm run test:production
npx playwright install chromium
npm run test:browser
npm run test:browser:keyless
```

The production smoke test runs with `NODE_ENV=production`, no provider keys, no fake AI, and a temporary database. It verifies static assets, readiness, secure cookie attributes, authenticated ZIP ingestion, source access, explicit AI gating, and restart persistence. CI also builds and smoke-tests the Docker image.

Deployment files are prepared; no hosting account, domain, or live deployment has been created automatically.

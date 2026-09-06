# FindPitches Observer

Small Cloudflare Worker + D1 service that receives a safe, append-only operational feed from Hal and exposes a read-only JSON status/log API.

It is deliberately separate from the acquisition controller. If the observer fails, acquisition continues unchanged. The reporter reads the existing controller checkpoint and controller log once per minute and pushes a whitelisted status summary plus only new log lines.

## Endpoints

- `GET /health` - observer health and most recent heartbeat timestamp.
- `GET /status` - latest status for every source.
- `GET /status?source=hal-us-growth` - latest Hal US-growth status only.
- `GET /events?limit=100` - recent observer events.
- `GET /events?source=hal-us-growth&limit=100` - recent Hal controller events only.
- `POST /ingest` - authenticated reporter endpoint. Requires `Authorization: Bearer <INGEST_TOKEN>`.

The read endpoints contain only the reporter's whitelisted operational fields and redacted controller log lines. They do not expose Cloudflare/GitHub credentials, environment files or the complete controller checkpoint.

## Cloudflare setup

From the repository root:

```bash
cd operations/cloudflare-findpitches-observer

npx --yes wrangler@4.127.1 d1 create findpitches-observer
```

Copy the returned database ID into `wrangler.jsonc` in place of `REPLACE_WITH_D1_DATABASE_ID`, then initialise it:

```bash
npx --yes wrangler@4.127.1 d1 execute findpitches-observer \
  --remote \
  --file schema.sql
```

Create a long random ingest token locally and store it only as a Worker secret and in Hal's reporter environment file:

```bash
TOKEN="$(openssl rand -hex 32)"
printf '%s' "$TOKEN" | npx --yes wrangler@4.127.1 secret put INGEST_TOKEN
```

Deploy:

```bash
npx --yes wrangler@4.127.1 deploy
```

Record the resulting Worker URL, for example `https://findpitches-observer.<account>.workers.dev`.

## Hal reporter setup

Create the private reporter environment directory/file:

```bash
mkdir -p ~/.config/findpitches-observer
chmod 700 ~/.config/findpitches-observer
cat > ~/.config/findpitches-observer/reporter.env <<EOF
FINDPITCHES_OBSERVER_URL=https://findpitches-observer.<account>.workers.dev
FINDPITCHES_OBSERVER_TOKEN=<same token used for the Worker secret>
FINDPITCHES_OBSERVER_SOURCE=hal-us-growth
EOF
chmod 600 ~/.config/findpitches-observer/reporter.env
```

Install the user service and timer:

```bash
mkdir -p ~/.config/systemd/user
cp operations/cloudflare-findpitches-observer/systemd/findpitches-observer-reporter.service ~/.config/systemd/user/
cp operations/cloudflare-findpitches-observer/systemd/findpitches-observer-reporter.timer ~/.config/systemd/user/

systemctl --user daemon-reload
systemctl --user enable --now findpitches-observer-reporter.timer
systemctl --user start findpitches-observer-reporter.service
```

Verify:

```bash
systemctl --user status findpitches-observer-reporter.timer --no-pager
journalctl --user -u findpitches-observer-reporter.service -n 30 --no-pager
curl -sS https://findpitches-observer.<account>.workers.dev/status?source=hal-us-growth
curl -sS 'https://findpitches-observer.<account>.workers.dev/events?source=hal-us-growth&limit=20'
```

## Reporter safety

The reporter only sends a compact allow-listed subset of `controller.json`, including counts, current state/mode, query cursor, workflow IDs, PR/deployment metadata, deferred counts and sweep progress. Controller log text is ANSI-stripped and common token formats/Bearer values are redacted before upload.

The local reporter cursor is kept at `~/.local/state/findpitches-observer/reporter.json`, so each minute normally sends only log lines written since the previous successful heartbeat. The cursor advances only after the Worker confirms the ingest request, preventing silent loss during temporary network failures.

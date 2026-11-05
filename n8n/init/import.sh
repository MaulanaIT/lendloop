#!/bin/sh
# One-shot n8n bootstrap (docker compose service "n8n-init").
# Imports the local Mailpit SMTP credential and the LendLoop workflows, then
# publishes them. Safe to re-run: imports upsert by the stable IDs in the JSON
# files, and publishing an already-published workflow just republishes it.
#
# Runs BEFORE the n8n server starts (compose depends_on), so the server loads
# the published versions on boot. After changing a workflow file:
#   docker compose run --rm n8n-init && docker compose restart n8n
set -eu

WORKFLOWS_DIR=/import/workflows
CREDENTIALS_DIR=/import/credentials

: "${N8N_ENCRYPTION_KEY:?N8N_ENCRYPTION_KEY must be set (see n8n/.env.example)}"

echo "[lendloop-init] importing credentials (non-secret: local Mailpit SMTP)"
n8n import:credentials --separate --input="$CREDENTIALS_DIR"

echo "[lendloop-init] importing workflows"
n8n import:workflow --separate --input="$WORKFLOWS_DIR"

# Publish the error handler first so the other workflows can reference it.
# The IDs are read from the files so this list never drifts from the JSON.
ids=$(node -e '
  const fs = require("fs");
  const dir = process.argv[1];
  const wfs = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(dir + "/" + f, "utf8")));
  wfs.sort((a, b) => (b.name.includes("Error handler") ? 1 : 0) - (a.name.includes("Error handler") ? 1 : 0));
  console.log(wfs.map((w) => w.id).join(" "));
' "$WORKFLOWS_DIR")

for id in $ids; do
  echo "[lendloop-init] publishing $id"
  n8n publish:workflow --id="$id"
done

echo "[lendloop-init] workflows:"
n8n list:workflow
echo "[lendloop-init] published:"
n8n list:workflow --active=true

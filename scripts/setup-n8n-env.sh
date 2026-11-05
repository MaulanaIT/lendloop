#!/bin/sh
# Creates n8n/.env from n8n/.env.example with fresh random secrets.
# Never overwrites an existing n8n/.env (rotating N8N_ENCRYPTION_KEY would make
# the stored n8n credentials unreadable).
#
# Afterwards copy the two shared secrets into the Convex deployment:
#   npx convex env set N8N_WEBHOOK_SECRET    <value from n8n/.env>
#   npx convex env set CONVEX_INBOUND_SECRET <value from n8n/.env>
set -eu

cd "$(dirname "$0")/.."
target=n8n/.env

if [ -f "$target" ]; then
  echo "$target already exists; leaving it untouched."
  exit 0
fi

gen() { openssl rand -hex 32; }

sed \
  -e "s/^N8N_ENCRYPTION_KEY=.*/N8N_ENCRYPTION_KEY=$(gen)/" \
  -e "s/^N8N_WEBHOOK_SECRET=.*/N8N_WEBHOOK_SECRET=$(gen)/" \
  -e "s/^CONVEX_INBOUND_SECRET=.*/CONVEX_INBOUND_SECRET=$(gen)/" \
  n8n/.env.example >"$target"
chmod 600 "$target"

echo "Wrote $target with random secrets."
echo "Now set the same N8N_WEBHOOK_SECRET and CONVEX_INBOUND_SECRET on Convex:"
echo "  npx convex env set N8N_WEBHOOK_SECRET \"\$(grep ^N8N_WEBHOOK_SECRET= $target | cut -d= -f2)\""
echo "  npx convex env set CONVEX_INBOUND_SECRET \"\$(grep ^CONVEX_INBOUND_SECRET= $target | cut -d= -f2)\""
echo "  npx convex env set N8N_REQUEST_WEBHOOK_URL http://localhost:5678/webhook/lendloop/request-events"

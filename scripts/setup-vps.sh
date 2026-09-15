#!/usr/bin/env bash
# Patang Future Homes — VPS bootstrap for Ubuntu 24.04 LTS (no Docker)
# Run as root:  bash setup-vps.sh
# Installs Node 22 + pm2 + nginx + certbot, builds the app, starts it,
# and wires nginx reverse-proxy + automatic SSL.

set -euo pipefail

APP_DIR="/opt/patang-future-homes"
DB_DIR="/var/lib/patang-crm"
PRIMARY_DOMAIN="patangfuturehomes.com"
CRM_DOMAIN="crm.patangfuturehomes.com"
REPO_URL="${REPO_URL:-https://github.com/trlnrventures-web/patang-future-homes.git}"
GIT_TOKEN="${GIT_TOKEN:-}"          # set if the repo is private
GIT_BRANCH="${GIT_BRANCH:-master}"

export DEBIAN_FRONTEND=noninteractive

echo "==> 1/7 System packages + swap"
apt-get update -y
if ! grep -q '/swapfile' /etc/fstab; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile
  mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
apt-get install -y git curl ca-certificates gnupg nginx certbot python3-certbot-nginx ufw

echo "==> 2/7 Node.js 22 (NodeSource)"
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
apt-get update -y
apt-get install -y nodejs
npm install -g pm2@latest

echo "==> 3/7 App code"
mkdir -p "$APP_DIR" "$DB_DIR"
if [ -d "$APP_DIR/.git" ]; then
  echo "Already cloned — pulling..."
  cd "$APP_DIR"
  git fetch origin
  git reset --hard "origin/$GIT_BRANCH"
else
  if [ -n "$GIT_TOKEN" ]; then
    AUTH_URL="${REPO_URL/https:\/\//https://x-access-token:${GIT_TOKEN}@}"
  else
    AUTH_URL="$REPO_URL"
  fi
  git clone "$AUTH_URL" "$APP_DIR"
  cd "$APP_DIR"
  if [ -n "$GIT_BRANCH" ]; then git checkout "$GIT_BRANCH"; fi
fi

echo "==> 4/7 Build"
cd "$APP_DIR"
npm ci || npm install
NEXT_PUBLIC_SITE_URL="https://$PRIMARY_DOMAIN" npm run build

echo "==> 5/7 pm2"
pm2 delete crm >/dev/null 2>&1 || true
CRM_DB_PATH="$DB_DIR/crm.db" pm2 start "node_modules/.bin/next" \
  --name crm -- start -p 3000
pm2 save
pm2 startup systemd -u root --hp /root

echo "==> 6/7 nginx"
cat > /etc/nginx/sites-available/patang <<'NGINX'
server {
  listen 80;
  server_name patangfuturehomes.com crm.patangfuturehomes.com;
  client_max_body_size 20m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
NGINX
ln -sf /etc/nginx/sites-available/patang /etc/nginx/sites-enabled/patang
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable nginx && systemctl restart nginx

echo "==> 7/7 SSL"
certbot --nginx -d "$PRIMARY_DOMAIN" -d "$CRM_DOMAIN" \
  --agree-tos -m admin@patangfuturehomes.com --redirect --quiet || \
  echo "certbot failed — run manually: certbot --nginx -d $PRIMARY_DOMAIN -d $CRM_DOMAIN"

echo ""
echo "DONE. Add these DNS A records (Cloudflare, grey/proxied OFF is fine):"
echo "  ${PRIMARY_DOMAIN}    A   $(curl -4 -s ifconfig.me)"
echo "  ${CRM_DOMAIN}        A   $(curl -4 -s ifconfig.me)"
echo ""
echo "Copy your existing data:  scp data/crm.db root@THIS_IP:$DB_DIR/crm.db"
echo "Then:  pm2 restart crm"
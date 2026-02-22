#!/usr/bin/env bash
# Run this script ON your AWS instance (Ubuntu) from the repo root.
# Usage: ./deploy/setup-aws.sh
# Prereqs: repo is at /home/ubuntu/NSBEHacks2026-1 (or set APP_ROOT).

set -e

APP_ROOT="${APP_ROOT:-$(pwd)}"
if [[ ! -d "$APP_ROOT/backend" || ! -d "$APP_ROOT/proxy-server" ]]; then
  echo "Error: Run from repo root (or set APP_ROOT). Not found: $APP_ROOT/backend or $APP_ROOT/proxy-server"
  exit 1
fi

echo "==> Using app root: $APP_ROOT"

# --- Node.js (for backend) ---
if ! command -v node &>/dev/null; then
  echo "==> Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "==> Node $(node -v)"

# --- Bun (for proxy-server) ---
if ! command -v bun &>/dev/null; then
  echo "==> Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
# Ensure Bun is on PATH (e.g. after fresh install)
export PATH="${BUN_INSTALL:-$HOME/.bun}/bin:$PATH"
BUN_PATH="$(command -v bun)"
if [[ -z "$BUN_PATH" ]]; then
  BUN_PATH="$HOME/.bun/bin/bun"
  [[ -x "$BUN_PATH" ]] || { echo "Bun not found at $BUN_PATH"; exit 1; }
fi
NPX_PATH="$(command -v npx)"
echo "==> Bun at $BUN_PATH, npx at $NPX_PATH"

# --- Backend deps ---
echo "==> Installing backend dependencies..."
(cd "$APP_ROOT/backend" && npm install --production=false)

# --- Proxy-server deps ---
echo "==> Installing proxy-server dependencies..."
(cd "$APP_ROOT/proxy-server" && "$BUN_PATH" install)

# --- Env files (create from example if missing) ---
for dir in backend proxy-server; do
  env_dir="$APP_ROOT/$dir"
  if [[ -f "$env_dir/.env.example" && ! -f "$env_dir/.env" ]]; then
    cp "$env_dir/.env.example" "$env_dir/.env"
    echo "==> Created $dir/.env from .env.example — please edit and set secrets"
  fi
done
if [[ ! -f "$APP_ROOT/proxy-server/.env" ]]; then
  echo "==> Create proxy-server/.env with at least: DATABASE_URL, ISSUER_SECRET, PLATFORM_WALLET_SEED, PROXY_HMAC_SECRET"
fi

# --- Systemd units ---
echo "==> Installing systemd units..."
sudo tee /etc/systemd/system/nsbe-backend.service >/dev/null <<SVC
[Unit]
Description=NSBEHacks Backend (Express + XRPL + Supabase)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$APP_ROOT/backend
Environment=NODE_ENV=production
EnvironmentFile=$APP_ROOT/backend/.env
ExecStart=$NPX_PATH ts-node src/server.ts
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVC

sudo tee /etc/systemd/system/nsbe-proxy.service >/dev/null <<SVC
[Unit]
Description=NSBEHacks Proxy Server (Elysia + Postgres + XRPL)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$APP_ROOT/proxy-server
Environment=NODE_ENV=production
EnvironmentFile=$APP_ROOT/proxy-server/.env
ExecStart=$BUN_PATH run start
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVC

sudo systemctl daemon-reload
sudo systemctl enable nsbe-backend nsbe-proxy
sudo systemctl start nsbe-backend nsbe-proxy

echo ""
echo "==> Services started. Status:"
sudo systemctl status nsbe-backend nsbe-proxy --no-pager || true
echo ""
echo "Use: sudo systemctl status nsbe-backend nsbe-proxy"
echo "     sudo journalctl -u nsbe-backend -f"
echo "     sudo journalctl -u nsbe-proxy -f"
echo "Backend health: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP'):4000/api/health"
echo "Proxy:          http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP'):3000"

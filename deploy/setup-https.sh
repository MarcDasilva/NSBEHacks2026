#!/usr/bin/env bash
# Enable HTTPS for backend and proxy-server using Nginx + Let's Encrypt.
# Run ON the AWS instance from the repo root after setup-aws.sh.
#
# Prereqs:
#   - Two domain names pointing to this server's public IP (e.g. api.example.com, proxy.example.com)
#   - Ports 80 and 443 open in the EC2 security group
#
# Usage:
#   export BACKEND_DOMAIN=api.yourdomain.com
#   export PROXY_DOMAIN=proxy.yourdomain.com
#   export EMAIL=you@example.com
#   ./deploy/setup-https.sh

set -e

BACKEND_DOMAIN="${BACKEND_DOMAIN:?Set BACKEND_DOMAIN (e.g. api.yourdomain.com)}"
PROXY_DOMAIN="${PROXY_DOMAIN:?Set PROXY_DOMAIN (e.g. proxy.yourdomain.com)}"
EMAIL="${EMAIL:?Set EMAIL for Let's Encrypt (e.g. you@example.com)}"

APP_ROOT="${APP_ROOT:-$(pwd)}"
DEPLOY_DIR="$APP_ROOT/deploy"

echo "==> Backend domain: $BACKEND_DOMAIN"
echo "==> Proxy domain:  $PROXY_DOMAIN"
echo "==> Email:         $EMAIL"

# Detect OS
if command -v apt-get &>/dev/null; then
  PKG_UPDATE="sudo apt-get update"
  PKG_INSTALL="sudo apt-get install -y nginx certbot python3-certbot-nginx"
elif command -v dnf &>/dev/null; then
  PKG_UPDATE="sudo dnf install -y epel-release || true"
  PKG_INSTALL="sudo dnf install -y nginx certbot python3-certbot-nginx || sudo dnf install -y nginx certbot"
elif command -v yum &>/dev/null; then
  PKG_UPDATE="sudo yum install -y epel-release || true"
  PKG_INSTALL="sudo yum install -y nginx certbot python3-certbot-nginx || sudo yum install -y nginx certbot"
else
  echo "Error: Unsupported OS (no apt-get, dnf, or yum)"
  exit 1
fi

# Install Nginx and Certbot
echo "==> Installing Nginx and Certbot..."
$PKG_UPDATE
$PKG_INSTALL

# Webroot for ACME challenge
sudo mkdir -p /var/www/certbot

# Minimal Nginx config for HTTP (port 80) so certbot can validate
echo "==> Temporary Nginx config for certificate issuance..."
sudo tee /etc/nginx/conf.d/nsbe-acme.conf >/dev/null <<NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root /var/www/certbot;
    location /.well-known/acme-challenge/ {
        default_type text/plain;
    }
    location / {
        return 404;
    }
}
NGINX

# Remove default site if it conflicts (Debian/Ubuntu)
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo nginx -t && sudo systemctl reload nginx || sudo systemctl start nginx

# SSL options (certbot may not create these with certonly --webroot)
sudo mkdir -p /etc/letsencrypt
if [[ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
  echo "==> Downloading recommended SSL options..."
  sudo curl -sSL -o /etc/letsencrypt/options-ssl-nginx.conf \
    https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf
fi
if [[ ! -f /etc/letsencrypt/ssl-dhparams.pem ]]; then
  echo "==> Generating DH params..."
  sudo openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
fi

# Get certificates (webroot so Nginx can keep running)
echo "==> Requesting certificate for $BACKEND_DOMAIN..."
sudo certbot certonly --webroot -w /var/www/certbot \
  -d "$BACKEND_DOMAIN" \
  --non-interactive --agree-tos -m "$EMAIL"

echo "==> Requesting certificate for $PROXY_DOMAIN..."
sudo certbot certonly --webroot -w /var/www/certbot \
  -d "$PROXY_DOMAIN" \
  --non-interactive --agree-tos -m "$EMAIL"

# Full HTTPS Nginx config
echo "==> Installing HTTPS Nginx config..."
sudo sed -e "s/BACKEND_DOMAIN/$BACKEND_DOMAIN/g" -e "s/PROXY_DOMAIN/$PROXY_DOMAIN/g" \
  "$DEPLOY_DIR/nginx-https.conf" | sudo tee /etc/nginx/conf.d/nsbe-https.conf >/dev/null
sudo rm -f /etc/nginx/conf.d/nsbe-acme.conf

sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "==> HTTPS is enabled."
echo "  Backend: https://$BACKEND_DOMAIN  (e.g. https://$BACKEND_DOMAIN/api/health)"
echo "  Proxy:   https://$PROXY_DOMAIN"
echo ""
echo "Point your frontend .env to these URLs. Renew certs with: sudo certbot renew"

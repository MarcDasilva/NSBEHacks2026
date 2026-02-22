# Deploy Backend & Proxy-Server to AWS

Run the **backend** (Express, port 4000) and **proxy-server** (Elysia/Bun, port 3000) on an Ubuntu AWS instance and manage them with systemd.

## 1. Get the code on the instance

From your laptop (replace with your instance user and host):

```bash
# Option A: Clone on the instance
ssh ubuntu@YOUR_EC2_IP
git clone https://github.com/YOUR_ORG/NSBEHacks2026-1.git
cd NSBEHacks2026-1

# Option B: Rsync from your machine
rsync -avz --exclude node_modules --exclude .git ./ ubuntu@YOUR_EC2_IP:~/NSBEHacks2026-1/
ssh ubuntu@YOUR_EC2_IP "cd NSBEHacks2026-1 && ./deploy/setup-aws.sh"
```

## 2. Configure environment on the instance

Before or after running the setup script, create env files with real secrets.

**Backend** (`backend/.env`):

- `PORT` (default 4000)
- `XRPL_NETWORK` (e.g. `wss://s.altnet.rippletest.net:51233`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `ENCRYPTION_KEY`

**Proxy-server** (`proxy-server/.env`):

- `DATABASE_URL` (Postgres connection string)
- `XRPL_URL` (optional)
- `ISSUER_SECRET`
- `PLATFORM_WALLET_SEED`
- `PROXY_HMAC_SECRET`

If you run `setup-aws.sh` and `.env` is missing, it copies `.env.example` → `.env`; then edit the `.env` files and restart:

```bash
sudo systemctl restart nsbe-backend nsbe-proxy
```

## 3. Run the setup script on the instance

SSH into the instance, go to the repo root, and run:

```bash
cd ~/NSBEHacks2026-1   # or wherever the repo is
chmod +x deploy/setup-aws.sh
./deploy/setup-aws.sh
```

The script will:

- Install Node.js (for backend) and Bun (for proxy-server) if missing
- Run `npm install` in `backend` and `bun install` in `proxy-server`
- Create `.env` from `.env.example` if absent (you must edit with real values)
- Install and start systemd units: `nsbe-backend`, `nsbe-proxy`

## 4. Useful commands

| Command | Description |
|--------|-------------|
| `sudo systemctl status nsbe-backend nsbe-proxy` | Check status |
| `sudo systemctl start nsbe-backend nsbe-proxy` | Start both |
| `sudo systemctl stop nsbe-backend nsbe-proxy` | Stop both |
| `sudo systemctl restart nsbe-backend` | Restart backend only |
| `sudo journalctl -u nsbe-backend -f` | Backend logs (follow) |
| `sudo journalctl -u nsbe-proxy -f` | Proxy logs (follow) |

## 5. Ports and security

- **Backend**: listens on port **4000** (or `PORT` in `backend/.env`).
- **Proxy-server**: listens on port **3000**.

On AWS, open these ports in the instance security group (e.g. 3000 and 4000 from your frontend’s IP or from 0.0.0.0/0 if you need public access).

Health check: `http://YOUR_EC2_IP:4000/api/health`

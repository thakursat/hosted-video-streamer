#!/usr/bin/env bash
# StreamVault v2 installer for a Debian 12 LXC (run as root inside the container).
set -euo pipefail

APP_DIR="/opt/streamvault"
SVC_USER="streamvault"

# ── Helpers ───────────────────────────────────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RESET='\033[0m'

step()  { echo -e "\n${BOLD}${CYAN}==>${RESET}${BOLD} $*${RESET}"; }
ok()    { echo -e "  ${GREEN}✓${RESET} $*"; }
info()  { echo -e "  ${YELLOW}→${RESET} $*"; }

SECONDS=0

# ── Step 1: System packages ───────────────────────────────────────────────────

step "Updating apt package lists..."
apt-get update -y 2>&1 | tail -3

step "Installing system packages: curl ca-certificates ffmpeg python3 unzip..."
apt-get install -y curl ca-certificates ffmpeg python3 unzip 2>&1 | grep -E "^(Get|Inst|Conf|Setting|Processing|Unp)" || true
ok "apt packages installed"

step "Checking Node.js..."
if command -v node >/dev/null 2>&1; then
  ok "Node.js already installed: $(node --version)"
else
  info "Node.js not found — installing Node.js 20 from NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>&1 | grep -v "^$" | tail -5
  apt-get install -y nodejs 2>&1 | grep -E "^(Get|Inst|Conf)" || true
  ok "Node.js installed: $(node --version), npm: $(npm --version)"
fi

step "Downloading latest yt-dlp..."
YTDLP_OLD=""
if command -v yt-dlp >/dev/null 2>&1; then
  YTDLP_OLD=$(yt-dlp --version 2>/dev/null || echo "unknown")
  info "Current yt-dlp version: $YTDLP_OLD"
fi
curl -fsSL --progress-bar \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
YTDLP_NEW=$(yt-dlp --version)
if [ "$YTDLP_OLD" = "$YTDLP_NEW" ]; then
  ok "yt-dlp already at latest: $YTDLP_NEW"
else
  ok "yt-dlp updated: $YTDLP_OLD → $YTDLP_NEW"
fi

# ── Version summary ───────────────────────────────────────────────────────────

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │  node    $(node --version | sed 's/v//' | awk '{printf "%-32s", $1}')│"
echo "  │  npm     $(npm --version | awk '{printf "%-32s", $1}')│"
echo "  │  ffmpeg  $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}' | awk '{printf "%-32s", $1}')│"
echo "  │  ffprobe $(ffprobe -version 2>/dev/null | head -1 | awk '{print $3}' | awk '{printf "%-32s", $1}')│"
echo "  │  yt-dlp  $(yt-dlp --version | awk '{printf "%-32s", $1}')│"
echo "  └─────────────────────────────────────────┘"

# ── Step 2: Daily yt-dlp update timer ────────────────────────────────────────

step "Setting up daily yt-dlp auto-update timer..."
cat >/etc/systemd/system/yt-dlp-update.service <<'UNIT'
[Unit]
Description=Update yt-dlp to latest release
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/yt-dlp -U
UNIT
cat >/etc/systemd/system/yt-dlp-update.timer <<'UNIT'
[Unit]
Description=Daily yt-dlp self-update
[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=1h
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now yt-dlp-update.timer 2>&1 || true
ok "yt-dlp-update.timer enabled (runs daily)"

# ── Step 3: Copy app files ────────────────────────────────────────────────────

if [ -f "./package.json" ] && [ "$(pwd)" != "$APP_DIR" ]; then
  step "Copying app files to $APP_DIR ..."
  mkdir -p "$APP_DIR"
  cp -rv ./* "$APP_DIR"/ 2>&1 | wc -l | xargs -I{} echo "  → {} files/directories copied"
  ok "App files copied to $APP_DIR"
else
  ok "Already in $APP_DIR — skipping copy"
fi

cd "$APP_DIR"

# ── Step 4: Server dependencies ──────────────────────────────────────────────

step "Installing server npm dependencies (includes TypeScript build tools)..."
npm install 2>&1 | grep -E "^(added|removed|changed|audited|found|npm warn|npm error)" || true
TOTAL_PKGS=$(ls node_modules | wc -l | tr -d ' ')
ok "$TOTAL_PKGS packages installed in node_modules/"

# ── Step 5: Build TypeScript server ──────────────────────────────────────────

step "Compiling TypeScript server → dist/ ..."
npm run build:server 2>&1
JS_FILES=$(find dist -name "*.js" | wc -l | tr -d ' ')
ok "TypeScript compiled — $JS_FILES .js files in dist/"
info "Entry point: dist/index.js"

# ── Step 6: Build React client ────────────────────────────────────────────────

if [ -d "client" ]; then
  step "Installing React client npm dependencies..."
  cd client
  npm install 2>&1 | grep -E "^(added|removed|changed|audited|found|npm warn|npm error)" || true
  CLIENT_PKGS=$(ls node_modules | wc -l | tr -d ' ')
  ok "$CLIENT_PKGS packages installed in client/node_modules/"

  step "Building React client (Vite)..."
  npm run build 2>&1
  cd "$APP_DIR"

  BUILT_FILES=$(find client/dist -type f | wc -l | tr -d ' ')
  BUILT_SIZE=$(du -sh client/dist 2>/dev/null | cut -f1)
  ok "React client built — $BUILT_FILES files, $BUILT_SIZE in client/dist/"

  step "Removing client/node_modules/ to save disk space..."
  du -sh client/node_modules 2>/dev/null | awk '{print "  → Removing " $1 " from client/node_modules/"}'
  rm -rf client/node_modules
  ok "client/node_modules/ removed"
fi

# ── Step 7: Prune server dev dependencies ────────────────────────────────────

step "Pruning server dev dependencies (TypeScript not needed at runtime)..."
BEFORE=$(du -sh node_modules 2>/dev/null | cut -f1)
npm prune --production 2>&1 | grep -E "^(removed|npm warn)" || true
AFTER=$(du -sh node_modules 2>/dev/null | cut -f1)
ok "node_modules pruned: $BEFORE → $AFTER"

# ── Step 8: Service user ──────────────────────────────────────────────────────

step "Checking service user '$SVC_USER'..."
if id "$SVC_USER" >/dev/null 2>&1; then
  ok "User '$SVC_USER' already exists"
else
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
  ok "System user '$SVC_USER' created (no home, no login shell)"
fi

# ── Step 9: Config and directories ───────────────────────────────────────────

step "Setting up config and data directories..."
if [ ! -f "$APP_DIR/config.json" ]; then
  cat >"$APP_DIR/config.json" <<JSON
{
  "port": 8080,
  "email": "",
  "passwordHash": "",
  "mediaDir": "$APP_DIR/media"
}
JSON
  ok "Created default config.json (port 8080, media at $APP_DIR/media)"
else
  ok "config.json already exists — not overwritten"
fi

mkdir -p "$APP_DIR/media" "$APP_DIR/thumbnails"
ok "Directories ready: media/  thumbnails/"

step "Setting ownership to $SVC_USER:$SVC_USER ..."
chown -R "$SVC_USER:$SVC_USER" "$APP_DIR"
ok "Ownership set on $APP_DIR"

# ── Step 10: Systemd service ──────────────────────────────────────────────────

step "Installing systemd service..."
cp "$APP_DIR/streamvault.service" /etc/systemd/system/streamvault.service
systemctl daemon-reload
systemctl enable streamvault 2>&1 | grep -v "^$" || true
ok "streamvault.service enabled"

if systemctl is-active --quiet streamvault 2>/dev/null; then
  step "Restarting running StreamVault service..."
  systemctl restart streamvault
  sleep 1
  if systemctl is-active --quiet streamvault; then
    ok "Service restarted and is running"
  else
    echo "  [!] Service failed to restart — check: journalctl -u streamvault -n 30"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────

LXC_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "<this-LXC-ip>")
ELAPSED=$SECONDS

echo ""
echo -e "${BOLD}${GREEN}"
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║       StreamVault v2  —  Install complete    ║"
echo "  ╠══════════════════════════════════════════════╣"
printf  "  ║  Time taken : %-30s║\n" "${ELAPSED}s"
printf  "  ║  App dir    : %-30s║\n" "$APP_DIR"
printf  "  ║  Service    : %-30s║\n" "streamvault.service"
printf  "  ║  Port       : %-30s║\n" "8080"
echo "  ╠══════════════════════════════════════════════╣"
printf  "  ║  URL        : http://%-24s║\n" "$LXC_IP:8080"
echo "  ╚══════════════════════════════════════════════╝"
echo -e "${RESET}"
echo "  Start the server:   systemctl start streamvault"
echo "  Check status:       systemctl status streamvault"
echo "  Live logs:          journalctl -u streamvault -f"
echo ""
echo "  Open http://$LXC_IP:8080 — you will be prompted to create"
echo "  your account on the first visit."
echo ""

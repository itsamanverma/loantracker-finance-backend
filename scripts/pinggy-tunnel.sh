#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# pinggy-tunnel.sh — Expose LoanTracker Pro backend via Pinggy.io
#
# Usage:
#   chmod +x scripts/pinggy-tunnel.sh
#   ./scripts/pinggy-tunnel.sh [PORT]
#
# What it does:
#   1. Checks SSH is available (Pinggy uses SSH tunnelling)
#   2. Starts a Pinggy tunnel to the local backend port
#   3. Prints the public HTTPS URL for Swagger UI and API testing
#
# Requirements:
#   - ssh installed (standard on Linux/macOS)
#   - LoanTracker Pro backend running on PORT (default: 3000)
#   - Optional: PINGGY_TOKEN env var for persistent subdomains (paid plan)
#
# Persistent subdomain (Pinggy paid plan):
#   export PINGGY_TOKEN="your-access-token"
#   ./scripts/pinggy-tunnel.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PORT="${1:-3000}"
PINGGY_HOST="a.pinggy.io"

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }

# ── Pre-flight checks ─────────────────────────────────────────────────────────
command -v ssh >/dev/null 2>&1 || error "ssh not found. Install OpenSSH and retry."

# Check backend is listening
if ! nc -z 127.0.0.1 "${PORT}" 2>/dev/null; then
  warn "Nothing detected on port ${PORT}. Start the backend first:"
  warn "  npm run dev"
  echo ""
  warn "Starting tunnel anyway — it will work once the backend is up."
fi

# ── Build SSH command ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   LoanTracker Pro — Pinggy.io Tunnel                ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
info "Local backend:  http://127.0.0.1:${PORT}"
info "Tunnel server:  ${PINGGY_HOST}"
echo ""

# Build SSH flags
SSH_FLAGS="-tt -p 443 -R0:localhost:${PORT} -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3"

# Add access token for persistent subdomain if provided
if [[ -n "${PINGGY_TOKEN:-}" ]]; then
  SSH_TARGET="${PINGGY_TOKEN}@${PINGGY_HOST}"
  info "Using Pinggy token for persistent subdomain."
else
  SSH_TARGET="${PINGGY_HOST}"
  warn "No PINGGY_TOKEN — using ephemeral random subdomain."
  warn "Export PINGGY_TOKEN=<your-token> for a stable URL (paid plan)."
fi

echo ""
info "Starting tunnel... (Ctrl+C to stop)"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── Launch tunnel ──────────────────────────────────────────────────────────────
# The SSH output contains the public URL — we tee it so the user can see it
ssh ${SSH_FLAGS} "${SSH_TARGET}" 2>&1 | while IFS= read -r line; do
  echo "$line"

  # Extract and display the public HTTPS URL when Pinggy prints it
  if echo "$line" | grep -qoE 'https://[a-z0-9]+\.a\.pinggy\.io'; then
    PUBLIC_URL=$(echo "$line" | grep -oE 'https://[a-z0-9]+\.a\.pinggy\.io')
    echo ""
    echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
    echo -e "${GREEN}${BOLD}║  ✅ Tunnel is LIVE!                                  ║${RESET}"
    echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
    echo ""
    echo -e "  ${BOLD}Public URL:${RESET}   ${CYAN}${PUBLIC_URL}${RESET}"
    echo -e "  ${BOLD}Swagger UI:${RESET}   ${CYAN}${PUBLIC_URL}/docs${RESET}"
    echo -e "  ${BOLD}Health:${RESET}       ${CYAN}${PUBLIC_URL}/api/health${RESET}"
    echo ""
    echo -e "  ${BOLD}Add to .env:${RESET}  ALLOWED_ORIGINS=${PUBLIC_URL}"
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
  fi
done

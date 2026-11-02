#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# cloudflare-tunnel.sh — Expose LoanTracker Pro backend via Cloudflare Tunnel
#
# Usage:
#   chmod +x scripts/cloudflare-tunnel.sh
#   ./scripts/cloudflare-tunnel.sh [PORT]
#
# What it does:
#   1. Checks if cloudflared is installed (or tells you how to install it)
#   2. Starts a Cloudflare tunnel to the local backend port
#   3. Prints the public HTTPS URL for Swagger UI and API testing
#
# Requirements:
#   - cloudflared installed:
#       npm install -g cloudflared
#       OR on Mac: brew install cloudflared
#   - LoanTracker Pro backend running on PORT (default: 3000)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PORT="${1:-3000}"

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }

# ── Pre-flight checks ─────────────────────────────────────────────────────────
if ! command -v cloudflared >/dev/null 2>&1; then
  echo -e "${RED}${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
  echo -e "${RED}${BOLD}║  ❌ cloudflared is not installed!                     ║${RESET}"
  echo -e "${RED}${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
  echo ""
  warn "Please install cloudflared using one of the following commands:"
  info "Using npm (global):"
  echo -e "  ${BOLD}npm install -g cloudflared${RESET}"
  info "Using Homebrew (macOS):"
  echo -e "  ${BOLD}brew install cloudflared${RESET}"
  info "Using Linux package manager (Debian/Ubuntu):"
  echo -e "  ${BOLD}sudo apt-get install cloudflared${RESET}"
  echo ""
  exit 1
fi

# Check backend is listening
if ! nc -z 127.0.0.1 "${PORT}" 2>/dev/null; then
  warn "Nothing detected on port ${PORT}. Start the backend first:"
  warn "  npm run dev"
  echo ""
  warn "Starting tunnel anyway — it will work once the backend is up."
fi

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   LoanTracker Pro — Cloudflare Tunnel               ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
info "Local backend:  http://127.0.0.1:${PORT}"
echo ""

echo ""
info "Starting tunnel... (Ctrl+C to stop)"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── Launch tunnel ──────────────────────────────────────────────────────────────
# cloudflared prints the tunnel URL to stderr. We redirect stderr to stdout so we can grep it.
# We also want to let the process run in the foreground but intercept its output to display the pretty box once the URL is ready.
cloudflared tunnel --url "http://localhost:${PORT}" 2>&1 | while IFS= read -r line; do
  echo "$line"

  # Extract and display the public HTTPS URL when Cloudflare prints it
  if echo "$line" | grep -qoE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com'; then
    PUBLIC_URL=$(echo "$line" | grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' | head -n 1)
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

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$SERVER_DIR/.." && pwd)"

cd "$REPO_DIR"
echo "[INFO] 追踪容器日志 (Ctrl+C 退出)"
docker compose logs -f equiptrack-server
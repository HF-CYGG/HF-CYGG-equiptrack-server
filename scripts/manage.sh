#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$SERVER_DIR/.." && pwd)"

usage() {
  cat <<EOF
用法: $0 <start|stop|restart|status|logs>

命令说明:
  start    构建并启动服务（如未构建则自动构建）
  stop     停止服务容器
  restart  重启服务容器
  status   查看运行状态与健康检查
  logs     追踪运行日志
EOF
}

cmd=${1:-}
if [ -z "$cmd" ]; then usage; exit 1; fi

cd "$REPO_DIR"

case "$cmd" in
  start)
    docker compose up -d --build
    ;;
  stop)
    docker compose stop equiptrack-server
    ;;
  restart)
    docker compose restart equiptrack-server
    ;;
  status)
    echo "[INFO] docker compose ps:" && docker compose ps
    echo "[INFO] 健康检查:"
    if curl -fsS "http://localhost:3000/health" >/dev/null 2>&1; then
      echo "[OK] 健康检查通过"
    else
      echo "[WARN] 健康检查未通过"
    fi
    ;;
  logs)
    docker compose logs -f equiptrack-server
    ;;
  *)
    usage; exit 1;
    ;;
esac
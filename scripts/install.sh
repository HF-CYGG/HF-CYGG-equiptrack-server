#!/usr/bin/env bash
set -euo pipefail

# 路径与日志
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$SERVER_DIR/.." && pwd)"
LOG_DIR="$SERVER_DIR/logs"
mkdir -p "$LOG_DIR"
INSTALL_LOG="$LOG_DIR/install-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$INSTALL_LOG") 2>&1

echo "[INFO] 使用仓库路径: $REPO_DIR"
echo "[INFO] 服务器数据根路径: $SERVER_DIR"
echo "[INFO] 安装日志: $INSTALL_LOG"

# 创建数据目录与权限
for d in data logs config; do
  mkdir -p "$SERVER_DIR/$d"
done
chmod 755 "$SERVER_DIR" "$SERVER_DIR"/data "$SERVER_DIR"/logs "$SERVER_DIR"/config
chown -R "${SUDO_USER:-$USER}":"${SUDO_USER:-$USER}" "$SERVER_DIR" || true
echo "[INFO] 已创建并配置权限: data, logs, config"

# OS 检查
if [ -f /etc/os-release ]; then
  . /etc/os-release
  echo "[INFO] 检测到系统: ${NAME} ${VERSION_ID}"
  if [ "${ID}" != "ubuntu" ] || [[ "${VERSION_ID}" != 24.04* ]]; then
    echo "[WARN] 本脚本针对 Ubuntu 24.04.x，当前为 ${ID} ${VERSION_ID}，将继续尝试安装。"
  fi
fi

need_sudo() {
  if [ "$(id -u)" -ne 0 ]; then echo sudo; fi
}

# 安装 Docker 与 Compose
if ! command -v docker >/dev/null 2>&1; then
  echo "[INFO] 安装 Docker..."
  $(need_sudo) apt-get update -y
  $(need_sudo) apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $(need_sudo) gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  $(need_sudo) chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  $(need_sudo) tee /etc/apt/sources.list.d/docker.list > /dev/null
  $(need_sudo) apt-get update -y
  $(need_sudo) apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  $(need_sudo) systemctl enable --now docker || true
  echo "[INFO] Docker 安装完成"
else
  echo "[INFO] 已检测到 Docker"
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[ERROR] 未检测到 docker compose 插件，请确认安装 docker-compose-plugin 后重试"
  exit 1
fi

# 将当前用户加入 docker 组（可选）
if getent group docker >/dev/null 2>&1; then
  $(need_sudo) usermod -aG docker "${SUDO_USER:-$USER}" || true
  echo "[INFO] 当前用户已加入 docker 组（重新登录后生效）"
fi

# 环境文件
ENV_FILE="$SERVER_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
PORT=3000
NODE_ENV=production
# 在此处添加更多环境变量，例如数据库配置
EOF
  echo "[INFO] 已创建默认环境文件: $ENV_FILE"
fi

# 构建并启动
echo "[INFO] 开始构建并启动容器..."
cd "$REPO_DIR"
docker compose up -d --build
echo "[INFO] 容器已启动，正在等待健康检查通过..."

# 健康检查等待
ATTEMPTS=30
for i in $(seq 1 $ATTEMPTS); do
  if curl -fsS "http://localhost:3000/health" >/dev/null 2>&1; then
    echo "[INFO] 健康检查通过"
    break
  fi
  echo "[INFO] 等待服务就绪 (${i}/${ATTEMPTS})"
  sleep 2
done

echo "[INFO] 运行状态:"
docker compose ps
echo "[INFO] 日志查看: docker compose logs -f equiptrack-server"
echo "[INFO] 安装完成"
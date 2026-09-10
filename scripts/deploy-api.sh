#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SERVER_DIR/docker-compose.yml"

API_SERVICE="${API_SERVICE:-equiptrack-server}"
API_CONTAINER="${API_CONTAINER:-EquipTrackServer}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql-server}"
MYSQL_NETWORK="${MYSQL_DOCKER_NETWORK:-dpanel-c-mysql-server_default}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:13000}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-equiptrack}"

info() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

fail() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_env_key() {
  key="$1"
  grep -Eq "^[[:space:]]*${key}=.+" "$SERVER_DIR/.env" || fail "Missing required .env key: $key"
}

require_command docker
require_command curl

docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is not available"

[ -f "$SERVER_DIR/.env" ] || fail "Missing $SERVER_DIR/.env"
[ -f "$COMPOSE_FILE" ] || fail "Missing $COMPOSE_FILE"

require_env_key JWT_SECRET
require_env_key MYSQL_USER
require_env_key MYSQL_PASSWORD
require_env_key MYSQL_DATABASE

info "Checking MySQL container: $MYSQL_CONTAINER"
docker inspect "$MYSQL_CONTAINER" >/dev/null 2>&1 || fail "Container $MYSQL_CONTAINER does not exist"

mysql_state="$(docker inspect "$MYSQL_CONTAINER" --format '{{.State.Status}}')"
if [ "$mysql_state" != "running" ]; then
  info "Container $MYSQL_CONTAINER is $mysql_state; starting it"
  docker start "$MYSQL_CONTAINER" >/dev/null
fi

info "Ensuring MySQL restart policy is durable"
docker update --restart unless-stopped "$MYSQL_CONTAINER" >/dev/null

info "Checking Docker network: $MYSQL_NETWORK"
docker network inspect "$MYSQL_NETWORK" >/dev/null 2>&1 || fail "Docker network $MYSQL_NETWORK does not exist"

if ! docker inspect "$MYSQL_CONTAINER" --format '{{json .NetworkSettings.Networks}}' | grep -q "\"$MYSQL_NETWORK\""; then
  fail "Container $MYSQL_CONTAINER is not attached to network $MYSQL_NETWORK"
fi

info "Waiting for MySQL readiness inside its own container"
attempt=1
while [ "$attempt" -le 60 ]; do
  if docker exec "$MYSQL_CONTAINER" sh -c 'mysqladmin ping -h127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --connect-timeout=5' >/dev/null 2>&1; then
    info "MySQL readiness check passed"
    break
  fi

  if [ "$attempt" -eq 60 ]; then
    docker logs --tail=120 "$MYSQL_CONTAINER" || true
    fail "MySQL readiness check did not pass within 120 seconds"
  fi

  sleep 2
  attempt=$((attempt + 1))
done

info "Building API image from $SERVER_DIR"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" build "$API_SERVICE"

api_container_id="$(docker ps -aq --filter "name=^/${API_CONTAINER}$" | head -n 1)"
if [ -n "$api_container_id" ]; then
  api_compose_project="$(docker inspect "$API_CONTAINER" --format '{{ index .Config.Labels "com.docker.compose.project" }}' 2>/dev/null || true)"
  api_compose_service="$(docker inspect "$API_CONTAINER" --format '{{ index .Config.Labels "com.docker.compose.service" }}' 2>/dev/null || true)"

  if [ "$api_compose_project" != "$COMPOSE_PROJECT" ] || [ "$api_compose_service" != "$API_SERVICE" ]; then
    warn "Existing $API_CONTAINER is not managed by compose project $COMPOSE_PROJECT/$API_SERVICE."
    warn "Replacing only the API container after a successful image build. MySQL is not touched."
    docker rm -f "$API_CONTAINER" >/dev/null
  fi
fi

info "Starting API service without recreating MySQL"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d --build "$API_SERVICE"

info "Waiting for API readiness: $API_BASE_URL/health"
attempt=1
while [ "$attempt" -le 60 ]; do
  if curl -fsS "$API_BASE_URL/health" >/dev/null 2>&1; then
    info "API readiness check passed"
    break
  fi

  if [ "$attempt" -eq 60 ]; then
    docker logs --tail=120 "$API_CONTAINER" || true
    fail "API readiness check did not pass within 120 seconds"
  fi

  sleep 2
  attempt=$((attempt + 1))
done

curl -fsS "$API_BASE_URL/health/live" >/dev/null

departments_status="$(curl -sS -o /tmp/equiptrack-departments-check.txt -w '%{http_code}' "$API_BASE_URL/api/departments" || true)"
case "$departments_status" in
  2*|3*|4*)
    info "Departments endpoint returned HTTP $departments_status without a server error"
    ;;
  *)
    warn "Departments endpoint response body:"
    cat /tmp/equiptrack-departments-check.txt >&2 || true
    fail "Departments endpoint returned HTTP $departments_status"
    ;;
esac

info "Current container state"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" ps
docker inspect "$API_CONTAINER" --format '{{json .State.Health}}' || true

info "Deployment verification completed"

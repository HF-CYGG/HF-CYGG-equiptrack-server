# EquipTrack Server Operations

## Database Recovery Checklist

Use this checklist when the API returns database connection errors such as
`ECONNREFUSED 172.27.0.2:3306` or MySQL Workbench reports that the connection is
lost while reading the initial communication packet.

The production API container is named `EquipTrackServer`. Keep that name in
Compose deployments so updates replace the existing container instead of
creating a second API container.

The production MySQL container is managed separately by DPanel. The production
Compose file only attaches the API container to the existing MySQL Docker
network and must not recreate the MySQL data container.

Runtime configuration, database credentials, and secrets come from
`server/.env`. The Compose file only overrides `MYSQL_HOST=mysql-server` and
`MYSQL_PORT=3306` so the API uses the Docker network address.

1. Check container state:

   ```bash
   docker ps -a | grep -E 'mysql|EquipTrack|equiptrack'
   docker logs --tail=200 mysql-server
   ```

2. If `mysql-server` is stopped, start it and confirm MySQL is accepting
   connections:

   ```bash
   docker start mysql-server
   docker logs --tail=100 mysql-server
   docker exec mysql-server sh -c 'mysqladmin ping -h127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --connect-timeout=5'
   ```

   Keep MySQL restartable across host reboots or daemon restarts:

   ```bash
   docker update --restart unless-stopped mysql-server
   ```

3. Restart the API after MySQL is healthy:

   ```bash
   docker restart EquipTrackServer
   ```

4. Verify readiness and a representative API route:

   ```bash
   curl -i http://127.0.0.1:13000/health
   curl -i http://127.0.0.1:13000/health/live
   curl -i http://127.0.0.1:13000/api/departments
   ```

## Long-Running Stability

- `/health/live` checks only that the Node process is running.
- `/health` checks database readiness and returns `503` when MySQL is not
  usable.
- The server waits for MySQL before listening for HTTP traffic.
- A database watchdog exits the Node process after repeated failed readiness
  checks so Docker restart policy can recreate the API container.
- Compose-managed deployments should keep MySQL and the API on the same Docker
  network and set `MYSQL_HOST=mysql-server` for the API container.

## Deployment Verification

Before deploying an updated Compose file, confirm there is not a second API
container with a different name:

```bash
docker ps -a | grep -E 'mysql|EquipTrack|equiptrack'
```

Confirm the API can join the existing MySQL network. The default network name is
`dpanel-c-mysql-server_default`; override it with `MYSQL_DOCKER_NETWORK` only if
`docker inspect mysql-server` shows a different network name.

```bash
docker inspect mysql-server --format '{{json .NetworkSettings.Networks}}'
```

Deploy only the API service from `server/docker-compose.yml`; this file treats
MySQL as an external dependency. Prefer the guarded deployment script:

```bash
sh server/scripts/deploy-api.sh
```

Run this command from the host checkout that contains the `server/` directory,
not from inside the running API container's `/app` directory. The production
image contains built application files, but not the repository-level deployment
script path.

The script verifies MySQL state, the shared Docker network, API image build,
readiness, liveness, and a representative API endpoint. If an existing
`EquipTrackServer` container was not created by this Compose project, the script
replaces only that API container after the new image builds successfully. It
does not remove or recreate `mysql-server`.

Manual equivalent:

```bash
docker compose -f server/docker-compose.yml build equiptrack-server
docker compose -f server/docker-compose.yml up -d --build equiptrack-server
```

If the build fails, do not restart or remove `mysql-server`; inspect the build
output and leave the existing API container running until a fixed image is
available.

After deployment, verify that exactly one API container is publishing port
`13000` and that it is named `EquipTrackServer`:

```bash
docker compose -f server/docker-compose.yml ps
docker inspect EquipTrackServer --format '{{json .State.Health}}'
curl -i http://127.0.0.1:13000/health
curl -i http://127.0.0.1:13000/health/live
curl -i http://127.0.0.1:13000/api/departments
```

## Safety Notes

- Do not delete the MySQL container, data directory, or volume while recovering
  this incident.
- Do not reinitialize MySQL unless a backup has been verified and restored in a
  separate test environment.
- Keep real database passwords in `.env`; do not commit them.

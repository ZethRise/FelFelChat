# Docker

```bash
docker compose up -d --build
# http://127.0.0.1:3000
```

Compose starts MongoDB 8 with replica set `rs0` and the FelFelChat app.

If `SUPERADMIN_PASSWORD` is unset, the generated password is printed in the app logs:

```bash
docker compose logs app | grep SUPERADMIN_PASSWORD
```

For production, set `JWT_SECRET`, `BACKUP_SIGNING_KEY`, and `APP_ORIGIN` in a `.env` file next to `docker-compose.yml`.

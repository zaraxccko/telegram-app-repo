# Деплой на Windows VPS через Docker + автосинхронизация с GitHub

Сценарий: Docker собирает образ, контейнер слушает 3000, Caddy
отдаёт HTTPS, `deploy.ps1` подтягивает изменения из Git и
перезапускает контейнер. Для «реального времени» — GitHub webhook.

---

## 0. Что нужно на VPS

- Windows Server + RDP
- Docker Desktop for Windows (WSL2 backend)
- Git for Windows
- Домен, A-запись на IP VPS
- Telegram-бот (токен от @BotFather) и твой Telegram ID

---

## 1. Клон репозитория

PowerShell от администратора:

```powershell
cd C:\
git clone https://github.com/ТВОЙ_ЛОГИН/fanvue-shop.git app
cd C:\app
copy .env.example .env
notepad .env
```

Заполни в `.env`: `BOT_TOKEN`, `ADMIN_CHAT_ID`, `ADMIN_HASHES`,
нужные `VITE_ADDR_*`.

---

## 2. Первый запуск

```powershell
cd C:\app
docker compose build
docker compose up -d
docker compose logs -f
```

Ждём `Server running on http://localhost:3000`. SQLite-база живёт
в volume `fanvue-data` — апдейты образа её не трогают.

---

## 3. HTTPS через Caddy

Скачай `caddy.exe` в `C:\caddy\`. Создай `C:\caddy\Caddyfile`:

```
ТВОЙ-ДОМЕН.com {
    reverse_proxy localhost:3000
}
```

```powershell
netsh advfirewall firewall add rule name="HTTP"  dir=in action=allow protocol=tcp localport=80
netsh advfirewall firewall add rule name="HTTPS" dir=in action=allow protocol=tcp localport=443
C:\caddy\caddy.exe install --config C:\caddy\Caddyfile
net start caddy
```

В @BotFather → /mybots → Bot Settings → Menu Button укажи
`https://твой-домен.com`.

---

## 4. Синхронизация с GitHub

### Вариант А — ручной апдейт

После `git push` локально, на VPS:

```powershell
cd C:\app
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

`deploy.ps1`: `git pull` → `docker compose build` → `up -d` →
чистка старых слоёв.

### Вариант Б — авто-деплой по push (webhook)

1. Скачай `webhook.exe` (https://github.com/adnanh/webhook) в
   `C:\webhook\`.

2. `C:\webhook\hooks.json`:

```json
[
  {
    "id": "deploy",
    "execute-command": "powershell.exe",
    "pass-arguments-to-command": [
      { "source": "string", "name": "-ExecutionPolicy" },
      { "source": "string", "name": "Bypass" },
      { "source": "string", "name": "-File" },
      { "source": "string", "name": "C:\\app\\deploy.ps1" }
    ],
    "trigger-rule": {
      "match": {
        "type": "payload-hmac-sha256",
        "secret": "ПРИДУМАЙ_СЕКРЕТ",
        "parameter": { "source": "header", "name": "X-Hub-Signature-256" }
      }
    }
  }
]
```

3. Запусти как службу (через NSSM):

```powershell
nssm install fanvue-webhook "C:\webhook\webhook.exe" `
  "-hooks C:\webhook\hooks.json -port 9000 -verbose"
nssm start fanvue-webhook
```

4. Дополни Caddyfile:

```
ТВОЙ-ДОМЕН.com {
    handle /hooks/* { reverse_proxy localhost:9000 }
    handle          { reverse_proxy localhost:3000 }
}
```
`net stop caddy; net start caddy`.

5. GitHub → репо → Settings → Webhooks → Add webhook:
   - Payload URL: `https://твой-домен.com/hooks/deploy`
   - Content type: `application/json`
   - Secret: тот же
   - Just the push event.

Теперь каждый push в `main` → GitHub зовёт хук → `deploy.ps1`
пересобирает контейнер. Простой 5–20 сек.

---

## 5. Шпаргалка

```powershell
docker compose logs -f app       # логи
docker compose restart app       # рестарт без ребилда
docker compose up -d --build     # пересобрать и поднять
docker compose down              # стоп
docker volume ls                 # увидеть fanvue-data
```

Бэкап БД:

```powershell
docker run --rm -v fanvue-data:/data -v ${PWD}:/backup alpine `
  tar czf /backup/fanvue-data-$(Get-Date -Format yyyyMMdd).tgz -C /data .
```

---

## 6. Чего НЕ делать

- Не коммить `.env` (он в `.gitignore`/`.dockerignore`).
- Не маппь `./:/app` в контейнер — прод работает из собранного
  `dist/` и `server/dist/`, hot-reload не нужен.
- Не меняй внутренний порт 3000 без правки `server/env.ts`.
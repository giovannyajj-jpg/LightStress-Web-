# LightStress — Web oficial

## Qué es esto

Web con status **real** del servidor Bedrock LightStress (`LightStress.xyz:19132`), tienda, rangos gratuitos, eventos, sorteos, Discord y equipo.

**No incluye chat en vivo transmisor** (bidireccional web ↔ servidor) — se decidió excluirlo de este alcance.

## Arquitectura

```
Servidor Minecraft Bedrock (LightStress.xyz:19132)
        ↓  (RakNet Unconnected Ping/Pong — UDP, protocolo público de Bedrock)
Backend Node.js/Express (backend/server.js + backend/bedrock-ping.js)
        ↓  (HTTP + Server-Sent Events)
Frontend estático (frontend/index.html + css/js)
```

- **Puerto usado por el backend:** `PORT` (por defecto 3000), sirve tanto la API como el frontend estático.
- **Protocolo hacia el servidor de Minecraft:** UDP, RakNet Unconnected Ping (puerto `SERVER_PORT`, 19132 por defecto). Es el mismo protocolo que usan launchers oficiales y verificadores de status públicos — **no requiere modificar nada del servidor de Minecraft**.
- **Endpoints públicos:**
  - `GET /api/status` — status cacheado (se refresca solo cada `PING_INTERVAL_MS`).
  - `GET /api/status/stream` — Server-Sent Events, empuja actualizaciones sin polling agresivo del cliente.
  - `GET /api/products`, `/api/free-ranks`, `/api/events`, `/api/raffles` — leen los JSON en `backend/config/`.
- **Autenticación:** ninguno de estos endpoints requiere autenticación porque solo exponen información pública (status, catálogo). No hay ningún endpoint administrativo ni de consola expuesto.
- **Anti-abuso:** `express-rate-limit` limita cada IP a 60 requests/minuto sobre `/api`.

## Por qué no hay lista de nombres de jugadores (decisión tomada)

El protocolo Unconnected Ping/Pong de Bedrock solo entrega: MOTD, versión, **cantidad** de jugadores y máximo. **No incluye los nombres** — esos solo existen en la memoria del proceso del servidor. Mostrar nombres reales requeriría un plugin/endpoint dentro del propio servidor (Genisys/PocketMine) que exponga esa lista. Se decidió, por ahora, mostrar solo `X / MAX` y omitir esa parte.

Si más adelante quieres nombres reales, la ruta más simple es: un plugin que escriba cada pocos segundos un `players.json` (o exponga un mini endpoint HTTP interno) con los nombres conectados, y este backend lo consulta igual que ya consulta el status — sin tocar el frontend.

## Instalación

```bash
cd backend
npm install
cp .env.example .env
# edita .env si tu SERVER_IP/SERVER_PORT son distintos
npm start
```

Abre `http://localhost:3000` (o el `PORT` que configures).

## Configuración sin tocar código

Edita directamente estos archivos y refresca la página — no hace falta tocar el frontend:

- `backend/config/products.json` — tienda (nombre, precio, descripción, imagen, beneficios, categoría).
- `backend/config/free-ranks.json` — rangos gratuitos.
- `backend/config/events.json` — próximos eventos (con countdown automático si `date`/`time` son futuros).
- `backend/config/raffles.json` — sorteos activos.

## Pasarela de pagos

**No se implementó ninguna pasarela real.** Los botones "Comprar" muestran un aviso de que la compra aún no está conectada. `products.json` ya tiene la forma que necesitarías para conectar Mercado Pago, PayPal o Stripe más adelante (precio, id de producto, etc.) sin rehacer el frontend.

## Lo que falta si quieres el alcance completo del brief original

- **Lista de nombres de jugadores en tiempo real:** requiere un plugin del lado del servidor (ver sección de arriba).
- **Chat en vivo bidireccional:** excluido explícitamente de este alcance por tu propia decisión.
- **Pasarela de pagos real:** requiere credenciales y decisión de proveedor (Mercado Pago/PayPal/Stripe).

## Notas de seguridad

- Ningún secreto, token ni contraseña vive en el frontend.
- El backend nunca expone comandos, RCON ni consola del servidor.
- Todas las variables sensibles van en `.env` (no versionado; usa `.env.example` como plantilla).

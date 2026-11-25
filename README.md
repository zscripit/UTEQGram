# UTEQGram

Aplicación web progresiva (PWA) para compartir momentos de la UTEQ. Funciona sin conexión: el feed se ve con la última copia descargada y los posts creados sin internet se envían solos al recuperar la red.

**App publicada:** https://uteqgram.scrip-dev.workers.dev

## Pantallas

| Pantalla | Ruta | Generación |
| --- | --- | --- |
| Home / Feed | `/` | Cliente (`feed.js` crea las tarjetas) |
| Crear post | Panel sobre `/` | Cliente |
| Ayuda | `/help/` | Estática |
| Sin conexión | `/offline` | Estática, la entrega el service worker |

## Datos

- **Remotos:** tabla `post` en Supabase (API REST).
- **Locales:** archivos de la app en Cache Storage (`static-*`, `dynamic-*`) y copia del feed en IndexedDB (`posts`).
- **Offline:** cola de posts pendientes en IndexedDB (`sync-posts`), enviada con Background Sync, eventos de la página y reintentos cada 5 s.

## Estructura

```
public/
  index.html        Home / feed
  help/index.html   Ayuda
  offline.html      Página sin conexión
  manifest.json     Web App Manifest
  sw.js             Service worker
  _headers          Cabeceras de Cloudflare (sw.js sin caché)
  src/js/           app.js, feed.js, utility.js, idb.js
  src/css/          Estilos
  src/images/       Imágenes e íconos
wrangler.jsonc      Configuración de Cloudflare Workers
```

## Uso

Requisitos: Node.js y pnpm.

```bash
pnpm install
pnpm start          # servidor local en http://127.0.0.1:8080
pnpm run deploy     # publica en Cloudflare (requiere `pnpm exec wrangler login`)
```

Al cambiar archivos de la app, sube la versión de `CACHE_STATIC_NAME` en `public/sw.js` para que los usuarios reciban la nueva versión.

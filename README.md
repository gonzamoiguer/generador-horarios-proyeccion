# Grilla de proyección

Herramienta web para armar la grilla horaria de una serie de videos a proyectar.

- Arrastrá una carpeta o archivos de video (o elegilos con los botones). La duración se lee automáticamente.
- Definí la hora de inicio y se calcula el inicio y fin de cada video.
- Agregá separadores con duración ajustable (individualmente o "entre todos").
- Editá nombres y duraciones, reordená arrastrando (⋮⋮) o con ↑ ↓, eliminá con ✕.
- Varias proyecciones en pestañas nombrables (doble clic para renombrar).
- Todo se guarda automáticamente en el navegador (localStorage).
- Exportá con "Copiar CSV" o "Descargar CSV" (Inicio, Fin, Duración, Nombre).

Duraciones: se escriben como `hh:mm:ss`, `mm:ss` o un número solo (minutos).

## Desarrollo

No tiene dependencias. Requiere Node 18+.

```bash
npm run dev      # http://localhost:5173
npm run build    # genera dist/
```

## Deploy en Cloudflare (Workers, build automático desde Git)

1. Cloudflare Dashboard → Workers & Pages → Create → Import a repository → elegí este repo.
2. Build command: `npm run build`
3. Deploy command: `npx wrangler deploy`
4. Guardar. Cada push a la rama principal hace build y deploy automáticamente.

La configuración está en `wrangler.jsonc` (sirve `dist/` como sitio estático).

Alternativa con Cloudflare Pages: build command `npm run build`, output directory `dist`.

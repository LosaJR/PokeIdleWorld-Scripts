# Bandeja de actualizaciones

Sube aquí el archivo `.user.js` nuevo y haz commit directamente en `main`.

GitHub Actions identificará el script por su cabecera `@name` + `@namespace`, comprobará que `@version` sea superior a la publicada, lo moverá a `src/`, validará el código, generará `dist/`, `.meta.js`, `manifest.json` e `index.html`, rotará `backup/previous/`, desplegará GitHub Pages y eliminará el archivo de `incoming/`.

No edites `src/`, `dist/` ni `backup/` para una actualización normal.

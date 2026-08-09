# Bandeja de actualizaciones

Para una actualización normal, sube a `incoming/` una pareja con el mismo nombre base:

- `nombre-version.user.txt` o `nombre-version.user.js`
- `nombre-version.changelog.txt`

Ejemplo:

- `pokegrid-boss-damage-meter-v1.0.6.user.txt`
- `pokegrid-boss-damage-meter-v1.0.6.changelog.txt`

GitHub Actions espera hasta que estén los dos archivos. Cuando la pareja está completa, identifica el script por `@name` + `@namespace`, comprueba que `@version` sea superior a la publicada, mueve el userscript a `src/`, valida el código, genera `dist/`, `.meta.js`, `manifest.json` e `index.html`, rota `backup/previous/`, actualiza el changelog propio del script y `CHANGELOG.md`, despliega GitHub Pages y elimina ambos archivos de `incoming/`.

El archivo `.changelog.txt` debe contener solo el texto de los cambios. La versión, el nombre del script y la fecha se añaden automáticamente.

No edites `src/`, `dist/`, `backup/` ni los changelogs para una actualización normal.

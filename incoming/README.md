# Bandeja de actualizaciones

Para una actualización normal, sube a `incoming/` el userscript y su TXT de cambios.

## Formato recomendado

Los archivos entregados para cada script se pueden subir directamente, sin renombrarlos.

El userscript puede venir como cualquiera de estos formatos:

- `nombre-version.user.js`
- `nombre-version.user.txt`
- `nombre-version.txt`

Si se usa un `.txt` normal, el procesador comprueba que contenga una cabecera `==UserScript==` válida antes de aceptarlo como script.

El registro de cambios individual puede subirse directamente con el formato:

- `actualizaciones-nombre-version.txt`

Ejemplo:

- `pokegrid-hunt-intelligence-1.1.28.txt`
- `actualizaciones-hunt-intelligence-1.1.28.txt`

También son válidos:

- `pokegrid-boss-damage-meter-1.0.6.user.js`
- `actualizaciones-boss-damage-meter-1.0.6.txt`

- `piw-qol-es-9.10.28.user.js`
- `actualizaciones-piw-qol-es-9.10.28.txt`

El procesador reconoce el prefijo `actualizaciones-` y normaliza automáticamente el prefijo `pokegrid-` para emparejar cada TXT con su userscript.

## Formato clásico compatible

También sigue siendo válido el formato anterior con el mismo nombre base:

- `nombre-version.user.txt` o `nombre-version.user.js`
- `nombre-version.changelog.txt`

Ejemplo:

- `pokegrid-boss-damage-meter-v1.0.6.user.txt`
- `pokegrid-boss-damage-meter-v1.0.6.changelog.txt`

GitHub Actions espera hasta que estén los dos archivos. Cuando la pareja está completa, identifica el script por `@name` + `@namespace`, comprueba que `@version` sea superior a la publicada, mueve el userscript a `src/`, valida el código, genera `dist/`, `.meta.js`, `manifest.json` e `index.html`, rota `backup/previous/`, actualiza el changelog propio del script y `CHANGELOG.md`, despliega GitHub Pages y elimina ambos archivos de `incoming/`.

Los archivos `.changelog.txt` clásicos pueden contener solo el texto de los cambios. Los archivos `actualizaciones-*.txt` pueden ser los informes completos entregados junto al script.

No edites `src/`, `dist/`, `backup/` ni los changelogs para una actualización normal.

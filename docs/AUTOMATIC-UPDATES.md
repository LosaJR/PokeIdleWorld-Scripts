# Actualizaciones automáticas

Cada userscript contiene:

- `@version`: versión instalada.
- `@updateURL`: archivo `.meta.js` usado para comprobar versiones.
- `@downloadURL`: archivo `.user.js` usado para descargar la actualización.

Tampermonkey compara `@version`. Por ello, toda corrección o rollback se publica con un número superior al instalado. La pestaña del juego debe recargarse para ejecutar el código nuevo.

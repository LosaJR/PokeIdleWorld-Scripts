# Poke Idle World Scripts

Repositorio de distribución de userscripts de Tampermonkey para Poke Idle World.

## Scripts publicados

- `piw-qol-es.user.js`
- `pokegrid-script-bridge-health-agent.user.js`
- `pokegrid-game-structure-monitor.user.js`
- `pokegrid-hunt-intelligence.user.js`
- `pokegrid-decision-detector.user.js`

Cada archivo conserva su `@name` y `@namespace` originales para que la primera instalación desde GitHub Pages reemplace el script ya instalado en lugar de crear una copia distinta.

## Actualizaciones automáticas

Los scripts publicados incluyen:

- `@version`
- `@updateURL`
- `@downloadURL`

Tampermonkey consulta el archivo `.meta.js` y descarga el `.user.js` cuando detecta una versión superior.

## Flujo normal

1. Editar el archivo estable correspondiente en `src/`.
2. Aumentar su `@version`.
3. Subir el cambio a `main`.
4. GitHub Actions valida la sintaxis, las cabeceras y la versión.
5. La distribución anterior pasa a `backup/previous/`.
6. La versión nueva se publica en `dist/` y GitHub Pages.

## Respaldo

`backup/previous/` contiene una sola copia completa: la distribución inmediatamente anterior a la actual.

## Rollback

En **Actions → Rollback a la versión anterior → Run workflow**:

- Indicar `all` para restaurar toda la distribución anterior.
- Indicar el nombre estable de un archivo para restaurar solamente ese script.
- Normalmente dejar `version` vacío: el sistema incrementará automáticamente el parche de cada script por separado.
- La versión manual solo se admite cuando se restaura un único script.

Así, si `1.2.4` está rota, el código anterior puede publicarse automáticamente como `1.2.5`, y Tampermonkey lo recibirá como una actualización.

## Comandos locales

```bash
npm run validate
npm run build
npm run publish:local
ROLLBACK_SCRIPT=pokegrid-hunt-intelligence npm run rollback:local
```

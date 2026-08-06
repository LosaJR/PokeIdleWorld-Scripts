# Poke Idle World Scripts

Repositorio preparado para distribuir userscripts de Tampermonkey con actualización automática, GitHub Pages, un único respaldo rotatorio y rollback manual.

## Estado actual

La infraestructura está creada, pero `src/` está vacío hasta confirmar cuáles son los cinco scripts realmente instalados y cuáles son sus últimas versiones.

## Flujo normal

1. Colocar o actualizar un archivo `*.user.js` en `src/`.
2. Incrementar `@version`.
3. Subir el cambio a `main`.
4. GitHub Actions valida las cabeceras y que la versión sea superior.
5. La publicación actual de `dist/` pasa a `backup/previous/`.
6. Se genera y publica la nueva versión en `dist/` y GitHub Pages.
7. Tampermonkey detecta la nueva versión mediante `@updateURL` y la descarga mediante `@downloadURL`.

## Respaldo

Solo se conserva una copia en `backup/previous/`: la versión inmediatamente anterior a la publicada.

## Rollback

Desde GitHub Actions, ejecutar **Rollback a la versión anterior** e indicar una versión superior a la defectuosa. Por ejemplo, si `1.5.0` está rota, restaurar el código anterior como `1.5.1`. Esto permite que Tampermonkey lo trate como una actualización.

## Comandos locales

```bash
npm run validate
npm run build
npm run publish:local
ROLLBACK_VERSION=1.5.1 npm run rollback:local
```

## Configuración

El repositorio está configurado para `LosaJR/PokeIdleWorld-Scripts` y su publicación mediante GitHub Pages.

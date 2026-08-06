# Poke Idle World Scripts

Distribución de cinco userscripts de Tampermonkey con actualización automática, GitHub Pages, respaldo rotatorio y rollback manual.

## Scripts

- PIW-QOL ES
- PokeGrid - Detector de Decisiones y Suministros
- PokeGrid - Game Structure Monitor
- PokeGrid - Hunt Intelligence
- PokeGrid - Script Bridge & Health Agent

## Publicación

1. Los originales publicados en `dist/` sirven como primera versión y respaldo inicial.
2. Los scripts editables están en `src/` con una versión superior.
3. Al integrar cambios en `main`, GitHub Actions valida sintaxis y cabeceras.
4. La distribución anterior pasa a `backup/previous/`.
5. La nueva distribución se publica mediante GitHub Pages.

## Rollback

El workflow **Rollback a la versión anterior** restaura el código de `backup/previous/`. Cada script recibe automáticamente una versión patch superior a la que estaba publicada, por lo que Tampermonkey lo acepta como actualización.

## Comandos locales

```bash
npm run validate
npm run build
npm run publish:local
npm run rollback:local
```

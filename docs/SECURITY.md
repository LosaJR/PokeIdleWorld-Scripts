# Seguridad de publicación

- No se publican contraseñas, tokens privados, cookies ni claves API.
- Los scripts solo se sirven desde GitHub Pages del repositorio.
- Cualquier cambio de código exige incrementar `@version`.
- El flujo de publicación valida sintaxis, identidad de Tampermonkey y URLs de actualización.
- Antes de sustituir la versión activa, se conserva la versión inmediatamente anterior en `backup/previous/`.
- Un rollback restaura el código anterior con un número de versión nuevo y superior.

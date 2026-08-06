# Rollback

Si una publicación falla, ejecuta el workflow **Rollback a la versión anterior**.

- Para un solo script, selecciona su archivo y deja la versión vacía para incrementar automáticamente el parche, o indica una versión superior.
- Para todos los scripts, selecciona `all`; cada archivo recibe su propio incremento de parche.
- El código defectuoso pasa a `backup/previous/` y el código anterior vuelve a `dist/` con una versión superior para que Tampermonkey lo reconozca como actualización.

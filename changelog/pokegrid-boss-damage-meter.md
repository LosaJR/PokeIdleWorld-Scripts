# PokeGrid - Boss Damage Meter

## 1.0.6 — 2026-08-10

POKE IDLE WORLD — ACTUALIZACIONES DE SCRIPT
Fecha: 2026-08-10

IMPORTANTE
==========
Esta versión se ha creado como archivo local para entregarla directamente.
NO se ha subido ni publicado esta versión nueva en GitHub.

PokeGrid - Boss Damage Meter
Versión anterior: 1.0.5
Versión nueva:    1.0.6

AÑADIDO
-------
- Se añade botón X para cerrar manualmente el Damage Meter.
- Se añade FINISH_AUTO_CLOSE_MS = 4500.
- Al finalizar una run, el panel se cierra automáticamente tras 4,5 segundos.
- Se añade closePanelForRun() como ruta única para cerrar la ventana y marcar
  que el usuario no quiere que vuelva a abrirse durante esa misma run.
- El modo fallback también recibe un botón X propio.
- Se añade control del cierre de la ventana creada por Bridge UI Core.

MODIFICADO
----------
- Bridge UI Core cambia de closable:false a closable:true.
- Al comenzar una nueva run se limpia el estado de cierre manual y cualquier
  temporizador de autocierre anterior, permitiendo que el medidor vuelva a
  mostrarse para el nuevo Boss.
- La API pública close() reutiliza closePanelForRun().

ELIMINADO / CORREGIDO
---------------------
- Se elimina la configuración closable:false que impedía cerrar el medidor con X.
- Se elimina la lógica duplicada de cierre de la API pública y se centraliza en
  closePanelForRun().
- No se elimina ninguna función de cálculo de daño, reparto por Pokémon,
  detección de HP efectivo, Top 6, reset de run ni heartbeat.

COMPORTAMIENTO FINAL
--------------------
- Si se pulsa X durante una run, la ventana permanece cerrada durante esa run.
- Al comenzar una nueva run puede abrirse de nuevo.
- Tras terminar el Boss, el resultado permanece visible unos segundos y luego
  se cierra automáticamente.

VALIDACIÓN
----------
- node --check superado.
- Cabecera de versión comprobada.
- Nuevas funciones y comportamientos comprobados.
- Bloques eliminados/corregidos comprobados.

SHA-256
-------
af677d44715df27afadc7f0d331cddc9afecacda7b49136c5d4be3a87161e89e

Historial de versiones generado automáticamente desde `incoming/`.

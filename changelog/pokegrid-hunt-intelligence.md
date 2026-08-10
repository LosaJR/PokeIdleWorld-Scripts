# PokeGrid - Hunt Intelligence

## 1.1.27 — 2026-08-10

POKE IDLE WORLD — ACTUALIZACIONES DE SCRIPT
Fecha: 2026-08-10

IMPORTANTE
==========
Esta versión se ha creado como archivo local para entregarla directamente.
NO se ha subido ni publicado esta versión nueva en GitHub.

PokeGrid - Hunt Intelligence
Versión anterior: 1.1.26
Versión nueva:    1.1.27

AÑADIDO
-------
- Se añade una calibración independiente para XP/h mediante
  rowExpectedXphForCalibration().
- Se añade xpFactor como factor específico para corregir la proyección de XP/h.
- Se expone speedFactor como alias explícito del factor de velocidad/kills.
- La calibración de XP compara la XP/h base realmente observada con la XP/h
  esperada por PIWTools en las muestras históricas compatibles.
- La apertura automática desde el botón Mapa fuerza la ventana de Hunt
  Intelligence a estado minimizado.

MODIFICADO
----------
- La marca personal deja de usar el mismo factor para kills/h y XP/h.
  * factor / speedFactor sigue representando el rendimiento de velocidad.
  * xpFactor representa el rendimiento real de experiencia.
- La XP/h estimada en hunts usa xpFactor cuando existen datos históricos
  utilizables, en vez de heredar directamente el factor de kills/h.
- El escalado del loot continúa vinculado a la velocidad real (kills/h), no al
  nuevo factor de XP.
- El encabezado "Tu XP/h" pasa a mostrarse como "Tu XP/h estimada".
- Las referencias visibles a "XP/h personal" del histórico pasan a indicar
  "XP/h real histórico", dejando claro qué dato es medido y cuál es proyectado.
- Los identificadores internos de versión/guards se actualizan de V1126 a
  V1127 y las APIs públicas pasan a informar 1.1.27.

ELIMINADO / CORREGIDO
---------------------
- Se elimina la llamada inválida fuera de ámbito:
  huntAccessLevel(huntResult?.lead)
  dentro de "No capturados".
- "No capturados" utiliza ahora el accessLevel calculado por el motor y, como
  respaldo, el nivel del Pokémon líder. Esto corrige el error
  "huntAccessLevel is not defined".
- Se elimina la dependencia de la XP proyectada respecto del único factor de
  velocidad; ahora kills/h y XP/h disponen de calibraciones separadas.
- Se sustituyen las etiquetas ambiguas "XP/h personal" y "Tu XP/h" por nombres
  que distinguen histórico real y estimación.

CONSERVADO
----------
- No se eliminan el recomendador de hunts, No capturados, Item Finder,
  supervisor de rendimiento, histórico, VIP, bonus diario ni tracking de loot.
- Las muestras históricas existentes siguen siendo compatibles.
- Las muestras de leveo continúan pudiendo calibrar el rendimiento frente a
  PIWTools.

VALIDACIÓN
----------
- node --check superado.
- Cabecera de versión comprobada.
- Nuevas funciones y comportamientos comprobados.
- Bloques eliminados/corregidos comprobados.

SHA-256
-------
557312aa4c77f538f1608ded6eeebd36eaf7f7e36b8b9279fb5d09df55b9e4dc

Historial de versiones generado automáticamente desde `incoming/`.

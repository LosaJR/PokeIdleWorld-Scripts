# Poke Idle World Scripts — Changelog

## Poke Idle World - Quality of Life (PIW-QOL ES) 9.10.28 — 2026-08-10

POKE IDLE WORLD — ACTUALIZACIONES DE SCRIPT
Fecha: 2026-08-10

IMPORTANTE
==========
Esta versión se ha creado como archivo local para entregarla directamente.
NO se ha subido ni publicado esta versión nueva en GitHub.

Poke Idle World - Quality of Life (PIW-QOL ES)
Versión anterior: 9.10.27
Versión nueva:    9.10.28

AÑADIDO
-------
- Se añade Quality al Capture Log.
- Se añade enhanceCaptureLogQuality().
- La calidad se representa mediante data-script-capture-quality y CSS ::after,
  sin insertar texto dentro de los nodos nativos del registro.
- Se añade color del tier de calidad mediante
  --script-capture-quality-color.
- Cuando el porcentaje de potencial está activado, el Capture Log muestra:
  Q ×<calidad> · <potencial>%
- Al recibirse una actualización WebSocket de Pokémon se refrescan tanto la
  calidad del equipo como la del Capture Log.

MODIFICADO
----------
- El manejo del evento "pokes" deja de ejecutar únicamente
  enhancePartyQuality() y pasa a actualizar también Capture Log.
- runDOMEnhancements() pasa a ejecutar enhanceCaptureLogQuality().
- El mensaje de carga de la versión refleja el nuevo comportamiento.
- La versión y SCRIPT_BUILD pasan de 9.10.27 a 9.10.28.

ELIMINADO / SUSTITUIDO
----------------------
- Se elimina removeCaptureLogEnhancements().
- Se elimina el comportamiento anterior que borraba cualquier mejora de
  calidad del Capture Log en cada ciclo del MutationObserver.
- No se modifica ni sustituye textContent de las filas nativas del Capture Log.
  Esto se hace expresamente para conservar intactos sus filtros y ordenaciones.

SEGURIDAD DEL CAPTURE LOG
-------------------------
- La fila solo recibe Quality cuando puede asociarse de forma única con un
  Pokémon conocido usando nombre + IV.
- Si la coincidencia es ambigua o falta la calidad, no se inventa ningún dato y
  se retira únicamente la capa visual del script.
- Los filtros y ordenaciones nativos siguen trabajando sobre el contenido
  original del juego.

VALIDACIÓN
----------
- node --check superado.
- Cabecera de versión comprobada.
- Nuevas funciones y comportamientos comprobados.
- Bloques eliminados/corregidos comprobados.

SHA-256
-------
8c814a516ad40628555ebd9457068e20965082052c136f5511efee045f0f72c1

## PokeGrid - Hunt Intelligence 1.1.27 — 2026-08-10

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

## PokeGrid - Boss Damage Meter 1.0.6 — 2026-08-10

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

Historial general generado automáticamente a partir de los archivos `.changelog.txt` subidos junto a cada actualización en `incoming/`.

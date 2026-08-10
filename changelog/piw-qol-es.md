# Poke Idle World - Quality of Life (PIW-QOL ES)

## 9.10.28 — 2026-08-10

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

Historial de versiones generado automáticamente desde `incoming/`.

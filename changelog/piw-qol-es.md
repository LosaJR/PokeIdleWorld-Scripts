# Poke Idle World - Quality of Life (PIW-QOL ES)

## 9.10.29 — 2026-08-10

POKE IDLE WORLD — PIW-QOL ES
ACTUALIZACIONES DE LA VERSIÓN 9.10.29
Fecha: 2026-08-10

VERSIÓN
=======
Anterior: 9.10.28
Nueva:    9.10.29

OBJETIVO PRINCIPAL
==================
Corregir la identificación de Quality en Capture Log.

La versión 9.10.28 intentaba reconstruir cada captura buscando en la colección
actual un Pokémon con el mismo nombre + IV. Ese método fallaba cuando:
- existían dos Pokémon con el mismo nombre e IV;
- el Pokémon capturado ya se había vendido o movido y no estaba disponible en
  la colección usada por PIW-QOL;
- una captura histórica no podía distinguirse de otra únicamente por nombre e IV.

AÑADIDO
=======
- Historial local persistente de Quality de capturas:
  script_capture_quality_history_v1
- El historial conserva hasta 300 capturas recientes.
- PIW-QOL escucha ahora explícitamente el evento WebSocket "catch-result".
- Cuando llega una captura, intenta extraer inmediatamente:
  * identificador de captura/Pokémon;
  * especie;
  * nombre;
  * IV total;
  * Quality;
  * shiny;
  * nivel;
  * fecha/hora.
- Si "catch-result" no contiene todos los datos, PIW-QOL espera la siguiente
  actualización "pokes" y detecta qué Pokémon nuevo ha aparecido.
- Se añade una cola temporal de capturas pendientes con caducidad de 15 segundos.
- Se añade reconciliación entre la captura pendiente y el Pokémon nuevo usando,
  cuando existen:
  * ID;
  * speciesId/pokeId;
  * nombre;
  * IV.
- Se añade lectura de la fecha/hora visible de cada fila del Capture Log.
  Ejemplo reconocido:
  10/08, 20:29
- El timestamp de la fila se utiliza para distinguir capturas con el mismo
  Pokémon y los mismos IV.
- Se añade inspección segura de las props/fibers de React asociados a la propia
  fila del Capture Log. Si el juego mantiene internamente Quality u otros datos
  de la captura aunque no los muestre, PIW-QOL puede reutilizarlos.
- Se añade detección de ambigüedad al inspeccionar datos internos:
  si aparecen dos candidatos igualmente válidos con distinta Quality/ID,
  PIW-QOL NO selecciona uno al azar.
- Se añade un atributo interno de diagnóstico:
  data-script-capture-quality-source
  cuyos valores pueden ser:
  * native
  * history
  * owned

MODIFICADO
==========
- enhanceCaptureLogQuality() deja de depender directamente de una única búsqueda
  por nombre + IV.
- El nuevo orden de resolución es:

  1. Datos nativos/ocultos de la propia fila del Capture Log.
  2. Historial local guardado en el momento real de la captura.
  3. Colección actual del jugador como último respaldo.

- Las capturas nuevas quedan asociadas de forma persistente aunque posteriormente
  vendas el Pokémon.
- Dos Pokémon con el mismo nombre e IV pueden distinguirse mediante el momento
  de captura.
- Cuando la colección actual contiene varios Pokémon con mismo nombre + IV,
  PIW-QOL intenta usar sus timestamps internos si el juego los proporciona.
- Cuando una fila puede resolverse de forma fiable mediante datos nativos o la
  colección actual, esa información se guarda también en el nuevo historial
  para futuras aperturas del Capture Log.
- El histórico se ordena de más reciente a más antiguo y se limita
  automáticamente a 300 entradas.
- Se evita reescribir localStorage continuamente cuando una entrada ya está
  almacenada sin cambios.
- El mensaje de consola de carga se actualiza para reflejar el nuevo sistema.

ELIMINADO / SUSTITUIDO
======================
- Eliminado como método principal el emparejamiento:
  "nombre del Pokémon + IV total = una única coincidencia en la colección".
- Eliminada la condición de 9.10.28 que solo mostraba Quality cuando
  matches.length === 1.
- Se elimina la posibilidad de escoger arbitrariamente una Quality cuando hay
  dos candidatos internos igualmente válidos.
- Nombre + IV NO desaparece totalmente: se conserva únicamente como respaldo
  cuando produce una coincidencia inequívoca.

COMPORTAMIENTO CON CAPTURAS ANTIGUAS
====================================
- Si el propio Capture Log/React conserva internamente Quality o un objeto de
  captura, 9.10.29 intentará recuperarlo y podrá mostrar Quality incluso en
  registros anteriores a esta versión.
- Si el Pokémon antiguo sigue en la colección y puede identificarse de forma
  inequívoca, también podrá recuperarse y quedará guardado en el nuevo historial.
- Si una captura antigua no contiene Quality en los datos internos del juego,
  el Pokémon ya no existe en la colección y nunca fue registrada por 9.10.29,
  no existe una fuente fiable con la que reconstruir retrospectivamente su
  Quality. En ese caso la fila queda sin Quality en vez de inventar un valor.

CONSERVADO
==========
- El Capture Log nativo sigue sin recibir texto dentro de sus nodos originales.
- Quality y potencial continúan dibujándose mediante data-attributes + CSS
  ::after.
- Los filtros y ordenaciones nativos del Capture Log no se modifican.
- Se conserva el cálculo de potencial 75% Quality / 25% IV.
- Se conserva el color correspondiente al tier de Quality.
- Se conservan todas las demás funciones de PIW-QOL.

VALIDACIÓN
==========
- JavaScript validado correctamente con:
  node --check
- Cabecera @version comprobada: 9.10.29.
- SCRIPT_BUILD comprobado: 9.10.29.
- Confirmada escucha de catch-result.
- Confirmado historial persistente de capturas.
- Confirmada asociación mediante timestamp.
- Confirmada detección de candidatos ambiguos.
- Confirmado que la antigua condición matches.length !== 1 ya no forma parte
  del Capture Log.

SHA-256
=======
76cf5fdf8415454194b8032c9ff096af67f3be1b282095a33ca876c89642e123

ARCHIVOS
========
Script:
piw-qol-es-9.10.29.txt

Registro de cambios:
actualizaciones-piw-qol-es-9.10.29.txt

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

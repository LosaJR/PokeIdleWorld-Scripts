# Poke Idle World Scripts — Changelog

## Poke Idle World - Quality of Life (PIW-QOL ES) 9.10.34 — 2026-08-10

POKE IDLE WORLD — PIW-QOL ES
ACTUALIZACIONES DE LA VERSIÓN 9.10.34
Fecha: 2026-08-10

VERSIÓN
=======
Anterior: 9.10.33
Nueva:    9.10.34

REPLANTEAMIENTO COMPLETO DE CAPTURE LOG
=======================================
Se elimina por completo la arquitectura experimental usada entre 9.10.29 y
9.10.33 para reconstruir la Quality de las capturas.

El nuevo Auditor General demuestra que el propio juego ya dispone de una fuente
autoritaria y completa:

GET /api/game/capture-log?filter=all

Cada fila devuelta por esa API contiene directamente:
- id propio del registro de Capture Log;
- speciesId;
- nombre;
- nivel;
- shiny;
- quality;
- ivTotal;
- ballName;
- firstCatch;
- timestamp "at";
- looktype.

Por tanto, PIW-QOL ya no necesita observar ni reconstruir capturas.

CAUSA REAL DE LOS FALLOS ANTERIORES
===================================
1. Se estaba intentando reconstruir información que el propio Capture Log ya
   proporciona directamente.

2. El ID de "poke-delta" NO es el mismo ID que utiliza la fila almacenada por
   Capture Log.

   Ejemplo observado en el auditor para la misma captura:
   - poke-delta:
     cmsnmp7o40xq7qan1yqh9xu2a
   - Capture Log:
     cmsnmp7o60xq9qan161ljssz4

   Ambos corresponden a Geodude IV 71 Quality 1.342, pero son identificadores
   distintos.

3. Por esa diferencia, intentar guardar poke-delta y más tarde asociarlo a una
   fila de Capture Log obligaba a usar nombre, IV, hora, orden u otras
   aproximaciones.

4. Eso explica que algunas filas apareciesen bien y otras no, incluso aunque
   poke-delta contuviese la Quality correcta.

5. Las versiones anteriores añadieron cada vez más lógica de:
   - catch-result;
   - poke-delta;
   - pokes;
   - snapshots de colección;
   - buffers temporales;
   - localStorage;
   - timestamps;
   - matching por nombre + IV.

   Toda esa lógica deja de ser necesaria.

AÑADIDO
=======
- Nueva implementación basada únicamente en la API oficial de Capture Log.
- Se utilizan las filas nativas ".clog-row" del juego.
- Se detecta la pestaña nativa activa ".clog-tab.on".
- PIW-QOL consulta exactamente:
  * /api/game/capture-log?filter=all
  * /api/game/capture-log?filter=shiny
  * /api/game/capture-log?filter=normal
  según la pestaña activa.
- Se añade una pequeña caché por filtro para evitar peticiones redundantes.
- Cada filtro mantiene su propia promesa de carga para evitar mezclar respuestas
  si el usuario cambia rápidamente entre All / Shiny / Normal.
- Se usa el ID exacto de la fila de Capture Log cuando React lo conserva
  accesible en las props internas.
- Si el ID no puede recuperarse desde React, la fila se asocia únicamente contra
  la MISMA respuesta de /api/game/capture-log usando:
  * nombre;
  * IV;
  * nivel;
  * minuto visible;
  * Poké Ball;
  * tier de Quality visible.
- Si dos registros siguen siendo visualmente idénticos, se consumen siguiendo el
  orden entregado por la propia API.
- La Quality se sigue mostrando mediante data-attributes + CSS ::after.
- Se conserva el porcentaje de potencial cuando esa preferencia está activada.
- Se guarda como diagnóstico interno:
  * capture-api-id
  * capture-api-match
  * capture-api-order

ELIMINADO
=========
- Eliminado el historial local de capturas como fuente de datos.
- Eliminado script_capture_quality_history_v1 como fuente.
- Eliminado script_capture_quality_history_v2 como fuente.
- Ambos historiales experimentales se borran al iniciar 9.10.34.
- Eliminada la cola pendingCaptureResults.
- Eliminado el buffer recentPokemonAdditions.
- Eliminada la sincronización periódica de "pokes" para registrar capturas.
- Eliminado refreshLatestPokemon() de la lógica de Capture Log.
- Eliminado rememberCaptureResult().
- Eliminado rememberCapturedPokemonDelta().
- Eliminada la escucha de catch-result para Capture Log.
- Eliminada la escucha de poke-delta para Capture Log.
- Eliminada la comparación de IDs nuevos de la colección.
- Eliminado el matching contra la colección actual del jugador.
- Eliminado el matching contra capturas persistidas por PIW-QOL.
- Eliminada la necesidad de registrar nada mientras Capture Log está cerrado.
- Eliminada la dependencia del orden catch-result -> poke-delta -> pokes.
- Eliminada la lógica de rehidratación de Pokémon para Capture Log.
- Eliminados los reintentos temporizados de snapshots de Pokémon.
- Eliminados los límites de edad de capturas pendientes y buffers recientes.

COMPORTAMIENTO NUEVO
====================
- Capture Log puede permanecer cerrado todo el tiempo.
- PIW-QOL NO necesita registrar ninguna captura en segundo plano.
- El servidor ya conserva las entradas de Capture Log con su Quality.
- Cuando abras Capture Log más tarde, PIW-QOL consulta directamente esa API.
- Si capturaste Pokémon con la ventana cerrada, sus datos siguen estando en la
  API y se muestran al abrirla.
- Al refrescar el juego no se pierde nada porque no dependemos de localStorage.
- "Clear history" funciona de forma natural:
  la API elimina sus filas y PIW-QOL simplemente muestra el nuevo estado.
- Una captura vendida o movida sigue teniendo Quality en Capture Log porque la
  información pertenece al registro del servidor, no a la colección actual.

POR QUÉ ESTE SISTEMA ES MÁS FIABLE
==================================
La Quality deja de ser un dato "reconstruido".

Antes:
captura -> evento -> guardar -> intentar identificar fila -> mostrar

Ahora:
Capture Log -> leer su propia fila del servidor -> mostrar su Quality

La fuente de datos y la ventana visual son el mismo sistema.

CONSERVADO
==========
- No se modifica el textContent original de las filas.
- No se eliminan ni reemplazan nombre, nivel, IV, Poké Ball o fecha.
- Los filtros y ordenaciones del juego siguen trabajando con su contenido
  original.
- Se conserva el color visual de Quality.
- Se conserva el porcentaje de potencial configurable.
- Se conservan todas las demás funciones de PIW-QOL sin cambios.
- La Quality del equipo, mercado, depósito, ventas y demás sistemas sigue
  utilizando su lógica existente; solo Capture Log ha sido reescrito.

VALIDACIÓN
==========
- JavaScript validado correctamente con node --check.
- @version comprobada: 9.10.34.
- SCRIPT_BUILD comprobado: 9.10.34.
- Confirmado que Capture Log usa ".clog-row".
- Confirmado que usa ".clog-tab.on".
- Confirmado acceso directo a /api/game/capture-log?filter=...
- Confirmado que no queda pendingCaptureResults.
- Confirmado que no queda recentPokemonAdditions.
- Confirmado que no queda rememberCaptureResult().
- Confirmado que no queda rememberCapturedPokemonDelta().
- Confirmado que Capture Log ya no depende de pokes-get.
- Confirmado que los historiales v1/v2 solo aparecen para ser eliminados.

SHA-256
=======
7a66b4b028447ff415d3adf53dfd0a3bfe3f77ccb2e1aed15b5fa564d8ea0ab6

ARCHIVOS
========
Script:
piw-qol-es-9.10.34.txt

Registro de cambios:
actualizaciones-piw-qol-es-9.10.34.txt

## Poke Idle World - Quality of Life (PIW-QOL ES) 9.10.33 — 2026-08-10

POKE IDLE WORLD — PIW-QOL ES
ACTUALIZACIONES DE LA VERSIÓN 9.10.33
Fecha: 2026-08-10

VERSIÓN
=======
Anterior: 9.10.32
Nueva:    9.10.33

CAUSA REAL DETECTADA CON EL AUDITOR
===================================
El auditor demuestra que el servidor ya entrega los datos exactos del Pokémon
capturado mediante un evento WebSocket "poke-delta" inmediatamente después de
un "catch-result" exitoso.

Ejemplo observado:
- catch-result success:true
- 11 ms después: poke-delta
- poke-delta contiene:
  * ID único del Pokémon capturado
  * speciesId
  * nombre
  * nivel
  * shiny
  * IV total
  * Quality exacta
  * estadísticas y demás datos del Pokémon

Las versiones 9.10.29–9.10.32 NO escuchaban "poke-delta". En su lugar intentaban
reconstruir la captura comparando listas completas "pokes", timestamps,
nombre + IV y el estado del Capture Log.

SEGUNDO FALLO GRAVE DETECTADO
=============================
La 9.10.32 trataba todos los eventos "catch-result" como capturas pendientes,
incluidos los que tenían:

success: false

Eso permitía que un intento de captura fallido permaneciese en la cola y,
cuando más tarde entraba un Pokémon de una captura correcta, esa captura fallida
pudiera apropiarse del nuevo Pokémon durante la reconciliación.

El auditor muestra claramente intentos fallidos sin poke-delta y capturas
exitosas que sí van seguidas de poke-delta.

TERCER PROBLEMA CORREGIDO
=========================
La 9.10.32 persistía cualquier ID nuevo observado en una lista "pokes".

Eso tampoco es seguro, porque un ID puede aparecer por otros motivos:
- retirar un Pokémon del depósito;
- breeding;
- movimientos entre almacenamientos;
- otras acciones futuras del juego.

Por tanto, "ID nuevo en pokes" ya NO equivale automáticamente a "captura".

AÑADIDO
=======
- Soporte directo del evento WebSocket "poke-delta".
- Nueva función rememberCapturedPokemonDelta().
- El poke-delta se acepta como captura únicamente cuando existe un
  catch-result success:true pendiente compatible.
- Asociación por:
  * especie/nombre;
  * speciesId cuando está disponible;
  * proximidad temporal;
  * ID exacto contenido en poke-delta.
- Al recibir el poke-delta correcto se guarda directamente:
  * ID;
  * speciesId;
  * nombre;
  * IV total;
  * Quality;
  * shiny;
  * nivel;
  * timestamp del catch-result exitoso.
- La instantánea local latestPokemon se actualiza directamente con poke-delta,
  evitando tener que descargar/comparar toda la colección para registrar la
  captura.
- Nuevo historial limpio:
  script_capture_quality_history_v2

MODIFICADO
==========
- catch-result solo crea una captura pendiente cuando:
  success === true
- Los catch-result fallidos únicamente limpian expirados y no entran en la cola.
- poke-delta pasa a ser la fuente primaria/canónica para registrar Quality.
- Las consultas repetidas de "pokes" se conservan únicamente como fallback por
  si algún caso excepcional no entrega poke-delta.
- reconcileCapturedPokemon() queda como sistema de respaldo.
- El buffer recentPokemonAdditions sigue existiendo para cubrir órdenes de
  eventos anómalos, pero deja de persistir automáticamente cualquier ID nuevo.
- Capture Log continúa siendo solamente una vista del historial guardado y no
  participa en la captura de datos.
- El mensaje de consola se actualiza para indicar que poke-delta es la fuente
  exacta de ID, IV y Quality.

ELIMINADO / SUSTITUIDO
======================
- Eliminado el registro de intentos catch-result con success:false.
- Eliminada la persistencia automática de cualquier nuevo ID observado en pokes.
- Eliminada como estrategia principal la reconstrucción de una captura mediante
  comparación de listas completas.
- Nombre + IV deja de intervenir en el registro de nuevas capturas.
  Solo permanece como fallback para mostrar datos antiguos cuando no exista una
  entrada exacta.
- Se deja de utilizar el historial v1 como fuente principal porque puede contener
  asociaciones incorrectas creadas durante las pruebas de 9.10.29–9.10.32.

POR QUÉ SE CREA UN HISTORIAL V2
===============================
Las versiones anteriores podían haber guardado:
- timestamps incorrectos;
- capturas asociadas a intentos fallidos;
- Pokémon añadidos por motivos distintos a una captura.

Migrar esos datos mantendría errores antiguos. La 9.10.33 empieza un historial
técnico limpio usando script_capture_quality_history_v2.

Esto NO borra el Capture Log nativo del juego. Solo deja de utilizar el historial
interno experimental anterior de PIW-QOL.

FLUJO CORRECTO DESDE 9.10.33
============================
1. El juego intenta capturar.
2. Si catch-result.success === false:
   - PIW-QOL no registra nada.
3. Si catch-result.success === true:
   - PIW-QOL abre una captura pendiente con timestamp.
4. Milisegundos después llega poke-delta.
5. poke-delta contiene el Pokémon capturado completo.
6. PIW-QOL verifica que corresponda al catch-result exitoso.
7. Guarda ID + IV + Quality exactos en localStorage.
8. Capture Log puede estar abierto o cerrado; no importa.
9. Al abrir Capture Log posteriormente, la Quality se obtiene del historial
   exacto ya guardado.
10. Después de refrescar la página, el historial v2 permanece disponible.

DATOS OBSERVADOS EN EL AUDITOR
==============================
Durante la sesión auditada hubo 4 capturas exitosas de Geodude con poke-delta:

- IV 140 · Quality 1.056
- IV 105 · Quality 1.266
- IV 98  · Quality 1.104
- IV 83  · Quality 0.889

En todos esos casos el poke-delta llegó entre aproximadamente 11 y 58 ms después
del catch-result exitoso.

También hubo intentos success:false y ninguno de ellos fue seguido por un
poke-delta de captura.

VALIDACIÓN
==========
- JavaScript comprobado con node --check: CORRECTO.
- @version: 9.10.33.
- SCRIPT_BUILD: 9.10.33.
- Confirmado listener para poke-delta.
- Confirmado que success:false no entra en pendingCaptureResults.
- Confirmado que pokes ya no persiste cualquier ID nuevo.
- Confirmado historial limpio v2.
- Confirmado que no quedan referencias explícitas a 9.10.32.

SHA-256
=======
088b1340d3866afe2bc9729555ef655949c167e74494f21a968152a91e18219c

ARCHIVOS
========
Script:
piw-qol-es-9.10.33.txt

Registro de cambios:
actualizaciones-piw-qol-es-9.10.33.txt

## Poke Idle World - Quality of Life (PIW-QOL ES) 9.10.32 — 2026-08-10

POKE IDLE WORLD — PIW-QOL ES
ACTUALIZACIONES DE LA VERSIÓN 9.10.32
Fecha: 2026-08-10

VERSIÓN
=======
Anterior: 9.10.31
Nueva:    9.10.32

CAUSA DEL FALLO
===============
La 9.10.31 seguía teniendo una dependencia indirecta de Capture Log.

Aunque ya existía un buffer de Pokémon recién añadidos, la detección más fiable
de nuevos IDs se forzaba principalmente cuando Capture Log estaba abierto y
aparecía una fila nueva. Si la ventana permanecía cerrada, el script podía no
solicitar una instantánea fresca de "pokes" en el momento de la captura y esa
Quality no quedaba persistida.

Eso provocaba que:
- con Capture Log abierto funcionase correctamente;
- con Capture Log cerrado algunas capturas no quedasen registradas;
- al abrirlo posteriormente faltasen esas Quality.

AÑADIDO
=======
- Registro de Quality completamente independiente de Capture Log.
- Cada evento "catch-result" dispara automáticamente consultas frescas de
  Pokémon en segundo plano.
- Las consultas se realizan aproximadamente a:
  * 0 ms
  * 180 ms
  * 500 ms
  * 1000 ms
  * 1800 ms
- Esto cubre el retraso entre el resultado de captura y el momento en que el
  Pokémon nuevo aparece realmente en la lista "pokes".
- Se añade CAPTURE_BACKGROUND_SYNC_DELAYS_MS.
- Se añade scheduleBackgroundCaptureSync().
- Cualquier ID nuevo observado en "pokes", después de la hidratación inicial,
  se guarda inmediatamente en el historial persistente de Quality.
- El guardado ya no necesita que:
  * Capture Log esté abierto;
  * exista una fila nueva en pantalla;
  * catch-result contenga directamente la Quality.

MODIFICADO
==========
- handleGameSocketMessage() usa catch-result como señal de sincronización de
  fondo además de intentar leer sus datos internos.
- rememberRecentPokemonAdditions() ya no se limita a mantener un buffer temporal:
  también persiste inmediatamente cada nuevo Pokémon detectado.
- Si posteriormente catch-result proporciona una hora más precisa, la entrada
  persistente se actualiza mediante el mismo ID.
- Capture Log pasa a ser únicamente un consumidor/visualizador del historial
  ya recopilado.
- La sincronización basada en filas introducida en 9.10.31 se conserva solo
  como respaldo adicional, no como requisito para registrar una captura.
- Mensaje de carga actualizado para indicar que las capturas se registran en
  segundo plano.

ELIMINADO / SUSTITUIDO
======================
- Eliminada la dependencia funcional de tener Capture Log abierto para que una
  captura quede registrada correctamente.
- La aparición de una fila nueva deja de ser el mecanismo principal que provoca
  la captura de datos.
- Se elimina la necesidad de abrir Capture Log poco después de capturar para
  que PIW-QOL detecte el ID nuevo.
- No se elimina la sincronización visual de 9.10.31: permanece como respaldo
  para reconstrucciones y casos excepcionales.

FLUJO NUEVO
===========
1. PIW-QOL carga una instantánea inicial de tus Pokémon.
2. Capture Log puede permanecer completamente cerrado.
3. Se captura un Pokémon.
4. PIW-QOL recibe catch-result.
5. En segundo plano solicita varias instantáneas frescas de "pokes".
6. Detecta el ID que no existía en la instantánea anterior.
7. Guarda inmediatamente:
   - ID;
   - especie;
   - nombre;
   - IV;
   - Quality;
   - shiny;
   - nivel;
   - timestamp.
8. Más tarde, al abrir Capture Log, la ventana solo consulta ese historial.
9. Después de refrescar la página, el historial continúa disponible mediante
   localStorage.

PROTECCIÓN DE HIDRATACIÓN
=========================
- La primera lista de Pokémon recibida tras cargar/refrescar el juego se usa
  únicamente como línea base.
- No se interpreta toda la colección existente como capturas nuevas.
- Solo los IDs que aparecen después de esa línea base se registran como nuevas
  incorporaciones.

CONSERVADO
==========
- Historial persistente de hasta 300 entradas.
- Asociación por timestamp.
- Protección frente a candidatos ambiguos.
- Soporte de datos nativos/React de Capture Log.
- Sincronización adicional cuando Capture Log está abierto.
- Rehidratación automática tras refresh.
- Quality y potencial mediante CSS/data-attributes sin alterar el textContent
  nativo.
- Filtros y ordenaciones originales.
- Todas las demás funciones de PIW-QOL.

VALIDACIÓN
==========
- JavaScript validado correctamente con node --check.
- @version comprobada: 9.10.32.
- SCRIPT_BUILD comprobado: 9.10.32.
- Confirmado que catch-result llama a scheduleBackgroundCaptureSync().
- Confirmado que los nuevos IDs de pokes se persisten directamente mediante
  rememberCaptureQualityEntry().
- Confirmado que no quedan referencias internas a 9.10.31.

SHA-256
=======
7b94dfef35c8cc5d611b3df965ececd6af20b5fc2add185d1026c04a849a2ba1

ARCHIVOS
========
Script:
piw-qol-es-9.10.32.txt

Registro de cambios:
actualizaciones-piw-qol-es-9.10.32.txt

## Poke Idle World - Quality of Life (PIW-QOL ES) 9.10.31 — 2026-08-10

POKE IDLE WORLD — PIW-QOL ES
ACTUALIZACIONES DE LA VERSIÓN 9.10.31
Fecha: 2026-08-10

VERSIÓN
=======
Anterior: 9.10.30
Nueva:    9.10.31

CAUSA CONFIRMADA
================
La 9.10.30 tenía un buffer de Pokémon recién añadidos, pero ese buffer solo se
utilizaba para resolver una captura cuando también existía un evento
"catch-result" pendiente.

En la práctica, el juego puede actualizar Capture Log sin proporcionar un
catch-result con datos suficientes para identificar la Quality. Por eso:

- La nueva fila aparecía inicialmente sin Quality.
- Después de refrescar, los Pokémon con nombre + IV únicos podían reconstruirse
  desde la colección actual.
- Dos Pokémon iguales con los mismos IV seguían siendo ambiguos.
- Un Pokémon que ya no estaba disponible en la colección tampoco podía
  reconstruirse.

AÑADIDO
=======
- La aparición o modificación de filas en Capture Log pasa a ser una señal
  primaria de que puede haber ocurrido una nueva captura.
- Se añade un fingerprint por ventana de Capture Log para detectar:
  * aumento de filas;
  * cambio de la fila superior;
  * re-render del listado.
- Se añade captureLogWindowState mediante WeakMap.
- Se añade scheduleCaptureLogFreshSync().
- Cada cambio real de Capture Log dispara consultas frescas de Pokémon en:
  * 0 ms
  * 250 ms
  * 700 ms
  * 1400 ms
- Esto cubre el desfase entre:
  * la aparición visual de la captura;
  * la incorporación real del Pokémon a la lista "pokes".
- Se añade findRecentCaptureDescriptor().
- Se añade recentCaptureAdditionKey().
- Las filas nuevas pueden resolverse directamente contra el buffer de Pokémon
  recién añadidos aunque NO exista ningún catch-result pendiente.
- El buffer de adiciones recientes se conserva durante 90 segundos para cubrir
  re-renders y aperturas inmediatas de Capture Log.
- Se añade la fuente de diagnóstico "recent" en:
  data-script-capture-quality-source

NUEVO ORDEN DE RESOLUCIÓN
=========================
Para cada fila del Capture Log:

1. Datos internos/nativos de la propia fila.
2. Pokémon recién añadido detectado mediante una instantánea fresca de "pokes".
3. Historial persistente de capturas guardadas.
4. Colección actual como último respaldo.

La novedad importante es el punto 2: una captura nueva se identifica mientras
todavía sabemos exactamente qué ID acaba de añadirse.

MODIFICADO
==========
- enhanceCaptureLogQuality() acepta ahora un modo interno skipFreshSync para
  evitar bucles cuando la propia sincronización vuelve a renderizar.
- Al detectar una nueva fila se solicita una lista fresca aunque latestPokemon
  ya contenga datos.
- Cada Pokémon nuevo detectado se asocia por:
  * nombre;
  * IV;
  * minuto de captura;
  * ID nuevo respecto a la instantánea anterior.
- Si se resuelve mediante el buffer reciente, la entrada se guarda
  inmediatamente en localStorage.
- Varias capturas con el mismo nombre e IV dentro del mismo minuto se consumen
  de más reciente a más antigua, sin reutilizar el mismo ID.
- El histórico persistente sigue siendo el mecanismo utilizado después de
  refrescar la página.

ELIMINADO / SUSTITUIDO
======================
- Se elimina la dependencia de que exista un catch-result pendiente para usar
  recentPokemonAdditions.
- La colección actual deja de ser la primera fuente útil para una captura nueva.
- Nombre + IV deja de ser el mecanismo normal de identificación en tiempo real;
  queda únicamente como respaldo.
- Se evita que una fila nueva permanezca sin intentar una sincronización fresca
  simplemente porque latestPokemon ya estuviera cargado.

CASO DE DOS POKÉMON IGUALES
===========================
Ejemplo:

Geodude IV 114/192 — captura A — ID 123
Geodude IV 114/192 — captura B — ID 456

La 9.10.30 podía ver dos candidatos después de refrescar y no sabía cuál
correspondía a cada fila.

La 9.10.31 detecta el ID que se acaba de añadir en cada captura y guarda cada
Quality por separado. Tras refrescar ya no necesita volver a adivinar usando
solo nombre + IV.

CONSERVADO
==========
- Historial persistente de hasta 300 capturas.
- Lectura de la hora del Capture Log.
- Inspección de datos internos de React cuando existen.
- Protección frente a coincidencias ambiguas.
- Rehidratación automática tras refresh.
- Compatibilidad con catch-result si el juego sí proporciona datos útiles.
- Quality/potencial mediante CSS y data-attributes, sin modificar el textContent
  nativo ni los filtros/ordenaciones del Capture Log.
- Todas las demás funciones de PIW-QOL.

VALIDACIÓN
==========
- JavaScript validado correctamente con node --check.
- @version comprobada: 9.10.31.
- SCRIPT_BUILD comprobado: 9.10.31.
- Confirmada resolución directa mediante recentPokemonAdditions.
- Confirmadas las cuatro consultas frescas al cambiar Capture Log.
- Confirmado que recentPokemonAdditions ya no depende de un catch-result
  pendiente para pintar y persistir una fila.

SHA-256
=======
42619f01259d3be5c03cce6e07b8de1e84e31306e1a24895b5170ccf4acb7afd

ARCHIVOS
========
Script:
piw-qol-es-9.10.31.txt

Registro de cambios:
actualizaciones-piw-qol-es-9.10.31.txt

## Poke Idle World - Quality of Life (PIW-QOL ES) 9.10.30 — 2026-08-10

POKE IDLE WORLD — PIW-QOL ES
ACTUALIZACIONES DE LA VERSIÓN 9.10.30
Fecha: 2026-08-10

VERSIÓN
=======
Anterior: 9.10.29
Nueva:    9.10.30

PROBLEMAS CORREGIDOS
====================
1. Después de refrescar completamente el juego, latestPokemon volvía a estar vacío.
   PIW-QOL esperaba pasivamente a que el juego enviase otro evento "pokes", por lo
   que Capture Log podía quedarse sin mostrar ninguna Quality tras un refresh.

2. Existía una carrera entre los eventos "pokes" y "catch-result".
   La 9.10.29 funcionaba correctamente principalmente cuando catch-result llegaba
   antes que la actualización de Pokémon. Si el Pokémon nuevo llegaba primero,
   podía mostrarse temporalmente por la colección actual pero no quedar registrado
   en el historial persistente.

3. Después de reiniciar Capture Log, un registro antiguo del historial local podía
   llegar a reutilizarse como respaldo únicamente porque coincidían nombre + IV,
   aunque la hora de captura fuese distinta.

AÑADIDO
=======
- Buffer temporal recentPokemonAdditions para conservar Pokémon recién añadidos
  durante 20 segundos.
- El buffer permite reconciliar una captura tanto si el orden recibido es:
    catch-result -> pokes
  como si es:
    pokes -> catch-result
- Se añade resolvePendingCapturesFromRecentAdditions().
- Se añade rememberRecentPokemonAdditions().
- Se añade purgeRecentPokemonAdditions().
- Se añade refreshLatestPokemon().
- PIW-QOL solicita activamente "pokes-get" después de una recarga completa.
- Al detectar Capture Log abierto sin colección cargada, solicita inmediatamente
  la lista de Pokémon.
- Se realizan reintentos de hidratación tras iniciar el DOM para evitar depender
  de que ocurra una captura nueva.
- Se añade CAPTURE_RECENT_ADDITION_MAX_AGE_MS = 20000.
- Se añade CAPTURE_ROW_MATCH_MAX_DELTA_MS = 120000.

MODIFICADO
==========
- El procesamiento de un evento "pokes" registra primero las nuevas adiciones,
  después reconcilia capturas pendientes y finalmente actualiza latestPokemon.
- rememberCaptureResult() intenta también resolver inmediatamente contra Pokémon
  que hayan aparecido unos segundos antes.
- reconcileCapturedPokemon() ya no depende de un único orden de eventos.
- El histórico persistente sigue usando localStorage, pero ahora recibe registros
  de forma fiable en ambos órdenes de WebSocket.
- findStoredCaptureDescriptor() prioriza capturas almacenadas dentro del mismo
  minuto mostrado por Capture Log.
- Cuando existen varias capturas iguales en el mismo minuto, se consumen de más
  reciente a más antigua, siguiendo el orden visual del Capture Log.
- El tiempo máximo de una captura pendiente pasa de 15 a 20 segundos.
- El mensaje de carga de PIW-QOL se actualiza a la lógica de 9.10.30.

ELIMINADO / SUSTITUIDO
======================
- Se elimina la dependencia de esperar pasivamente a un futuro evento "pokes"
  después de refrescar la página.
- Se elimina la suposición de que catch-result siempre llega antes que pokes.
- Se elimina el fallback peligroso que permitía asociar una entrada antigua del
  historial cuando una fila tenía fecha/hora pero no existía ninguna captura
  reciente compatible.
- Si Capture Log contiene hora, una entrada histórica con el mismo nombre + IV
  pero una hora claramente distinta ya NO puede utilizarse como coincidencia.
- No se elige arbitrariamente entre dos candidatos con la misma puntuación.

COMPORTAMIENTO DESPUÉS DE REFRESCAR
===================================
- El historial guardado en localStorage se carga al iniciar el script.
- PIW-QOL vuelve a solicitar la colección actual automáticamente.
- Capture Log puede reconstruir las Quality guardadas sin esperar a realizar una
  nueva captura.
- Las capturas nuevas quedan persistidas aunque pokes y catch-result lleguen en
  orden inverso.

COMPORTAMIENTO DESPUÉS DE "CLEAR HISTORY"
=========================================
- Reiniciar el Capture Log del juego no borra automáticamente el historial técnico
  interno de PIW-QOL, porque puede seguir siendo útil para otras entradas.
- Sin embargo, los registros antiguos NO se aplican a las nuevas filas si sus
  timestamps no coinciden.
- De este modo un Larvitar antiguo con IV 133 no puede prestar por accidente su
  Quality a un Larvitar nuevo con IV 133 capturado mucho después.

CONSERVADO
==========
- Resolución mediante datos internos/nativos de la propia fila cuando existen.
- Historial persistente de hasta 300 capturas.
- Identificación por hora de captura.
- Colección actual como último respaldo.
- Quality y potencial dibujados mediante CSS/data-attributes sin alterar el
  textContent nativo de Capture Log.
- Filtros y ordenaciones originales del juego.
- Todas las demás funciones de PIW-QOL.

VALIDACIÓN
==========
- JavaScript validado correctamente con node --check.
- @version comprobada: 9.10.30.
- SCRIPT_BUILD comprobado: 9.10.30.
- Confirmado buffer de adiciones recientes.
- Confirmada rehidratación mediante pokes-get.
- Confirmada compatibilidad con ambos órdenes catch-result/pokes.
- Confirmado que el fallback histórico antiguo por nombre + IV ya no se usa
  cuando la fila dispone de hora y no coincide temporalmente.

SHA-256
=======
a4a4f53591cbf460439e75d6f88670637a7d4e2aa7c36464d747a3c6db97ed13

ARCHIVOS
========
Script:
piw-qol-es-9.10.30.txt

Registro de cambios:
actualizaciones-piw-qol-es-9.10.30.txt

## Poke Idle World - Quality of Life (PIW-QOL ES) 9.10.29 — 2026-08-10

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

## PokeGrid - Hunt Intelligence 1.1.28 — 2026-08-10

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.28
Fecha: 2026-08-10

VERSIÓN
=======
Anterior: 1.1.27
Nueva:    1.1.28

OBJETIVO PRINCIPAL
==================
Simplificar el Histórico y hacer que el rendimiento personal se adapte de forma
natural al nivel y estadísticas actuales del Pokémon, sin arrastrar cantidades
indefinidas de muestras antiguas.

AÑADIDO
=======
- Ventana móvil de 12 muestras válidas por combinación:
  Hunt + Pokémon + cuenta.
- Cada muestra continúa siendo una ventana fija de 30 minutos.
- 12 muestras equivalen aproximadamente a las últimas 6 horas útiles de datos
  para esa Hunt y ese Pokémon.
- Cuando entra la muestra número 13, se elimina automáticamente la más antigua
  de ese mismo Hunt + Pokémon y se conservan las 12 más recientes.
- Se añade HISTORY_WINDOW_SAMPLES = 12.
- Se añade HISTORY_TRIM_MIN_SAMPLES = 8.
- Se añade rollingHistoryKey() para identificar de forma estable cada ventana
  de Hunt + Pokémon por cuenta.
- Se añade historySampleValid() para que solo entren en el Histórico muestras
  completas y válidas para calibración.
- Se añade trimRollingHistory() para aplicar automáticamente el sistema FIFO
  de últimas 12 muestras.
- Se añade trimmedFactor() para calcular factores de rendimiento resistentes a
  valores anómalos.
- Cuando existen al menos 8 factores válidos, se descartan el factor más alto y
  el más bajo antes de calcular la media.
- El ranking de Hunts muestra ahora de forma explícita:
  * cuántas muestras recientes se están usando;
  * factor personal de velocidad;
  * factor personal de XP.

MODIFICADO
==========
- getPersonalEstimate() se ha simplificado por completo.
- Ya no intenta buscar primero una muestra "exacta" del nivel actual.
- Ya no necesita buscar una banda de niveles cercanos.
- Las últimas 12 muestras del Hunt + Pokémon son la fuente del rendimiento
  personal, independientemente de que el Pokémon haya subido de nivel.
- Cada muestra se normaliza contra lo que PIWTools esperaba durante esa propia
  muestra:
    factor velocidad = kills/h reales / kills/h esperadas
    factor XP        = XP/h base real / XP/h base esperada
- La estimación actual aplica esos factores recientes a la predicción actual de
  PIWTools.
- El factor de velocidad y el factor de XP continúan siendo independientes.
- El histórico de loot (Items/h y Raros/h) usa también las muestras recientes
  retenidas y se escala según la velocidad actual estimada.
- La calibración auxiliar almacenada en localStorage se reconstruye a partir del
  histórico retenido, por lo que ya no arrastra muestras eliminadas.
- persist() aplica automáticamente el límite móvil una vez que la migración a
  ventanas fijas de 30 minutos está disponible.
- La migración a ventanas fijas ahora recorta a las 12 muestras recientes solo
  después de haber convertido correctamente los datos antiguos.
- Histórico agrupa ahora por Hunt + Pokémon, no por Hunt + Pokémon + ataque.
  Si durante las 12 muestras se usaron varios ataques, se muestran resumidos en
  la misma línea.
- La columna "Muestras" muestra ahora el estado como, por ejemplo, 7/12 o 12/12.
- El texto explicativo de Histórico indica que:
  * la ventana es móvil;
  * el nivel ya no invalida las muestras;
  * la muestra más antigua sale cuando entra una nueva;
  * se eliminan extremos cuando hay suficientes datos.
- "Muestras completas" pasa a mostrarse como "Muestras retenidas".
- La fuente del ranking pasa a identificarse internamente como
  "historico-reciente".
- Descripción, Health Agent, APIs públicas, guards internos y mensajes de
  consola actualizados a v1.1.28.

ELIMINADO / SUSTITUIDO
======================
- Eliminada la lógica de "coincidencia exacta" por nivel para decidir el
  rendimiento personal.
- Eliminada la lógica de levelBand que limitaba las muestras históricas a una
  franja de niveles cercanos al nivel actual.
- Eliminada la ponderación por proximidad de nivel.
- Eliminada la distinción de ranking:
  "histórico exacto" frente a "marca personal calibrada por nivel".
- Eliminadas las etiquetas del tipo:
  "marca personal Nv.X–Y → Nv.Z".
- Eliminado el crecimiento indefinido del Histórico activo.
- Las muestras que exceden las 12 más recientes del mismo Hunt + Pokémon dejan
  de formar parte del Histórico activo y de la calibración.
- Las muestras de 30 minutos marcadas como no válidas para calibración ya no se
  guardan dentro de la ventana histórica.
- El ataque/MT deja de crear una línea histórica independiente. Los ataques de
  las muestras recientes se resumen dentro del mismo Hunt + Pokémon.

COMPORTAMIENTO DE MIGRACIÓN
============================
- Al cargar 1.1.28 sobre 1.1.27, el histórico existente se normaliza
  automáticamente.
- Para cada Hunt + Pokémon se conservan solamente las 12 muestras válidas más
  recientes.
- Las muestras más antiguas que excedan ese límite se eliminan del Histórico
  activo.
- Si existieran datos de una versión antigua todavía no convertidos a ventanas
  fijas, primero se convierten y después se aplica el límite de 12 para evitar
  pérdida prematura durante la migración.

QUÉ SE CONSERVA
===============
- Muestras fijas de 30 minutos.
- Seguimiento durante leveo sin reiniciar la muestra al subir de nivel.
- Timeline de rendimiento esperado de PIWTools dentro de una muestra.
- Separación entre XP real, XP base limpia, VIP y bonus diario.
- Medición real de Items/h y Raros/h.
- No Capturados.
- Item Finder.
- Recomendador de Hunts.
- Comparador.
- Supervisor de rendimiento.
- Integración con Script Bridge & Health Agent.
- Comportamiento de apertura desde Mapa introducido en 1.1.27.
- Corrección de "huntAccessLevel is not defined" introducida en 1.1.27.

VALIDACIÓN
==========
- JavaScript comprobado con node --check: CORRECTO.
- No quedan guards internos de v1.1.27.
- No queda la antigua lógica levelBand / exactRows / coincidencia exacta.
- Se ha comprobado que el código contiene el límite de 12 muestras y el recorte
  automático FIFO.
- SHA-256 del script entregado:
  c3aa609d7e67c1b9a0e96021ade0b738c9923fa6793626d76c132e3589f07c04

ARCHIVOS
========
Script:
pokegrid-hunt-intelligence-1.1.28.txt

Registro de cambios:
actualizaciones-hunt-intelligence-1.1.28.txt

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

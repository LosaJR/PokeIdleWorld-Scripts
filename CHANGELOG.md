# Poke Idle World Scripts — Changelog

## PokeGrid - Boss Damage Meter 1.0.8 — 2026-08-22

POKEGRID - BOSS DAMAGE METER
ACTUALIZACIONES v1.0.8
Fecha: 2026-08-22

VERSIÓN
- 1.0.7 -> 1.0.8

CAUSA DEL FALLO
- La 1.0.7 repetía el Boss a través de la interfaz nativa.
- Después de una victoria el modal de recompensas podía permanecer encima de la pantalla.
- El script conseguía abrir Bosses y seleccionar el Boss elegido, pero dependía de encontrar y pulsar un segundo botón visual para iniciar la pelea.
- En la interfaz actual ese segundo paso no era fiable, por lo que se veía Giant Cruel seleccionado pero la nueva run no llegaba a empezar.

CORRECCIÓN
1. Auto Boss deja de depender de clics en la interfaz de Bosses.
   - Se elimina la búsqueda de tarjetas/botones nativos del ciclo automático.
   - Ya no importa que el modal visual de recompensas siga visible unos instantes.

2. Ciclo usando el protocolo real del juego.
   - Después de bossOutcome="won" + bossLoot resuelto:
       leave-hunt
       espera 1,5 s
       joy-heal
       espera 1,5 s
       enter-hunt con el slug del Boss seleccionado
   - Este flujo coincide con el utilizado por una implementación actual específica de Auto Boss para Poke Idle World.

3. Reentrada directa en el Boss seleccionado.
   - El selector sigue utilizando los Bosses activos de /api/game/boss.
   - El slug se obtiene de arena.map para el Boss elegido.
   - Cambiar el Boss seleccionado cambia también el slug usado en la siguiente reentrada.

4. Bronze Boss Token.
   - Se mantiene el contador por itemId 70000.
   - Se refresca el inventario antes de reentrar y poco después de enviar enter-hunt.
   - Si el contador llega a 0, Auto Boss se detiene.

5. Protección contra dobles reentradas.
   - Una transición queda bloqueada mientras se ejecuta leave-hunt -> joy-heal -> enter-hunt.
   - La misma run no puede procesarse dos veces gracias a lastAutoBossRunKey.
   - Tras enviar enter-hunt hay una ventana de reintento de 7 s para evitar duplicados mientras llega el nuevo field-init.
   - Detener Auto Boss invalida cualquier transición pendiente.

6. Estado visible actualizado.
   - "Loot recibido · saliendo del Boss…"
   - "Fuera del Boss · curando equipo…"
   - "Equipo curado · entrando en <Boss>…"
   - "Reentrada enviada · esperando <Boss>"

IMPACTO
- El modal de recompensas ya no bloquea el siguiente combate.
- No es necesario volver a abrir/seleccionar el Boss mediante DOM después de cada victoria.
- La repetición usa la misma selección del Damage Meter y continúa hasta quedarse sin Bronze Boss Tokens o hasta que el usuario pulse Detener.

VALIDACIÓN
- node --check: CORRECTO.
- Orden de protocolo comprobado: leave-hunt -> joy-heal -> enter-hunt.
- Eliminados findNativeBossTarget/findNativeBossConfirm del ciclo automático.
- @version: 1.0.8.
- Guard: __pgBossDamageMeterV108.
- @updateURL y @downloadURL conservados.
- No publicado en GitHub.

ARCHIVOS
- pokegrid-boss-damage-meter-v1.0.8.txt
- actualizaciones-boss-damage-meter-v1.0.8.txt

## PokeGrid - Boss Damage Meter 1.0.7 — 2026-08-22

POKEGRID - BOSS DAMAGE METER
ACTUALIZACIONES v1.0.7
Fecha: 2026-08-22

VERSIÓN
- 1.0.6 -> 1.0.7

OBJETIVO
Añadir a la propia interfaz del Boss Damage Meter un modo opcional de repetición automática de Bosses, con selección del Boss y control visible de Bronze Boss Tokens.

CAMBIOS PRINCIPALES
1. Nuevo bloque "Auto Boss" dentro del Damage Meter.
   - Selector de Boss.
   - Botón "▶ Activar / ■ Detener".
   - Botón de actualización manual.
   - Estado del ciclo automático y contador de victorias automáticas.

2. Selección de Boss basada en la lista activa real del juego.
   - Los Bosses disponibles salen de /api/game/boss.
   - Nombre, nivel e imagen se completan con /game/bossCatalog.json.
   - Solo aparecen Bosses activos disponibles en ese momento.

3. Contador de Bronze Boss Token.
   - Se utiliza el itemId real 70000.
   - La cantidad se obtiene del inventario del juego por WebSocket/cache de window.__poke.
   - Mientras Auto Boss está activo, se solicita una actualización periódica del inventario.
   - Si la cantidad llega a 0, Auto Boss se detiene automáticamente.

4. Activación exclusivamente manual desde la interfaz.
   - Auto Boss siempre comienza APAGADO al cargar/recargar la página.
   - El Boss seleccionado sí se recuerda para comodidad.
   - El estado activo no se persiste deliberadamente.

5. Repetición después de victoria + loot.
   - No se inicia otra run simplemente porque el Boss llegue a 0 HP.
   - Se espera al field final con bossOutcome="won" y bossLoot resuelto.
   - Tras recibir el loot, se refrescan Bronze Tokens y se prepara la siguiente run.
   - Se evita procesar dos veces la misma victoria mediante la clave de run.

6. Inicio mediante la interfaz nativa del juego.
   - Se detecta y pulsa la entrada de Bosses del propio cliente.
   - Después se localiza el Boss elegido por nombre/key/imagen y se selecciona.
   - Si la versión del cliente muestra un segundo botón de confirmar/entrar/luchar, también se pulsa después de seleccionar el Boss.
   - No se ha inventado ningún payload para /api/game/boss/action: el formato exacto de esa petición no estaba capturado en las muestras disponibles.
   - Si el Boss no puede localizarse en la interfaz nativa, el script no envía una petición desconocida; muestra el estado y vuelve a intentarlo más tarde.

7. Integración con el Damage Meter existente.
   - Durante una run sigue funcionando el Top 6, daño efectivo, HP, hits y golpe máximo.
   - Mientras Auto Boss está activo, la ventana no se autocierra al terminar la run para mantener visibles controles, tokens y estado.
   - Con Auto Boss apagado se conserva el autocierre normal de la versión anterior.

8. Estado/API de diagnóstico.
   - getState() incluye enabled, Boss seleccionado, Bronze Tokens, estado, victorias y busy.
   - Se añaden refreshBronzeTokens() y setAutoBoss() al objeto de depuración, aunque la activación normal prevista sigue siendo desde la UI.

NOTA DE PRUEBA REAL
- La detección del Boss/confirmación usa la interfaz nativa visible del cliente y requiere una primera prueba real en PokeGrid.
- Si el cliente cambia nombres/clases de su panel de Bosses, el Damage Meter mostrará que no encuentra el Boss y reintentará, en lugar de ejecutar una acción de red no verificada.

VALIDACIÓN
- node --check: CORRECTO.
- @version: 1.0.7.
- Guard actualizado a __pgBossDamageMeterV107.
- No quedan referencias de ejecución a 1.0.6/V106.
- @updateURL y @downloadURL conservados.

ARCHIVOS
- pokegrid-boss-damage-meter-v1.0.7.txt
- actualizaciones-boss-damage-meter-v1.0.7.txt

## PokeGrid - Hunt Intelligence 1.1.47 — 2026-08-19

PokeGrid - Hunt Intelligence v1.1.47

Corrección principal: interfaz estable en PokeGrid 4x4 y 1x1.

CAUSA
- Hunt Intelligence estaba mezclando su propio estado plegado/desplegado con el estado minimizado y la geometría recordada por Bridge UI.
- Al cambiar una cuenta entre vista 4x4 y 1x1, Bridge podía reutilizar un tamaño/posición procedente de otro viewport.
- La apertura automática al pulsar Map utilizaba setMinimized(true). Durante los rerenders de carga/datos, ese estado podía combinarse con el cuerpo reconstruido y dejar una ventana grande prácticamente vacía.
- El cuerpo gestionado por Bridge tenía min-height:100% y overflow:visible, lo que podía hacer que el contenido excediera la altura útil de la ventana.

CAMBIOS
1. Dos modos de presentación explícitos y excluyentes:
   - manual-full: al pulsar el icono 🧠.
   - map-compact: al pulsar Map/Mapa.

2. Apertura manual desde 🧠:
   - Siempre fuerza Hunt Intelligence a ocupar el viewport disponible de ESA cuenta/webview.
   - left/top = 4 px.
   - width = 100vw - 8 px.
   - height = 100vh - 8 px.
   - No reutiliza el tamaño de una apertura anterior.
   - Se adapta automáticamente al pasar de 4x4 a 1x1 y viceversa.

3. Apertura automática desde Map:
   - Ya NO utiliza el minimizado de Bridge.
   - Se abre como una franja compacta superior.
   - Muestra la cabecera de Hunt Intelligence y los controles superiores de Hunts.
   - Oculta pestañas y cuerpo completo mientras está en modo Map compacto.
   - Anchura máxima 560 px, limitada siempre al ancho real del viewport.
   - En viewports pequeños ocupa como máximo el ancho disponible de la cuenta.
   - No puede aparecer como panel grande vacío durante el cálculo inicial.

4. Bridge UI:
   - rememberLayout desactivado específicamente para Hunt Intelligence.
   - La geometría se decide según el modo actual, no por un layout antiguo de Bridge.
   - minWidth reducido a 280 px y minHeight a 86 px para que el modo compacto sea válido también en vistas pequeñas.
   - Cada rerender vuelve a aplicar el modo actual, evitando saltos de tamaño al terminar una carga o actualizar datos.

5. Contenedor gestionado:
   - pg-ui-body usa flex con min-height:0 y overflow:auto.
   - Evita que el cuerpo fuerce una altura mayor que la ventana disponible.

6. Fallback sin Bridge:
   - Mantiene los mismos dos comportamientos: manual a viewport completo y Map compacto.

COMPORTAMIENTO ESPERADO
- 4x4 + clic 🧠: Hunt Intelligence ocupa toda la superficie disponible dentro de esa cuenta.
- 1x1 + clic 🧠: Hunt Intelligence vuelve a ocupar toda la superficie disponible del viewport grande.
- Alternar varias veces 4x4 ↔ 1x1 no debe recuperar tamaños viejos ni quedarse parcialmente abierto.
- Clic en Map: aparece solamente la zona superior compacta de Hunt Intelligence.
- Volver a pulsar 🧠 después de Map: se abre inmediatamente el panel completo.

VALIDACIÓN
- node --check: OK.
- setMinimized(true) en Hunt Intelligence: 0 usos.
- rememberLayout de Hunt Intelligence: false.
- Modo manual-full presente y conectado al botón 🧠.
- Modo map-compact presente y conectado a Map/Mapa.

No se ha publicado nada en GitHub.

## PokeGrid - Hunt Intelligence 1.1.46 — 2026-08-19

PokeGrid - Hunt Intelligence v1.1.46

CAMBIO PRINCIPAL
- Oro NPC/h pasa a priorizar el valor NPC REAL de los drops observados en las muestras personales de 30 minutos.
- Strange Pheromone y Bronze Boss Token quedan EXCLUIDOS de Oro NPC/h, tanto en histórico real como en la estimación de respaldo.
- Ambos especiales siguen contando normalmente en Especiales/h a valor 1:1.

COMPORTAMIENTO
1. Con histórico nuevo válido:
   - Se calcula el valor NPC de las unidades realmente obtenidas durante cada ventana de 30 minutos.
   - Se convierte a Oro NPC/h.
   - Se normaliza el bonus diario de loot para conservar una base comparable entre muestras.
   - Al evaluar la hunt actual se vuelve a aplicar el multiplicador diario correspondiente, igual que con Items/h/Raros/h/Especiales/h.
   - Hunt Intelligence usa este Oro NPC/h real en el ranking de Mejor general.

2. Sin histórico de oro válido:
   - Se mantiene la estimación de respaldo basada en kills/h y loot esperado.
   - La estimación también ignora completamente el valor NPC de Strange Pheromone y Bronze Boss Token.

3. Muestras antiguas:
   - No se inventa ni reconstruye Oro NPC/h de muestras anteriores porque esas filas no conservan el desglose necesario para recalcularlo con seguridad.
   - Hasta completar una nueva muestra compatible, esas hunts seguirán usando la estimación de respaldo sin especiales.

VISIBILIDAD / DIAGNÓSTICO
- La fuente del ranking indica ahora:
  * "oro NPC: histórico real sin especiales (N)" cuando existen muestras nuevas.
  * "oro NPC: estimación sin especiales" cuando todavía no existen.
- El panel de Rendimiento muestra "Oro NPC/h observado" para la muestra actual/última muestra válida.
- El supervisor expone goldMeasuredRows y la capability real-npc-gold-ph.

NO CAMBIA
- Especiales/h: Strange Pheromone + Bronze Boss Token siguen sumando 1 unidad cada uno.
- Items/h y Raros/h mantienen su comportamiento actual.
- XP/h, calibración PIWTools, Favoritos, No capturados, Item Finder y el resto de Hunt Intelligence no se modifican.
- Ventanas de histórico: siguen siendo de 30 minutos y se conservan hasta 12 muestras por Hunt + Pokémon.

VALIDACIÓN
- Base: Hunt Intelligence v1.1.45.
- JavaScript validado con node --check: OK.
- @updateURL y @downloadURL conservados.
- No publicado en GitHub.

## Poke Idle World - Quality of Life (PIW-QOL ES) 9.10.35 — 2026-08-19

PIW-QOL ES — Actualización 9.10.35
=================================

Fecha: 19/08/2026
Base utilizada: PIW-QOL ES 9.10.34 proporcionada por el usuario.

CAMBIOS
-------

1. Mercado Global: compra de varias unidades de un mismo anuncio
   - Los anuncios de objetos con más de 1 unidad ya no obligan a comprar de una en una.
   - Al pulsar «Comprar» se abre un selector de cantidad.
   - Se puede introducir cualquier cantidad entre 1 y el máximo permitido.
   - El valor inicial sugerido es 10 unidades cuando el anuncio/saldo lo permiten.

2. Límite automático por stock y saldo
   - La cantidad máxima se limita al stock disponible en el anuncio.
   - También se limita a las unidades que pueden pagarse con el saldo actual.
   - Si no hay saldo suficiente ni siquiera para una unidad, la compra se cancela y se muestra un aviso.

3. Confirmación de compra adaptada a la cantidad
   - La ventana de confirmación muestra:
       · cantidad total a comprar;
       · precio unitario;
       · coste total;
       · saldo estimado tras la compra.

4. Petición real al Mercado Global
   - La acción `buy-stack` ahora envía la cantidad seleccionada mediante `quantity` en lugar de forzar siempre `quantity: 1`.
   - Se mantienen `kind`, `refId`, `price`, `currency` e `ids` tal como los utilizaba la versión 9.10.34.

5. Actualización del stock mostrado
   - Tras una compra parcial se resta del anuncio exactamente la cantidad comprada.
   - Si se compra todo el stock restante, el anuncio desaparece de la lista.
   - Los Pokémon continúan siendo compras unitarias y no muestran selector de cantidad.

COMPATIBILIDAD
--------------

- Se mantienen sin cambios @updateURL y @downloadURL.
- No se han modificado otras funciones de PIW-QOL.
- No se ha publicado nada en GitHub.

VALIDACIÓN
----------

- `node --check`: OK.
- Versión de metadata: 9.10.35.
- SCRIPT_BUILD: 9.10.35.
- Comprobación de `buy-stack` con `quantity: purchaseQuantity`: OK.
- URLs de actualización GitHub conservadas: OK.

SHA-256 DEL SCRIPT
------------------
8bbb56e4804ac5d8c17ee434e75add09c2d02ec669ed1322c44957f92dacffce

## PokeGrid - Auditor General 1.0.3 — 2026-08-18

POKEGRID - AUDITOR GENERAL
ACTUALIZACIONES v1.0.3
Fecha: 2026-08-18

VERSIÓN
- 1.0.2 -> 1.0.3
- Modo de captura nuevo: GAME_ONLY.
- Capacidad mantenida: 1000 registros.

OBJETIVO
Dedicar los 1000 slots a telemetría útil del propio juego y evitar que scripts de PokeGrid/PIWTools llenen la auditoría con estados locales o copias duplicadas de la misma señal.

CAMBIOS PRINCIPALES
1. Eliminada la captura de Storage.
   - Ya no se interceptan localStorage/sessionStorage setItem/removeItem/clear.
   - En la auditoría de 1000 registros anterior, 232 entradas eran escrituras de nuestros propios scripts.
   - Ejemplos eliminados: pg-hunt-intelligence-v1, pg-piwtools-engine-v3, pg-hunt-favorites-manager-v1, pg-decision-detector-v1 y pg-game-structure-monitor-v3.

2. Eliminada la captura de postMessage del mismo origen.
   - Evita registrar RPC/mensajes internos de herramientas y bridges.

3. Eliminada la captura de history/pushState/replaceState/popstate.
   - Evita señales de navegación que no aportan valor al estudio de combate/captura y pueden ser provocadas por scripts.

4. Eliminado el sondeo continuo de window.__poke.ws.
   - El WebSocket original ya se captura directamente.
   - En la auditoría anterior, 357 de 1000 registros eran poke-ws-cache, en gran parte duplicados del WebSocket real.
   - Ahora window.__poke.ws solo se usa una vez al iniciar como bootstrap de contexto para estados persistentes útiles: pokes, field-init, field, analyzer, balls, inventory, events, pending y trade.

5. Eliminado el sondeo continuo de __poke.sess/prev.
   - En la muestra anterior generaba snapshots acumulativos repetidos y solapaba información que ya entrega analyzer/WebSocket.

6. Filtro de llamadas de red iniciadas por userscripts/extensiones.
   - Fetch, XHR, WebSocket saliente, EventSource y sendBeacon intentan clasificar el callsite.
   - Las llamadas identificables como Tampermonkey/Violentmonkey/Greasemonkey/extensión o scripts PokeGrid/PIWTools no ocupan registros.
   - El filtrado es best-effort: depende de que Chromium exponga información suficiente en Error().stack.
   - Los dos frames internos del propio auditor se excluyen antes de clasificar el caller, para no confundir el auditor con el origen real de todas las llamadas.

7. WebSocket etiquetado por evento sin crear entradas adicionales.
   - route pasa a ser ws.<type> cuando el payload tiene type.
   - Ejemplos: ws.field, ws.field-kill, ws.catch-result, ws.poke-delta, ws.poke-xp, ws.analyzer, ws.balls, ws.inventory.
   - Se añade eventType para facilitar correlaciones y búsquedas.

8. Se añade sequence a cada entrada.
   - Facilita reconstruir el orden de eventos al estudiar secuencias rápidas de combate/captura.

9. Persistencia aislada de v1.0.2.
   - Nueva clave sessionStorage v1.0.3.
   - Nueva base IndexedDB v2.
   - La nueva versión no hidrata automáticamente los registros ruidosos guardados por 1.0.2.
   - El botón Limpiar también elimina snapshots antiguos 1.0.2/1.0.1.

10. Se mantiene la caché window.__poke.api.
    - Es de bajo volumen y permite recuperar respuestas API importantes que pudieron cargarse antes de pulsar Empezar.

EXPERIMENTO GEODUDE
Esta versión está preparada para correlacionar:
- ws.field: información visible del Geodude antes de morir (slot, coordenadas, HP/maxHP, shiny, speciesId y demás campos emitidos).
- ws.field-kill: muerte concreta.
- ws.catch-result: éxito/fallo y Ball usada.
- ws.poke-delta: si la captura tiene éxito, datos del Pokémon recibido, incluyendo quality/ivTotal/power/stats cuando el servidor los emite.

El objetivo del siguiente dataset es comprobar si algún campo conocido antes de la captura correlaciona estadísticamente con quality/IV del Pokémon finalmente obtenido.

RECOMENDACIÓN DE CAPTURA
- Instalar v1.0.3.
- Abrir la zona de Geodude.
- Pulsar Limpiar.
- Pulsar Empezar.
- Mantener la misma Hunt y capturar tantos Geodude como sea posible.
- No hace falta interactuar con otros scripts durante la prueba.
- Cuando llegue a 1000/1000, pulsar Detener y Guardar todo.
- Enviar el JSON completo sin filtrar.

VALIDACIÓN
- node --check: OK.
- MAX_ENTRIES = 1000 confirmado.
- CAPTURE_MODE = GAME_ONLY confirmado.
- Sin hooks Storage.
- Sin window-message.
- Sin history hooks.
- Sin poke-ws-cache continuo.
- Sin runtimeFingerprints/scanPokeRuntimeState.
- WebSocket route/eventType por tipo confirmado.
- Prueba estática del filtro de callsite:
  * llamada simulada desde bundle del juego -> no se clasifica como userscript.
  * llamada simulada desde PokeGrid Hunt Intelligence -> sí se clasifica como userscript.

SHA-256 SCRIPT v1.0.3
03c05bd3465c207b13755476de292455ab849d662cd659d0cfbfd15d8069de2d

PUBLICACIÓN
- No se ha publicado nada en GitHub.

## PokeGrid - Hunt Intelligence 1.1.45 — 2026-08-18

POKE IDLE WORLD / POKEGRID — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.45
Fecha: 2026-08-18

VERSIÓN
- Versión anterior: 1.1.44
- Nueva versión: 1.1.45

OBJETIVO
- Corregir la geometría de Hunt Intelligence cuando PokeGrid cambia el tamaño del webview entre la vista de 4 cuentas y una cuenta ampliada.
- Conseguir que la barra minimizada se muestre completa y mantenga accesible la X de cierre.
- Evitar que Hunt Intelligence se cierre accidentalmente al terminar de redimensionarlo desde una esquina.

AÑADIDO
- Geometría responsive específica para la ventana de Hunt Intelligence gestionada por Bridge UI.
- El estado minimizado usa un ancho compacto objetivo de 390 px, limitado automáticamente al ancho real disponible del webview (100vw - 8 px).
- El encabezado minimizado oculta el subtítulo y permite truncar el título para reservar espacio a los controles.
- El control de opacidad se compacta mientras la ventana está minimizada.
- En viewports extremadamente estrechos (<= 340 px), el control de opacidad se oculta en minimizado para priorizar los botones de minimizar/maximizar/cerrar.

MODIFICADO
- La ventana gestionada por Bridge ya no mantiene a la fuerza un mínimo de 360 px cuando el propio webview es más estrecho; puede adaptarse al espacio real disponible.
- El ancho máximo visual de Hunt Intelligence queda limitado al viewport actual para evitar que parte del encabezado quede fuera de pantalla al alternar tamaños de PokeGrid.
- Se actualizan los identificadores/versiones públicas de Hunt Intelligence a 1.1.45.

ELIMINADO
- No se ha eliminado ninguna función de Hunt Intelligence.
- No se ha eliminado ni modificado ninguna función de Favoritos, No capturados, Items, Rendimiento, Histórico o Especiales/h.

CORREGIDO
- Corregido el caso en el que abrir Map/Mapa podía mostrar Hunt Intelligence minimizado con la barra cortada y la X fuera de la zona visible.
- Corregido el cierre accidental al soltar el ratón después de redimensionar la ventana desde una esquina.
  Causa: en modo Bridge UI, el elemento que Hunt Intelligence trataba como "fondo exterior" es realmente la propia ventana. Un click generado sobre esa superficie al finalizar el resize podía ejecutar closePanel().
  Corrección: el click directo sobre el contenedor solo cierra en el modo legacy, donde sí existe un overlay exterior. En modo Bridge, cerrar sigue correspondiendo al botón X real de la ventana.
- La barra minimizada se adapta dinámicamente al tamaño actual del webview, por lo que no depende de que la cuenta esté en 2x2 o ampliada.

VALIDACIONES REALIZADAS
- Fuente base 1.1.44 reconstruida y verificada exactamente contra la copia actual del repositorio antes de modificar:
  - Git blob SHA: 19440486fec4f8c3ea855fc59e9d6d79df827878
  - SHA-256 base: 21261a2150fc08b56157c9c38ca3d7ec82346bc26f3aeb7d5143ca57f907ccb5
- node --check sobre una copia temporal .js de la 1.1.45: OK.
- Verificado que el guard principal y las versiones públicas son 1.1.45.
- Verificado que sigue presente el RPC de Favoritos por postMessage y sus acciones:
  ping, getLocalAccountState, getChoices, setLocalEnabled, setLocalTarget, moveLocalTarget, startLocalAccount y stopLocalAccount.
- Verificada la normalización de flechas de Favoritos (up/down/arriba/abajo/subir/bajar/prev/previous/next): intacta.
- Verificada la lógica sparse de /api/game/pokedex y el cruce con hunts reales para No capturados: intacta.
- Verificados specialItems, specialItemsPh, cleanBaseSpecialItemsPh, Strange Pheromone y Bronze Boss Token: intactos.
- Script Bridge & Health Agent 1.1.8: no modificado.
- No se ha publicado ningún cambio en GitHub.

HASH DE LA NUEVA VERSIÓN
- SHA-256 pokegrid-hunt-intelligence-1.1.45.txt:
  b934a323e686efdee4b53a99eceda6c0af14edfe1688ecc0696af2aba34e288a

PRUEBA REAL RECOMENDADA EN POKEGRID
1. Con las 4 cuentas visibles en 2x2, abrir Map/Mapa varias veces y comprobar que Hunt Intelligence aparece minimizado con la barra completa y la X visible.
2. Abrir Hunt Intelligence completo, redimensionarlo varias veces desde la esquina y soltar el ratón; no debe cerrarse.
3. Ampliar una cuenta mediante PokeGrid, repetir apertura minimizada y resize.
4. Volver a la vista 2x2 y repetir, comprobando que la barra minimizada vuelve a ajustarse al espacio disponible.
5. Confirmar que la X sigue cerrando normalmente cuando se pulsa de forma intencionada.

NOTA
- Las validaciones anteriores cubren sintaxis y regresiones estáticas. La interacción exacta con Electron/webview al alternar 2x2 y vista ampliada debe confirmarse con la prueba real en PokeGrid.

## PokeGrid - Hunt Intelligence 1.1.44 — 2026-08-17

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.44
Fecha: 2026-08-17

VERSIÓN
=======
Anterior: 1.1.43
Nueva:    1.1.44

OBJETIVO
========
Añadir una nueva métrica única para farmear conjuntamente:

- Strange Pheromone
- Bronze Boss Token / Bronze Token

Ambos recursos tienen exactamente el mismo valor dentro de esta métrica:

1 Strange Pheromone = 1 Especial
1 Bronze Token      = 1 Especial

La nueva métrica se llama:

Especiales/h


NUEVO PESO EN "MEJOR GENERAL"
=============================
En:

Hunts → Mejor general

se añade:

Peso especiales/h

Configuración por defecto:

0%

Esto significa que actualizar desde 1.1.43 NO cambia automáticamente ningún
ranking existente.

El usuario puede subir el peso hasta 100%.

Ejemplo para farmear únicamente estos recursos:

XP:            0%
Loot:          0%
Raros/h:       0%
Especiales/h: 100%
Oro NPC:       0%


CÁLCULO
=======
Especiales/h suma las unidades obtenidas de ambos objetos:

Especiales/h =
Strange Pheromone/h + Bronze Token/h

No existe diferencia de valor entre ambos.

Ejemplo:

2,0 Pheromonas/h
+
1,5 Bronze Tokens/h
=
3,5 Especiales/h


IDENTIFICACIÓN DE OBJETOS
=========================
La detección se realiza por el catálogo de items del juego y conserva sus IDs.

Se reconocen las variantes normalizadas:

- Strange Pheromone
- Strange Pheromones
- Bronze Boss Token
- Bronze Boss Tokens
- Bronze Token
- Bronze Tokens

El histórico no depende de una lista fija de IDs escrita a mano:
los IDs se obtienen del catálogo cargado por Hunt Intelligence.


ESTIMACIÓN SIN HISTÓRICO
========================
Si alguno de estos objetos aparece en el loot oficial de una criatura con un
rate válido superior a 0, Hunt Intelligence puede calcular inicialmente:

kills/h × unidades especiales esperadas por kill

El cálculo respeta el mismo multiplicador de loot diario utilizado por el resto
de drops cuando existe un rate oficial visible.

Si el cliente no expone un rate utilizable:
- NO se inventa un porcentaje;
- Especiales/h aparece como "—";
- se indica "especiales: esperando muestras".


HISTÓRICO REAL
==============
El supervisor de rendimiento ahora guarda también:

specialItems
specialItemsPh
cleanBaseSpecialItemsPh

Cada ventana válida de 30 minutos cuenta directamente el incremento real de:

Strange Pheromone + Bronze Tokens

Ejemplo:

durante 30 minutos:
1 Pheromona
2 Bronze Tokens

Total:
3 especiales

Resultado de la ventana:
6,00 Especiales/h


VENTANA MÓVIL
=============
Especiales/h utiliza el mismo histórico reciente por:

Hunt + Pokémon

que Items/h y Raros/h.

Se conservan hasta 12 muestras válidas de 30 minutos.

Cuando existe histórico nuevo:
- se obtiene la media real de Especiales/h;
- se ajusta a la velocidad/kills-h actual del Pokémon;
- se utiliza ese valor en Mejor general.

La fuente de cada ranking diferencia entre:
- especiales: histórico real (N)
- especiales: rate visible
- especiales: esperando muestras


BONUS DIARIO
============
Las muestras nuevas guardan también una versión base de Especiales/h siguiendo
la misma normalización de loot diario que Items/h/Raros/h.

Al evaluar las condiciones actuales se vuelve a aplicar el multiplicador de loot
correspondiente.


MUESTRAS ANTIGUAS
=================
NO se elimina ni invalida el histórico anterior.

Las muestras creadas antes de 1.1.44:
- siguen siendo válidas para kills/h;
- siguen siendo válidas para XP/h;
- siguen siendo válidas para Items/h;
- siguen siendo válidas para Raros/h.

Pero NO se les inventa un valor de Especiales/h.

Especiales/h empieza a disponer de histórico real con las nuevas muestras
completadas bajo 1.1.44.


CEROS REALES
============
Una nueva muestra de 30 minutos que no obtenga ninguna Pheromona ni Bronze Token
guarda correctamente:

Especiales/h = 0

Ese 0 es un dato real y sí participa en el histórico.

Esto se diferencia de una hunt todavía no medida:

Sin datos = —
Medida y sin especiales = 0,00


PROTECCIÓN CONTRA RANKING ENGAÑOSO
==================================
Si el usuario pone Peso especiales/h > 0 pero ninguna de las hunts evaluadas
tiene todavía:

- rate oficial utilizable;
o
- histórico real de 1.1.44;

Hunt Intelligence muestra un aviso indicando que Especiales/h todavía está
esperando información.

Las hunts sin datos muestran:

—

en vez de fingir un 0 conocido.

Si existen empates de score con Peso especiales/h activo, las hunts que sí
disponen de datos medibles tienen prioridad sobre las que todavía son
desconocidas.


INTERFAZ
========
La tabla de Hunts añade una columna:

Especiales/h

También se añade:

Peso especiales/h

en los controles de Mejor general.


RENDIMIENTO
===========
La pestaña Rendimiento añade:

Especiales/h observados

para poder ver durante la muestra actual cuántas unidades/h están siendo
detectadas realmente.


HISTÓRICO
=========
La pestaña Histórico añade una nueva columna:

Especiales/h

permitiendo revisar la media registrada para cada:

Hunt + Pokémon


SCORE GENERAL
=============
El score pasa a normalizar cinco posibles componentes:

- XP/h
- Items/h
- Raros/h
- Especiales/h
- Oro NPC/h

Especiales/h participa exclusivamente según el peso elegido por el usuario.

Con Peso especiales/h = 0:
el ranking mantiene el comportamiento anterior.


COMPATIBILIDAD CON 1.1.43
=========================
Se conserva:
- Nivel máximo manual de Mejor general.
- No capturados corregido.
- % Ultra Ball.
- Items.
- Rendimiento.
- Histórico.
- Favoritos.
- RPC/mailbox de PokeGrid.
- Flechas de prioridad de Favoritos.
- Persistencia de las 4 cuentas.

Favoritos no cambia funcionalmente.
Solo se actualiza la versión anunciada del protocolo/API a 1.1.44.


VALIDACIÓN
==========
- node --check: CORRECTO.
- @version: 1.1.44.
- Guard principal: V1144.
- 0 referencias restantes a 1.1.43/V1143.
- Identificación de Strange Pheromone por catálogo: PASS.
- Identificación de Bronze Boss Token por catálogo: PASS.
- IDs especiales disponibles aunque el rate oficial sea 0: PASS.
- Rate oficial 0 NO se convierte en estimación falsa: PASS.
- Conteo combinado Pheromona + Bronze Token mediante dropDelta(): PASS.
- Cada unidad vale 1:1: PASS.
- Score con Especiales/h al 100%: PASS.
- Hunts con 2 Especiales/h superan a hunts con 1 Especial/h independientemente
  de XP/Loot/Oro si los demás pesos están a 0: PASS.
- Muestras antiguas sin cleanBaseSpecialItemsPh quedan excluidas solo de la
  métrica Especiales/h: confirmado.
- Nueva muestra con 0 especiales se considera dato real: confirmado.
- Favoritos/RPC permanecen presentes.
- Sintaxis global del userscript: CORRECTA.

SHA-256
=======
21261a2150fc08b56157c9c38ca3d7ec82346bc26f3aeb7d5143ca57f907ccb5

ARCHIVOS
========
pokegrid-hunt-intelligence-1.1.44.txt
actualizaciones-hunt-intelligence-1.1.44.txt

## PokeGrid - Hunt Intelligence 1.1.43 — 2026-08-17

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.43
Fecha: 2026-08-17

VERSIÓN
=======
Anterior: 1.1.42
Nueva:    1.1.43

OBJETIVO
========
Añadir en:
Hunts → Mejor general

un filtro manual de NIVEL MÁXIMO para impedir que el ranking recomiende hunts
por encima del nivel que el usuario quiera considerar.

EJEMPLO
=======
Si se introduce:

500

el ranking de Mejor general solo podrá utilizar hunts con:

nivel requerido <= 500

Una hunt de nivel 501, 550, 600, etc. queda fuera antes de calcular el score.

NUEVO CONTROL
=============
Dentro de los ajustes de "Mejor general" aparece:

Nivel máximo [         ] [∞]

- Se puede escribir cualquier nivel entero positivo.
- El filtro se aplica al pulsar Enter o al salir del campo.
- El ranking se recalcula automáticamente.
- El botón ∞ elimina el límite manual.
- Campo vacío = Sin límite manual.

ALCANCE
=======
El filtro se aplica ÚNICAMENTE a:

Hunts → Mejor general

No modifica el comportamiento de:
- Mejor XP.
- No capturados.
- Items.
- Rendimiento.
- Histórico.
- Favoritos.

COMPORTAMIENTO
==============
El filtro manual funciona como un segundo techo adicional.

Primero Hunt Intelligence conserva las hunts consideradas accesibles por su
lógica normal.

Después, si Mejor general tiene un Nivel máximo configurado:

huntRequiredLevel <= maxHuntLevel

Solo esas hunts pasan al cálculo de:
- XP/h
- Items/h
- Raros/h
- Oro NPC/h
- Score general

Esto es importante porque las hunts excluidas NO participan tampoco en la
normalización del score. Por tanto, el ranking se recalcula únicamente con el
conjunto realmente permitido por el usuario.

PERSISTENCIA
============
Se añade al config existente:

maxHuntLevel

Valor por defecto:
0

Significado:
0 = sin límite manual.

El valor se guarda en el mismo localStorage de configuración de Hunt
Intelligence, por lo que cada cuenta/webview conserva su propio límite.

INFORMACIÓN EN PANTALLA
=======================
Cuando el filtro está activo se muestra en Hunts:

Filtro manual: hasta Nv. X

También se indica:
- cuántas hunts se están evaluando;
- cuántas había accesibles antes de aplicar el límite manual.

Ejemplo:

Hunts evaluadas: 43 de 71 accesibles por nivel.

BOTÓN ∞
=======
El botón ∞:
- establece maxHuntLevel = 0;
- elimina inmediatamente el techo manual;
- recalcula el ranking;
- vuelve al comportamiento normal.

COMPATIBILIDAD
==============
Se conserva la configuración anterior automáticamente.

Las cuentas que actualicen desde 1.1.42 comienzan con:

maxHuntLevel = 0

por lo que el ranking se comporta exactamente como antes hasta que el usuario
establezca un límite.

FAVORITOS / RPC
===============
No se modifica la arquitectura de Favoritos.

Se verificó que permanecen presentes:
- favorites-rpc-request
- getLocalAccountState
- favoriteNormalizeMoveDirection

La corrección de movimiento de slots y el mailbox/RPC siguen intactos.

VALIDACIÓN
==========
- node --check: CORRECTO.
- @version: 1.1.43.
- Guard principal: V1143.
- maxHuntLevel persistente: presente.
- Filtro aplicado antes de scoreRows(): confirmado.
- Mejor general: filtro activo.
- Mejor XP: no usa el límite manual.
- Botón ∞: restablece a sin límite.
- Favoritos/RPC: presentes y sin cambios funcionales.

SHA-256
=======
2c2339fdea07edb8e417e4e0453d67199547fbc00e9db264e39255c5bc30b358

ARCHIVOS
========
pokegrid-hunt-intelligence-1.1.43.txt
actualizaciones-hunt-intelligence-1.1.43.txt

## PokeGrid - Hunt Intelligence 1.1.42 — 2026-08-16

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.42
Fecha: 2026-08-16

VERSIÓN
=======
Anterior: 1.1.41
Nueva:    1.1.42

OBJETIVO
========
Corregir de raíz la pestaña "No capturados" para que muestre todos los Pokémon
que cumplen simultáneamente:

1. Nunca han sido capturados por la cuenta (Not Caught).
2. Tienen una hunt real disponible en los mapas del juego.

Además:
- ordenar la lista por nivel de hunt de menor a mayor;
- añadir una columna con el porcentaje solicitado para Ultra Ball;
- no utilizar en ningún momento la colección actual como criterio de captura.

CAUSA REAL DEL FALLO
====================
La versión anterior interpretaba:

GET /api/game/pokedex

como si payload.species[] fuera un catálogo completo de todas las especies.

Eso es incorrecto.

species[] es una lista SPARSE de progreso:
solo contiene especies para las que la cuenta ya tiene algún registro de progreso.

Por tanto una especie que:
- nunca se ha capturado;
- nunca ha generado todavía un registro de progreso;

puede no existir en species[].

La lógica anterior hacía:
- caught:true  -> capturado
- caught:false -> pendiente
- especie ausente -> ni siquiera se procesaba

Ese último caso era el fallo.

Por eso Pokémon cazables y nunca capturados podían desaparecer por completo de
"No capturados".

REFERENCIA DE IMPLEMENTACIÓN
=============================
Se contrastó el comportamiento con el motor público de Poke-Hunt, derivado del
bundle de PIWTools.

Su planificación de Pokédex trata la respuesta de /api/game/pokedex como
"touched species only" y, cuando una especie cazable no tiene fila de progreso,
utiliza el estado por defecto:

{ kills: 0, caught: false }

1.1.42 aplica ese mismo principio, adaptado al requisito de Hunt Intelligence:
para esta pestaña solo importa si caught es true o no.

NUEVA FUENTE DE VERDAD
======================
"No capturados" ahora empieza por el lado correcto:

TODAS LAS HUNTS REALES
/api/game/map-markers
        ↓
pokeId real de la criatura
        ↓
progreso sparse de /api/game/pokedex

Regla final:

- si existe progreso y caught === true:
  NO aparece.

- si existe progreso y caught === false:
  aparece.

- si NO existe ningún registro de progreso para ese pokeId:
  se considera Not Caught y aparece.

- si una especie está Not Caught pero NO tiene ninguna hunt real:
  no aparece.

Esto evita incluir legendarios u otras especies que existan en Pokédex pero no
puedan cazarse actualmente mediante una hunt.

NO SE USA LA COLECCIÓN ACTUAL
==============================
Se verificó expresamente que el bloque de "No capturados" no consulta:

- Pokémon poseídos actualmente;
- colección actual;
- owned Pokémon;
- ws.pokes;
- si el usuario vendió/liberó una captura anterior.

El único estado histórico utilizado para decidir si está capturado es:
caught de /api/game/pokedex.

CATÁLOGO DE LOS MAPAS
=====================
Se recorren todas las hunts disponibles en el catálogo de mapas y se agrupan por
pokeId real.

Si una especie tiene más de una hunt:
- se selecciona primero la de menor nivel;
- nombre/slug se usan como desempate estable.

La disponibilidad de cálculo de XP/h ya NO decide si una especie aparece.

Una especie con hunt real puede mostrarse aunque Hunt Intelligence no pueda
calcular en ese momento XP/h/kills/h con el Pokémon equipado.

HUNTS POR ENCIMA DEL NIVEL ACTUAL
=================================
Antes podían desaparecer por el filtro de acceso de la recomendación normal.

Ahora:
- también se muestran;
- permanecen en su posición correcta por nivel;
- se marcan como bloqueadas para el nivel actual;
- el botón de entrada queda deshabilitado mientras no sea accesible.

Así la pestaña representa el conjunto completo de Not Caught cazables, no solo
lo que el Pokémon equipado puede farmear en ese instante.

ORDEN NUEVO
===========
La lista se ordena siempre por:

1. Nivel requerido de la hunt, ASCENDENTE.
2. Nombre del Pokémon como desempate.

Ejemplo:

Nv. 10
Nv. 20
Nv. 30
Nv. 100
Nv. 500

Esto sustituye el orden anterior basado en XP/h / disponibilidad de cálculo.

PORCENTAJE DE CAPTURA — ULTRA BALL
==================================
Se añade una nueva métrica visible por fila:

Ultra ×4

Para obtener el porcentaje base se utiliza la heurística documentada de PIWTools
para Poké Ball:

p = 1 - exp(-1.75 × ballPrice / priceNpc)

Para Poké Ball:
ballPrice = 5

Por tanto:

pokeBallChance = 1 - exp(-(1.75 × 5) / priceNpc)

Después se aplica exactamente la regla solicitada:

ultraDisplayed = pokeBallChance × 4

con límite máximo del 100%.

Ejemplo conceptual solicitado:
0,139% Poké Ball
× 4
= 0,556% Ultra mostrada

IMPORTANTE SOBRE ESTA COLUMNA
=============================
La columna representa deliberadamente:

"porcentaje PIWTools de Poké Ball ×4"

porque ese es el dato solicitado.

No modifica:
- Auto Catch;
- Poké Ball seleccionada;
- inventario de balls;
- ninguna configuración de captura.

Tampoco pretende sustituir internamente la mecánica real del servidor del juego.
Es una métrica informativa para ordenar/valorar las capturas pendientes.

TOOLTIP
=======
Al pasar por el porcentaje se muestra también el porcentaje base de Poké Ball
utilizado antes del ×4.

DIAGNÓSTICO INTERNO
===================
Cada carga de "No capturados" registra en consola:

[Hunt Intelligence · No capturados · diagnóstico]

con:
- progressRecords;
- explicitCaught;
- explicitNotCaught;
- inferredNotCaughtNoProgressRecord;
- huntRowsRaw;
- huntSpecies;
- huntsWithoutSpeciesId;
- includedNotCaughtWithHunt;
- excludedCaught;
- blockedByCurrentLevel;
- accessLevel;
- ejemplos de especies inferidas como Not Caught por ausencia de progreso.

Esto permite detectar inmediatamente si vuelve a faltar una especie concreta.

CASO DE REGRESIÓN PROBADO
=========================
Se ejecutó una prueba aislada con:

- Caterpie: hunt Nv.10, sin registro de progreso.
- Teddiursa: hunt Nv.30, sin registro de progreso.
- Ursaring: hunt Nv.100, caught:false explícito.
- Highmon: hunt Nv.500, sin registro y por encima del nivel actual.
- Metapod: hunt real, caught:true.

Resultado esperado y obtenido:

Caterpie  Nv.10
Teddiursa Nv.30
Ursaring  Nv.100
Highmon   Nv.500

Metapod se excluye.

La prueba confirma:
- especies ausentes del progreso se incluyen;
- caught:true se excluye;
- caught:false explícito se incluye;
- niveles altos no desaparecen;
- orden ascendente correcto;
- cálculo Ultra ×4 correcto.

FAVORITOS / RPC
===============
No se modifica la arquitectura de Favoritos.

Se comprobaron como presentes:
- favorites-rpc-request;
- getLocalAccountState;
- moveLocalTarget;
- favoriteNormalizeMoveDirection.

La corrección de flechas de 1.1.41 se conserva.

VALIDACIÓN
==========
- node --check: CORRECTO.
- @version: 1.1.42.
- Guard interno: V1142.
- 0 referencias restantes a 1.1.41/V1141.
- Prueba funcional sparse/map/sort/Ultra: PASS.
- 0 referencias a colección/owned/ws.pokes dentro del bloque de No capturados.
- Eliminado el filtro que ocultaba hunts no accesibles.
- Eliminado el uso de notCaughtSpecies explícito como universo completo.
- Orden final por requiredLevel ascendente confirmado.

SHA-256
=======
b39d8b71b35952c80dc50660934432bfc661febf6f88a4ab54d0ce7997c7f526

ARCHIVOS
========
pokegrid-hunt-intelligence-1.1.42.txt
actualizaciones-hunt-intelligence-1.1.42.txt

## PokeGrid - Hunt Intelligence 1.1.41 — 2026-08-16

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.41
Fecha: 2026-08-16

VERSIÓN
=======
Anterior: 1.1.40
Nueva:    1.1.41

PROBLEMA
========
En el panel global de Favoritos, al pulsar una flecha ↑ o ↓ para cambiar la
prioridad de un Pokémon, el objetivo podía desaparecer de la lista y la cuenta
quedaba mostrando "Sin Objetivo".

CAUSA
=====
El RPC moveLocalTarget() convertía siempre la dirección con:

Number(direction)

Si PokeGrid enviaba la acción visual como:
- "up"
- "down"

Number("up") y Number("down") devolvían NaN.

La función de intercambio podía entonces intentar trabajar con un índice NaN,
dejando el slot original como undefined. Al guardar, los valores vacíos se
filtraban y el Pokémon podía desaparecer de la configuración.

CORREGIDO
=========
Se añade favoriteNormalizeMoveDirection().

Ahora acepta:
- -1
- 1
- "-1"
- "1"
- "+1"
- "up"
- "down"
- "arriba"
- "abajo"
- "subir"
- "bajar"
- "prev" / "previous"
- "next"

PROTECCIONES NUEVAS
===================
favoriteMoveTarget() valida antes de modificar nada:

- que el slot origen sea un entero válido;
- que esté entre 0 y 2;
- que la dirección sea válida;
- que el destino siga dentro de los 3 slots;
- que el slot origen tenga realmente un Pokémon.

Si cualquiera de esas comprobaciones falla:
- devuelve false;
- NO modifica la lista;
- NO borra ningún Pokémon.

RPC
===
moveLocalTarget ya no convierte direction mediante Number() antes de enviarla
a la lógica interna.

La respuesta devuelve además:
- ok
- error
- account

Si el movimiento no es válido, devuelve:
"Movimiento de favorito no válido."

COMPATIBILIDAD
==============
No hace falta modificar el protocolo RPC.

PokeGrid puede seguir enviando:
moveLocalTarget(slot, direction)

La dirección puede ser numérica (-1/+1) o textual ("up"/"down").

SE CONSERVA
===========
- Panel global de PokeGrid.
- Mailbox/polling RPC.
- 4 cuentas independientes.
- Sliders ON/OFF.
- Hasta 3 Pokémon por cuenta.
- Buscador de Pokémon.
- Posición #1 como objetivo de AutoHunt.
- Persistencia.
- Reanudación.
- Botón Iniciar / Parar.
- Resto de Hunt Intelligence sin cambios funcionales.

VALIDACIÓN
==========
- node --check: CORRECTO.
- @version: 1.1.41.
- Guard interno: V1141.
- Probado intercambio con:
  * slot 1 ↓
  * slot 3 ↑
  * dirección "up"
  * dirección "down"
  * dirección -1
  * dirección +1
- Dirección inválida confirmada como no-op.
- Slot vacío confirmado como no-op.
- Ninguna orden inválida puede borrar la lista.

SHA-256
=======
de2351682912ac9d7ce0228894b9b2b562d1f728fe9f1cfad8b213c43c2122d2

ARCHIVOS
========
pokegrid-hunt-intelligence-1.1.41.txt
actualizaciones-hunt-intelligence-1.1.41.txt

## PokeGrid - Hunt Intelligence 1.1.40 — 2026-08-16

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.40
Fecha: 2026-08-16

VERSIÓN
=======
Anterior: 1.1.39
Nueva:    1.1.40

PROBLEMA OBSERVADO
==================
El panel global de PokeGrid ya enumeraba correctamente las cuatro cuentas, pero en
cada una aparecía:

API no disponible: getFavoriteLocalAccountState

Y en el pie:

Hunt Intelligence no disponible en las cuentas.

DIAGNÓSTICO
===========
Las APIs locales sí existen en Hunt Intelligence 1.1.39 y están expuestas en:
window.__PGHuntIntelligence

El problema es la frontera de contextos JavaScript entre:
- el código ejecutado por Electron mediante webview.executeJavaScript(...);
- el userscript de Tampermonkey/Hunt Intelligence.

Por tanto, executeJavaScript puede entrar en el webview pero no debe depender de
leer directamente window.__PGHuntIntelligence.

El mecanismo window.postMessage ya había demostrado funcionar entre ambos
contextos al abrir anteriormente el gestor de Favoritos.

SOLUCIÓN — RPC POR POSTMESSAGE
==============================
Se añade un puente RPC bidireccional mediante window.postMessage.

PokeGrid envía peticiones con:

source:    pokegrid-topbar
type:      favorites-rpc-request
requestId: identificador único
action:    acción solicitada
args:      array de argumentos

Hunt Intelligence responde con:

source:    hunt-intelligence
type:      favorites-rpc-response
requestId: mismo identificador
action:    misma acción
ok:        true/false
result:    resultado serializable
error:     texto de error si existe
version:   1.1.40

ACCIONES RPC DISPONIBLES
========================
- ping
- getLocalAccountState
- getChoices
- setLocalEnabled
- setLocalTarget
- moveLocalTarget
- startLocalAccount
- stopLocalAccount

PING / ARRANQUE
===============
La acción ping devuelve:
- ready: true
- version: 1.1.40
- account: estado de la cuenta local

También se emite opcionalmente:

type: favorites-rpc-ready
source: hunt-intelligence

Esto permite que PokeGrid espere a que Tampermonkey haya terminado de cargar en
cada webview después de un reinicio antes de marcarlo como no disponible.

SEGURIDAD
=========
El listener solo acepta mensajes cuyo:
- event.origin sea https://poke.idleworld.online
- source sea pokegrid-topbar

Las respuestas se envían al mismo origin.

COMPATIBILIDAD
==============
Se mantienen las APIs públicas window.__PGHuntIntelligence para uso interno y
compatibilidad.

También se mantiene temporalmente el mensaje antiguo:
open-favorites-manager
como compatibilidad, aunque el panel global de PokeGrid ya no debería necesitarlo.

CAMBIO NECESARIO EN POKEGRID
============================
PokeGrid ya no debe ejecutar directamente:
window.__PGHuntIntelligence.getFavoriteLocalAccountState()

Debe utilizar un helper RPC dentro de cada webview:
1. instalar temporalmente un listener de favorites-rpc-response;
2. generar requestId;
3. hacer window.postMessage(favorites-rpc-request, origin);
4. esperar la respuesta con el mismo requestId;
5. resolver el resultado de executeJavaScript con esa respuesta;
6. aplicar timeout y reintentos durante el arranque.

ARQUITECTURA FINAL
==================
PokeGrid shell global
  -> executeJavaScript en webview concreto
  -> window.postMessage(favorites-rpc-request)
  -> Hunt Intelligence/Tampermonkey
  -> ejecuta lógica local de esa cuenta
  -> window.postMessage(favorites-rpc-response)
  -> Promise de executeJavaScript
  -> panel global de PokeGrid

VALIDACIÓN
==========
- JavaScript validado con node --check: CORRECTO.
- @version: 1.1.40.
- Guard: V1140.
- Puente favorites-rpc-request confirmado.
- Respuestas favorites-rpc-response confirmadas.
- Acción ping confirmada.
- Acciones locales de estado/configuración/inicio/parada confirmadas.

SHA-256
=======
3ae5821a06c20bdbc119d375025acd24add8d10a108177527629add19b480a0f

ARCHIVOS
========
pokegrid-hunt-intelligence-1.1.40.txt
actualizaciones-hunt-intelligence-1.1.40.txt

## PokeGrid - Hunt Intelligence 1.1.39 — 2026-08-16

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.39
Fecha: 2026-08-16

VERSIÓN
=======
Anterior: 1.1.38
Nueva:    1.1.39

PROBLEMA DETECTADO
==================
Después de mover la interfaz de Favoritos al documento principal de PokeGrid,
al reiniciar la aplicación el panel podía mostrar únicamente una cuenta
(por ejemplo, "Cuenta 3") y parecer que entraba directamente en sus ajustes.

CAUSA ARQUITECTÓNICA
====================
PokeGrid estaba utilizando getActiveGameWebview() como fuente del estado global.

Después de reiniciar, el webview activo puede conocer únicamente su propia cuenta
en el almacenamiento de Hunt Intelligence. Por tanto:

- getFavoritesState() del webview activo no es una fuente fiable para construir
  las cuatro filas globales;
- modificar Cuenta 1 desde el webview activo de Cuenta 3 puede enviar la orden al
  contexto equivocado;
- startFavorites() ejecutado únicamente en el webview activo tampoco es el mecanismo
  correcto para garantizar las cuatro cuentas.

SOLUCIÓN
========
Se añaden APIs locales por webview.

Cada webview puede responder de forma explícita por SU cuenta actual, sin depender
de que el estado se comparta entre los cuatro contextos.

NUEVAS APIs
===========
window.__PGHuntIntelligence.getFavoriteLocalAccountState()

Devuelve únicamente la cuenta perteneciente al webview actual:
- id
- name
- enabled
- running
- favorites
- lastSeen
- lastStatus
- lastStatusAt
- current
- online

window.__PGHuntIntelligence.setFavoriteLocalEnabled(enabled)

Modifica únicamente el slider de la cuenta del webview actual.

window.__PGHuntIntelligence.setFavoriteLocalTarget(slot, slug)

Configura una de las tres posiciones únicamente para la cuenta del webview actual.

window.__PGHuntIntelligence.moveFavoriteLocalTarget(slot, direction)

Reordena las posiciones únicamente de la cuenta actual.

window.__PGHuntIntelligence.startFavoriteLocalAccount()

Inicia únicamente la cuenta del webview actual:
- si está desactivada, no inicia;
- si no tiene objetivo #1, no inicia;
- si está activada y tiene #1, marca running y ejecuta su hunt.

window.__PGHuntIntelligence.stopFavoriteLocalAccount()

Detiene únicamente la cuenta del webview actual sin borrar slider ni favoritos.

ARQUITECTURA RECOMENDADA PARA POKEGRID
======================================
El panel global de PokeGrid debe:

1. Enumerar los cuatro webviews de juego.
2. Ejecutar en CADA webview:
   window.__PGHuntIntelligence.getFavoriteLocalAccountState()
3. Agregar los cuatro resultados.
4. Renderizar SIEMPRE la vista principal con las cuatro filas al abrir Favoritos.
5. No seleccionar ninguna cuenta automáticamente.
6. Entrar en ajustes únicamente cuando el usuario pulse 🛠 de una fila.
7. Guardar la relación:
   accountId -> webview
8. Cuando se cambia un slider, llamar setFavoriteLocalEnabled() en el webview
   de ESA cuenta.
9. Cuando se configura un Pokémon, llamar setFavoriteLocalTarget() en el webview
   de ESA cuenta.
10. Cuando se reordena, llamar moveFavoriteLocalTarget() en el webview de ESA cuenta.
11. Al pulsar Iniciar, recorrer los cuatro webviews y llamar:
    startFavoriteLocalAccount()
12. Al pulsar Detener, recorrer los cuatro webviews y llamar:
    stopFavoriteLocalAccount()

CATÁLOGO
========
getFavoriteChoices() se mantiene.

PokeGrid puede obtener el catálogo desde cualquier webview que tenga Hunt Intelligence
listo. Si el primero todavía no está preparado, puede probar con el siguiente.

COMPATIBILIDAD
==============
Las APIs anteriores se mantienen para no romper código existente:
- getFavoritesState()
- setFavoriteEnabled(accountId, enabled)
- setFavoriteTarget(accountId, slot, slug)
- moveFavoriteTarget(accountId, slot, direction)
- startFavorites()
- stopFavorites()

Sin embargo, para el panel global de Electron se recomiendan las nuevas APIs locales.

IMPORTANTE PARA LA INTERFAZ
===========================
Al abrir #favoritesPanel:
- selectedAccountId debe empezar en null;
- la primera vista debe ser siempre el listado de cuatro cuentas;
- la vista de ajustes solo debe abrirse tras pulsar 🛠;
- el botón ← debe volver al listado sin perder estado.

VALIDACIÓN
==========
- JavaScript validado correctamente con node --check.
- @version: 1.1.39.
- Guard interno: V1139.
- Nuevas APIs locales confirmadas.
- Se conserva el gestor de ejecución y watchdog de cada webview.
- Se conserva getFavoriteChoices().
- Las APIs antiguas siguen disponibles.

SHA-256
=======
6d69493314560c11f567ed872d98e5041f9400af37c2a96b43ef9d73bdf5c8a9

ARCHIVOS
========
pokegrid-hunt-intelligence-1.1.39.txt
actualizaciones-hunt-intelligence-1.1.39.txt

## PokeGrid - Hunt Intelligence 1.1.38 — 2026-08-16

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.38
Fecha: 2026-08-15

VERSIÓN
=======
Anterior: 1.1.37
Nueva:    1.1.38

1. OPACIDAD DEL GESTOR FAVORITOS
================================
Problema:
La ventana podía aparecer prácticamente transparente y en 1.1.37 el propio
CSS ocultaba el medidor de opacidad del Bridge UI.

Corregido:
- Vuelve a mostrarse el control de opacidad en la cabecera.
- Se mantiene compacto para no agrandar demasiado la interfaz.
- Ancho reducido del slider para conservar el diseño ligero.
- Opacidad inicial del gestor: 92%.
- Se añade una migración única:
  si existe un valor antiguo sin migrar o una opacidad heredada inferior al 55%,
  se restablece automáticamente a 92%.
- Después de esa migración el usuario puede ajustar y conservar libremente su
  valor mediante el slider.
- Fondo, borde, sombra y blur del gestor se refuerzan para que el contenido sea
  claramente legible.

2. MOVIMIENTO POR TODA LA VENTANA DE POKEGRID
==============================================
Diagnóstico:
PokeGrid utiliza webviews de Electron para las cuatro cuentas.

El gestor actual se crea dentro del DOM del webview activo. Un elemento DOM
dentro de un webview está físicamente recortado por los límites de ese webview.
Por tanto no existe un cambio de CSS/position dentro del userscript que permita
arrastrarlo sobre las otras tres zonas del programa.

Para poder moverlo por toda la ventana de PokeGrid, la carcasa visual debe ser
creada en el documento principal de PokeGrid (el mismo contexto donde existe el
topbar), mientras Hunt Intelligence continúa siendo el motor de datos y AutoHunt.

PREPARACIÓN PARA EL HOST DE POKEGRID
====================================
1.1.38 añade APIs públicas para que el shell de PokeGrid pueda construir una
interfaz global sin duplicar la lógica de Hunt Intelligence:

window.__PGHuntIntelligence.getFavoritesState()
window.__PGHuntIntelligence.getFavoriteChoices()
window.__PGHuntIntelligence.setFavoriteEnabled(accountId, enabled)
window.__PGHuntIntelligence.setFavoriteTarget(accountId, slot, slug)
window.__PGHuntIntelligence.moveFavoriteTarget(accountId, slot, direction)
window.__PGHuntIntelligence.startFavorites()
window.__PGHuntIntelligence.stopFavorites()

Estas APIs permiten que PokeGrid:
- renderice la ventana en su documento principal;
- la mueva libremente por toda la aplicación;
- lea las cuatro cuentas;
- consulte el catálogo;
- cambie sliders;
- configure los tres Pokémon;
- cambie prioridades;
- inicie/detenga Favoritos;
sin trasladar la lógica real de AutoHunt fuera de Hunt Intelligence.

IMPORTANTE
==========
La 1.1.38 corrige completamente la visibilidad/opacidad.

El movimiento fuera de los límites del webview requiere una modificación en el
shell de PokeGrid/Electron. No es técnicamente posible resolver ese recorte desde
el userscript ejecutado dentro del webview.

SE CONSERVA
===========
- Botón externo #favoritesBtn mediante postMessage.
- Gestor Favoritos actual dentro del webview como fallback.
- 4 cuentas.
- Sliders enabled.
- running independiente.
- Hasta 3 Pokémon por cuenta.
- Buscador de Pokémon.
- Prioridad #1.
- Iniciar / Detener.
- Persistencia.
- Reanudación automática.
- Botón 🧠.
- Hunts / No capturados / Items / Rendimiento / Histórico.
- Resto de Hunt Intelligence sin cambios funcionales.

VALIDACIÓN
==========
- JavaScript validado correctamente con node --check.
- @version: 1.1.38.
- Guards internos actualizados a V1138.
- 0 referencias restantes a 1.1.37/V1137.
- Control de opacidad visible confirmado.
- Migración de opacidad confirmada.
- APIs públicas para host global confirmadas.

SHA-256
=======
a7b7d25ee05f471ce20c40fb5031fceb5ad669c426cc5e21dc67d51d0967f876

ARCHIVOS
========
pokegrid-hunt-intelligence-1.1.38.txt
actualizaciones-hunt-intelligence-1.1.38.txt

## PokeGrid - Hunt Intelligence 1.1.37 — 2026-08-16

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.37
Fecha: 2026-08-15

VERSIÓN
=======
Anterior: 1.1.36
Nueva:    1.1.37

CORRECCIÓN DEL CATÁLOGO DE FAVORITOS
====================================
Se corrige el error que mostraba:
"No se pudo cargar el catálogo de hunts."

CAUSA
=====
El catálogo se cargaba, pero al construir cada opción el módulo llamaba a
H().huntRequiredLevel(hunt).

La API pública exponía huntRequiredLevel() e isUnlocked(), pero esos helpers no
existían realmente en ese ámbito del script. Esto provocaba un ReferenceError.

CORREGIDO
=========
Se implementan correctamente en el núcleo público:
- huntRequiredLevel(hunt)
- huntAccessLevel(lead)
- isUnlocked(hunt, lead)

Además, favoriteLoadChoices():
- reutiliza el catálogo oficial de Hunt Intelligence;
- fuerza una recarga si el primer resultado llega vacío;
- conserva slug, speciesId y nivel requerido;
- prioriza el nombre real del Pokémon para mostrarlo.

NUEVO BUSCADOR
==============
Las tres posiciones ya no usan un selector desplegable enorme.

Ahora cada posición tiene un campo:
"Buscar Pokémon…"

Se puede escribir el nombre, por ejemplo:
Larvitar
Dratini
Chansey

y seleccionar una sugerencia del catálogo oficial.

Cada sugerencia incluye:
- nombre;
- nivel requerido;
- slug de hunt para desambiguar.

COMPORTAMIENTO
==============
- Máximo 3 Pokémon por cuenta.
- Posición 1 sigue siendo el objetivo de AutoHunt.
- ↑ y ↓ siguen modificando la prioridad.
- Vaciar un campo elimina esa posición.
- Un texto que no corresponda a una sugerencia válida no se guarda.
- Se siguen evitando duplicados del mismo slug.

TAMBIÉN CORREGIDO
=================
isUnlocked() queda reparado ahora para evitar que el siguiente fallo aparezca al
pulsar ▶ Iniciar después de configurar un favorito.

SE CONSERVA
===========
- 4 cuentas independientes.
- Sliders ON/OFF.
- enabled separado de running.
- ▶ Iniciar / ■ Detener.
- Persistencia y reanudación.
- Comunicación con #favoritesBtn mediante postMessage.
- Sincronización entre cuentas.
- Botón 🧠 e interfaz normal.
- Hunts / No capturados / Items / Rendimiento / Histórico.

VALIDACIÓN
==========
- node --check: CORRECTO.
- @version: 1.1.37.
- Guards: V1137.
- 0 referencias a 1.1.36/V1136.
- Buscador type="search" confirmado.
- datalist de sugerencias confirmado.
- huntRequiredLevel() confirmado.
- isUnlocked() confirmado.

SHA-256
=======
4a08b03665d1a8cdc7ef233618bac26ae7b57680b9f25ecbfdd3a12f6edc4b54

ARCHIVOS
========
pokegrid-hunt-intelligence-1.1.37.txt
actualizaciones-hunt-intelligence-1.1.37.txt

## PokeGrid - Hunt Intelligence 1.1.36 — 2026-08-15

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.36
Fecha: 2026-08-15

VERSIÓN
=======
Anterior: 1.1.35
Nueva:    1.1.36

OBJETIVO
========
Ajustar el enlace del gestor de Favoritos al mecanismo real utilizado por
PokeGrid/Electron, según la implementación confirmada por Codex.

ARQUITECTURA CONFIRMADA
=======================
PokeGrid no utiliza iframes para las cuentas.

Utiliza webviews de Electron y dispone de:
- botón: #favoritesBtn
- handler: runFavoritesScript()
- helper de cuenta activa: getActiveGameWebview()

Codex envía dentro del webview activo:

window.postMessage(
  {
    source: 'pokegrid-topbar',
    type: 'open-favorites-manager'
  },
  'https://poke.idleworld.online'
)

CAMBIO PRINCIPAL
================
Hunt Intelligence queda como receptor puro dentro del window del juego.

El listener valida exactamente:
- event.origin === 'https://poke.idleworld.online'
- event.data.source === 'pokegrid-topbar'
- event.data.type === 'open-favorites-manager'

Si todo coincide, abre directamente el gestor compacto mediante:
favoriteOpenManager()

ELIMINADO
=========
Se elimina del userscript el intento anterior de controlar directamente el
topbar de PokeGrid.

Ya no intenta:
- buscar #favoritesBtn en el document del juego;
- interceptar clicks del topbar;
- acceder a window.top.document;
- escribir runFavoritesScript() en window;
- escribir runFavoritesScript() en window.top.

Todo eso pertenece ahora exclusivamente al código de PokeGrid.

VENTAJAS
========
- Compatible con Electron/webviews.
- Sin dependencia del DOM del topbar.
- Sin acceso cross-window.
- PokeGrid decide cuál es la cuenta activa.
- Solo el webview activo recibe la orden.
- Hunt Intelligence únicamente abre su interfaz al recibir el mensaje válido.

SE CONSERVA
===========
- Gestor compacto de Favoritos.
- 4 cuentas.
- Sliders enabled.
- Estado running separado.
- Máximo 3 Pokémon por cuenta.
- Prioridad #1.
- Iniciar / Detener.
- Persistencia.
- Sincronización entre cuentas.
- Reanudación tras refresh.
- Watchdog.
- Botón 🧠 e interfaz principal.
- Hunts / No capturados / Items / Rendimiento / Histórico.

VALIDACIÓN
==========
- JavaScript validado correctamente con node --check mediante copia .js.
- @version: 1.1.36.
- Guards internos: V1136.
- Listener postMessage confirmado.
- Filtro event.origin confirmado.
- source pokegrid-topbar confirmado.
- type open-favorites-manager confirmado.
- 0 referencias a favoriteInstallButtonHook().
- 0 referencias a window.top.
- 0 referencias a runFavoritesScript dentro de Hunt Intelligence.

SHA-256
=======
e57ad1da4717bea72b31b59db6f9a386fd8701268105a63a02736d46648eb543

ARCHIVOS
========
pokegrid-hunt-intelligence-1.1.36.txt
actualizaciones-hunt-intelligence-1.1.36.txt

## PokeGrid - Hunt Intelligence 1.1.35 — 2026-08-15

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.35
Fecha: 2026-08-15

VERSIÓN
=======
Anterior: 1.1.34
Nueva:    1.1.35

CORRECCIÓN CRÍTICA — HUNT INTELLIGENCE NO ARRANCABA
===================================================
La 1.1.34 podía detener toda su ejecución antes de llegar a install(), por lo que:
- desaparecía el botón 🧠;
- no se montaba la interfaz principal;
- Map tampoco podía abrir Hunt Intelligence;
- el gestor Favoritos tampoco llegaba a estar disponible.

CAUSA REAL
==========
El nuevo módulo Favoritos estaba dentro del bloque de interfaz de Hunt Intelligence,
pero llamaba directamente a funciones que pertenecían a otros bloques internos
(IIFE) del mismo userscript.

El primer error fatal confirmado era:

ReferenceError: getCharacter is not defined

Además se detectaron otras referencias incorrectas que habrían fallado después:
- getLeadPokemon()
- loadData()
- huntRequiredLevel()
- isUnlocked()

Esas funciones existen en Hunt Intelligence, pero no comparten ámbito JavaScript
con el módulo Favoritos.

CORREGIDO
=========
El núcleo público window.__PGUnifiedHuntCore expone ahora de forma controlada:
- getData(force)
- getLeadPokemon()
- getCharacter()
- huntRequiredLevel(hunt)
- isUnlocked(hunt, lead)

Favoritos utiliza exclusivamente esa API pública mediante H().

Esto evita dependencias entre ámbitos internos del userscript.

AISLAMIENTO DE ERRORES
======================
Se añade favoriteInitializeSafely().

Si el módulo Favoritos vuelve a sufrir un error durante su inicialización:
- el error se registra en consola;
- no debe propagarse sin control;
- la interfaz principal de Hunt Intelligence queda desacoplada del fallo.

PUENTE PARA EL BOTÓN FAVORITOS DE POKEGRID
==========================================
Se añade un receptor explícito mediante window.postMessage.

Hunt Intelligence escucha mensajes con este contrato:

source: "pokegrid-topbar"
type:   "open-favorites-manager"

Al recibirlo, ejecuta:
favoriteOpenManager()

Este mecanismo está pensado para que el botón #favoritesBtn del topbar de
PokeGrid pueda comunicarse con Hunt Intelligence aunque esté en otro iframe o
window.

IMPORTANTE
==========
Esta versión prepara el RECEPTOR dentro del juego.

El EMISOR pertenece al código de PokeGrid/topbar y debe implementarlo Codex en
runFavoritesScript(), apuntando al iframe activo del juego.

Hasta que esa parte del topbar se conecte, #favoritesBtn puede seguir sin abrir
la ventana aunque Hunt Intelligence ya cargue correctamente.

CONSERVADO
==========
- Gestor compacto de 4 cuentas.
- Slider enabled independiente de running.
- Máximo 3 Pokémon por cuenta.
- Prioridad por posición #1.
- Botón Iniciar / Detener.
- Persistencia por character.id.
- BroadcastChannel + storage para sincronización entre cuentas.
- Reanudación tras refresh solo si enabled=true y running=true.
- Cinco pestañas normales:
  Hunts / No capturados / Items / Rendimiento / Histórico.
- Ranking, PIWTools, histórico móvil, Item Finder, No capturados y Bridge.

VALIDACIÓN
==========
- JavaScript validado correctamente con node --check.
- @version: 1.1.35.
- Guards actualizados a V1135.
- Confirmada eliminación de la llamada cruzada getCharacter() del módulo.
- Confirmadas llamadas a helpers a través de window.__PGUnifiedHuntCore.
- Confirmado listener postMessage para:
  source="pokegrid-topbar"
  type="open-favorites-manager"
- Confirmado aislamiento de inicialización de Favoritos.

SHA-256
=======
f921c6bc29c8bf63c3ffccdae4232fe89425f05a404a92d78e197d8da28994ae

ARCHIVOS
========
Script:
pokegrid-hunt-intelligence-1.1.35.txt

Registro de cambios:
actualizaciones-hunt-intelligence-1.1.35.txt

## PokeGrid - Hunt Intelligence 1.1.34 — 2026-08-15

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.34
Fecha: 2026-08-15

VERSIÓN
=======
Anterior: 1.1.33
Nueva:    1.1.34

OBJETIVO
========
Añadir un gestor nuevo de Favoritos, rediseñado desde cero, manteniéndolo dentro
de Hunt Intelligence por comodidad pero completamente separado de las pestañas
normales de análisis.

ACCESO DESDE POKEGRID
=====================
- El gestor se vincula directamente al botón superior creado en PokeGrid:
  #favoritesBtn
- También expone:
  runFavoritesScript()
- El enlace es delegado: no importa si el botón todavía no existe cuando carga
  Hunt Intelligence.
- Se intenta enlazar tanto el documento del juego como el documento superior
  cuando PokeGrid mantiene el topbar en un contenedor padre accesible.
- El botón NO abre la ventana normal de Hunt Intelligence.
- Abre una ventana compacta específica:
  ⭐ Favoritos

INTERFAZ COMPACTA
=================
- Ventana pequeña gestionada mediante Bridge UI.
- Ancho inicial: 470 px.
- No es redimensionable.
- No tiene maximizar ni minimizar.
- Conserva posición.
- El control de opacidad del Bridge se oculta en esta ventana para mantenerla
  lo más ligera posible.
- Muestra exactamente cuatro posiciones de cuenta.

Cada cuenta muestra:
- indicador online/offline;
- nombre de la cuenta;
- Pokémon configurado en posición #1;
- estado actual;
- slider ON/OFF;
- botón de ajustes 🛠.

IDENTIDAD DE LAS CUENTAS
========================
- Cada cuenta se identifica internamente por character.id.
- El nombre solo se utiliza para mostrarlo.
- Esto evita mezclar configuraciones si el nombre visible cambia.
- Cada pestaña registra su propia cuenta cuando Hunt Intelligence carga.
- Las cuatro cuentas se mantienen en un orden persistente.

SLIDERS
=======
El slider y la ejecución son estados distintos.

enabled:
- indica que la cuenta participará cuando se pulse ▶ Iniciar.

running:
- indica que esa cuenta ya fue iniciada y debe mantener/reanudar su AutoHunt.

Comportamiento:
- Encender un slider NO inicia ninguna hunt.
- Apagar un slider también desactiva running para esa cuenta.
- Encenderlo de nuevo deja la cuenta preparada, pero NO vuelve a iniciar nada
  hasta que se pulse ▶ Iniciar.
- El estado del slider se conserva tras refresh/reinicio.

BOTÓN ▶ INICIAR
================
- Se añade un único botón pequeño en la parte superior.
- Al pulsarlo se revisan las cuatro cuentas.
- Solo se activan las que cumplen:
  * slider ON;
  * Pokémon configurado en posición #1.
- Cada una mantiene su propio objetivo independiente.
- Una cuenta ON sin objetivo #1 muestra:
  Sin objetivo #1
  y no bloquea a las demás.
- El botón no modifica cuentas cuyo slider esté OFF.

BOTÓN ■ DETENER
================
- Se añade un control compacto ■ junto a Iniciar.
- Detiene la reanudación automática de todas las cuentas.
- Conserva los sliders y las listas configuradas.
- Para volver a ejecutar basta con pulsar ▶ Iniciar.

AJUSTES POR CUENTA
==================
- Cada fila dispone de botón 🛠.
- Cada cuenta puede guardar máximo 3 Pokémon.
- Las listas son completamente independientes entre cuentas.
- Cada posición dispone de selector.
- Se puede subir/bajar el orden mediante ↑ / ↓.
- No se permite duplicar el mismo slug dentro de la lista de una cuenta.
- La posición #1 es siempre el objetivo que se utiliza al ejecutar AutoHunt.
- Las posiciones #2 y #3 permanecen guardadas como alternativas.

CAMBIO DE PRIORIDAD DURANTE LA EJECUCIÓN
========================================
- Si una cuenta NO está ejecutando y se modifica su lista:
  queda preparada y espera a ▶ Iniciar.
- Si una cuenta YA está ejecutando y se cambia el Pokémon #1 o se reordena:
  conserva running=true;
  distribuye la nueva prioridad;
  cambia automáticamente hacia el nuevo objetivo #1.

PERSISTENCIA Y REANUDACIÓN
==========================
- Configuración almacenada en localStorage.
- Se conservan:
  * cuentas;
  * orden;
  * nombres;
  * sliders;
  * running;
  * tres favoritos;
  * último estado.
- Si una cuenta tenía slider ON pero nunca se pulsó Iniciar:
  NO empieza a cazar tras refrescar.
- Si una cuenta tenía enabled=true + running=true:
  tras refrescar Hunt Intelligence intenta reanudar automáticamente el objetivo #1.
- Watchdog de reanudación cada 7 segundos.
- Backoff de 20 segundos entre intentos de entrada para evitar spam.

SINCRONIZACIÓN ENTRE CUENTAS
============================
- BroadcastChannel como transporte principal.
- localStorage/storage event como respaldo.
- Las órdenes se deduplican mediante ID único.
- Al pulsar Iniciar, cada pestaña recibe la misma orden global.
- Cada pestaña únicamente actúa sobre SU propia cuenta y SU propio objetivo #1.
- Cambiar la prioridad de una cuenta que ya está running emite una actualización
  para que esa cuenta aplique el nuevo objetivo.

SELECCIÓN DE POKÉMON
====================
- Los selectores se construyen desde el catálogo oficial de hunts que ya carga
  Hunt Intelligence.
- Cada opción conserva:
  * slug exacto;
  * nombre;
  * speciesId cuando existe;
  * nivel requerido.
- La interfaz muestra también el nivel requerido.

ENTRADA A LA HUNT
=================
- Se reutiliza el mecanismo de entrada de Hunt Intelligence:
  * abrir Map;
  * localizar la región;
  * localizar el marker de la hunt;
  * seleccionar el marker;
  * pulsar el botón de entrada cuando sea necesario.
- startHunt() pasa a devolver true/false para que el gestor pueda saber si la
  transición fue confirmada.

CONFIRMACIÓN ROBUSTA
====================
Se corrige una fuente de falsos positivos detectada durante las pruebas antiguas.

Ya NO se considera una hunt activa únicamente porque:
- quede guardado un field-init antiguo;
- quede un Analyzer anterior con segundos acumulados.

Para confirmar una transición se exige:
- slug compatible con el objetivo;
- Y un huntKey nuevo respecto al intento;
  O un evento field con serverNow posterior al estado anterior y reciente.

Para considerar que una cuenta ya está cazando:
- el slug debe coincidir;
- field.serverNow debe ser reciente.

Así un slug antiguo no puede hacer que el gestor muestre falsamente "Cazando".

ACCESIBILIDAD
=============
- Antes de intentar una hunt se comprueba el Pokémon equipado.
- Se reutiliza isUnlocked() de Hunt Intelligence.
- Si la cuenta no cumple el nivel:
  la interfaz muestra la hunt como bloqueada y esa cuenta deja de reanudarse.
- Las demás cuentas continúan independientemente.

NO MODIFICADO
=============
- Auto Catch.
- Poké Ball seleccionada.
- Configuración de captura.
- Ranking XP/h.
- Mejor general.
- No capturados.
- Item Finder.
- Rendimiento.
- Histórico móvil de 12 muestras.
- Calibración personal.
- PIWTools.
- Bonus diario.
- VIP.
- Botón 🧠.
- Las cinco pestañas normales de Hunt Intelligence.

PESTAÑAS NORMALES
=================
El panel principal sigue teniendo únicamente:
- Hunts
- No capturados
- Items
- Rendimiento
- Histórico

Favoritos NO vuelve a introducirse como pestaña del panel principal.

API PÚBLICA
===========
Se añaden a window.__PGHuntIntelligence:
- openFavoritesManager()
- startFavorites()
- stopFavorites()
- getFavoritesState()

HEALTH / BRIDGE
===============
Nuevas capabilities:
- favorites-manager
- per-account-favorites
- cross-tab-favorite-autohunt
- favorites-resume

Nuevos comandos:
- open-favorites-manager
- start-favorites
- stop-favorites

Health publica también:
- cuentas conocidas;
- cuentas enabled;
- cuentas running;
- estado de apertura del gestor.

VALIDACIÓN
==========
- JavaScript validado correctamente con node --check.
- @version comprobada: 1.1.34.
- Guards internos actualizados a V1134.
- Confirmadas las cinco pestañas normales sin pestaña Favoritos.
- Confirmado enlace #favoritesBtn.
- Confirmado runFavoritesScript().
- Confirmado enlace opcional al documento superior.
- Confirmadas 4 posiciones de cuenta.
- Confirmado máximo de 3 objetivos.
- Confirmada separación enabled/running.
- Confirmada reanudación únicamente cuando running=true.
- Confirmado BroadcastChannel + storage fallback.
- Confirmada deduplicación de órdenes.
- Confirmado watchdog.
- Confirmado que Analyzer antiguo no puede confirmar una hunt.
- Confirmado startHunt() booleano.
- Confirmadas las nuevas APIs y comandos Health.

SHA-256
=======
be6d8767a02774dba51090ef392ebae552a28edc8f7ea78815f4a4df29aa5ed6

ARCHIVOS
========
Script:
pokegrid-hunt-intelligence-1.1.34.txt

Registro de cambios:
actualizaciones-hunt-intelligence-1.1.34.txt

## PokeGrid - Script Bridge & Health Agent 1.1.8 — 2026-08-15

POKE IDLE WORLD — SCRIPT BRIDGE & HEALTH AGENT
ACTUALIZACIONES DE LA VERSIÓN 1.1.8
Fecha: 2026-08-15

VERSIÓN
=======
Anterior: 1.1.7
Nueva:    1.1.8

OBJETIVO
========
Eliminar completamente los cuadros flotantes automáticos que aparecían encima
del juego cuando un script publicaba un warning o un error.

ELIMINADO
=========
- Contenedor visual automático pg-bridge-auto-diagnostic-container.
- Tarjetas flotantes de advertencia.
- Tarjetas flotantes de error.
- Botón "Copiar diagnóstico" de esas tarjetas.
- Botón X de esas tarjetas.
- Temporizadores que hacían aparecer warnings.
- Temporizador de desaparición visual de warnings.
- Mapa interno de tarjetas visibles.
- Código encargado de crear, insertar, animar y retirar esas tarjetas.
- Límite visual de tres tarjetas simultáneas.
- Supresión especial de warnings visuales del Detector, ya innecesaria.

NUEVO COMPORTAMIENTO
====================
Cuando un script entra en warning/error:
- el estado sigue registrándose;
- las dependencias siguen registrándose;
- el último error sigue registrándose;
- el historial de errores sigue registrándose;
- Health sigue recibiendo la actualización;
- el icono/indicador de peligro puede reflejar el problema;
- el usuario puede entrar manualmente al panel de Salud;
- el último diagnóstico interno se sigue construyendo silenciosamente.

Lo único que desaparece es el popup automático encima del juego.

CONSERVADO
==========
- window.__pokeGridScripts.
- API version 1.0.0.
- register / update / heartbeat.
- setStatus / setMetric / setDependency.
- reportError / clearError.
- comandos entre scripts.
- pruebas funcionales.
- snapshots de salud.
- globalErrors.
- Agente de datos del juego.
- detección de inventory, balls, pokes y field.
- heartbeat del Bridge.
- evento pokegrid-script-health-update.
- evento pokegrid-health-bridge-ready.
- cola __pokeGridHealthQueue.
- UI Core compartido.
- createWindow().
- minimizar/maximizar/cerrar ventanas.
- movimiento y redimensionado.
- opacidad persistente.
- layout persistente.
- las funciones usadas por los demás scripts para integrarse con el Bridge.

CAPABILITIES
============
Se elimina:
- auto-health-diagnostics
- self-managed-warning-suppression

Se añade:
- silent-health-diagnostics

VALIDACIÓN
==========
- JavaScript validado con node --check: CORRECTO.
- @version comprobada: 1.1.8.
- Guard interno comprobado: __pgScriptBridgeV118.
- BRIDGE_VERSION comprobado: 1.1.8.
- 0 referencias a pg-bridge-auto-diagnostic-container.
- 0 referencias a ensureDiagnosticContainer().
- 0 referencias a showAutoDiagnostic().
- 0 mapas diagnosticCards/pendingWarningTimers.
- Confirmada la API pública principal del Bridge.
- Confirmado UI Core y sus controladores de ventana.

SHA-256
=======
e9329f4f0156c46893485b38a321eef8c65cdeda430f928b5d1d488c263c92d2

ARCHIVOS
========
Script:
pokegrid-script-bridge-health-agent-1.1.8.txt

Registro de cambios:
actualizaciones-script-bridge-health-agent-1.1.8.txt

## PokeGrid - Hunt Intelligence 1.1.33 — 2026-08-15

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.33
Fecha: 2026-08-15

VERSIÓN
=======
Anterior: 1.1.32
Nueva:    1.1.33

OBJETIVO
========
Eliminar completamente del script toda la función experimental de Favoritos y
dejar Hunt Intelligence preparado para rediseñar esa idea desde cero más adelante.

ESTRATEGIA UTILIZADA
====================
Las versiones 1.1.29, 1.1.30, 1.1.31 y 1.1.32 estuvieron dedicadas a añadir y
parchear el sistema de Favoritos/Farm x4.

Para evitar dejar listeners, estados, comandos o código huérfano, 1.1.33 se ha
reconstruido sobre la base estable de Hunt Intelligence 1.1.28, que ya contenía
el histórico móvil de 12 muestras y todas las funciones anteriores al experimento.

ELIMINADO COMPLETAMENTE
=======================
- Pestaña Favoritos.
- Buscador y lista persistente de favoritos.
- Botones de añadir, eliminar, Farmear x4, Reenviar x4 y Detener farm.
- Objetivo activo compartido.
- Sincronización entre pestañas/cuentas.
- BroadcastChannel usado por esa función.
- Respaldo mediante eventos de localStorage.
- Watchdog del objetivo x4.
- Prioridad que bloqueaba otros cambios de hunt.
- Resolución especial de hunts para Favoritos.
- Intentos de entrada directa mediante hunt-config introducidos para Favoritos.
- Comprobaciones especiales de field-init/hunt viva introducidas para Favoritos.
- Métricas de Health relacionadas con Favoritos.
- Capabilities del Bridge relacionadas con Favoritos.
- Comandos Health para abrir/detener Favoritos.
- API window.__PGFavoriteFarm.
- Métodos de window.__PGHuntIntelligence asociados a Favoritos.
- Textos, estilos CSS, botones y estados visuales relacionados.
- La supresión provisional de popups del Bridge añadida al final de 1.1.32.
  Esa responsabilidad pasa al propio Bridge 1.1.8.

INTERFAZ RESULTANTE
===================
Hunt Intelligence vuelve a tener únicamente:
- Hunts
- No capturados
- Items
- Rendimiento
- Histórico

CONSERVADO
==========
- Ranking de Hunts.
- Solo XP/h y Mejor general.
- No capturados.
- Item Finder.
- Rendimiento real.
- Histórico móvil de 12 muestras por Hunt + Pokémon.
- Calibración personal separada de kills/h y XP/h.
- Normalización VIP.
- Bonus diario.
- Seguimiento de leveling.
- Integración con PIWTools.
- Integración con Script Bridge / Health.
- Ventana gestionada por Bridge UI.
- Posición, tamaño y opacidad persistentes.
- Botón principal 🧠.
- Apertura minimizada al usar Map.
- Todas las funciones existentes antes de introducir Favoritos.

VALIDACIÓN
==========
- JavaScript validado con node --check: CORRECTO.
- @version comprobada: 1.1.33.
- Guards internos comprobados: V1133.
- No quedan referencias a 1.1.28/V1128.
- Búsqueda completa del script:
  * 0 referencias a favorito/favorite.
  * 0 referencias a favorite-farm.
  * 0 referencias a Farm sincronizado.
  * 0 referencias a BroadcastChannel.
- Confirmadas las cinco pestañas esperadas.
- Confirmadas las capabilities normales sin las capabilities de Favoritos.

SHA-256
=======
312bd677ac1e84d72a9ac8e4311297ff6807be538b92b475d6f15936608c0dea

ARCHIVOS
========
Script:
pokegrid-hunt-intelligence-1.1.33.txt

Registro de cambios:
actualizaciones-hunt-intelligence-1.1.33.txt

## PokeGrid - Hunt Intelligence 1.1.32 — 2026-08-10

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.32
Fecha: 2026-08-10

VERSIÓN
=======
Anterior: 1.1.31
Nueva:    1.1.32

PROBLEMA CONFIRMADO EN LA PRUEBA DE FARM x4
============================================
La 1.1.31 podía mostrar:
- Objetivo activo;
- "activo en las cuentas";
- e incluso el aviso verde de Farm sincronizado;

sin haber iniciado ninguna hunt.

El auditor entregado tras pulsar Farmear x4 muestra:
- no aparece GET /api/game/hunt-config?slug=larvitar;
- no aparece un field-init nuevo para Larvitar;
- el mensaje analyzer está en kills=0 y seconds=0.

Por tanto, la función de entrada estaba siendo abortada ANTES de intentar
la transición.

CAUSA REAL
==========
favoriteMatchesCurrent() utilizaba currentSlug(), y currentSlug() da prioridad a:

window.__poke.ws['field-init'].slug

Ese valor puede seguir guardando la ÚLTIMA hunt aunque la cuenta ya haya salido
al mapa/ciudad.

Si la última hunt había sido Larvitar, al pulsar Farmear x4 ocurría:

1. El objetivo se guarda como Larvitar.
2. favoriteMatchesCurrent() ve el field-init antiguo "larvitar".
3. Decide erróneamente que la cuenta YA está cazando Larvitar.
4. executeFavoriteFarmTarget() devuelve éxito inmediatamente.
5. No se ejecuta hunt-config.
6. No llega ningún field-init nuevo.
7. La interfaz pinta un falso estado activo.

Esta secuencia encaja exactamente con el auditor de la prueba.

CORRECCIÓN — HUNT VIVA, NO SOLO ÚLTIMO SLUG
============================================
Se añade favoriteLiveHuntState().

Ahora un slug coincidente NO basta para afirmar que una cuenta está cazando.

La comprobación exige señales de actividad real de la hunt:
- field reciente del servidor (serverNow dentro de una ventana de 10 segundos),
  o
- analyzer con tiempo de sesión > 0.

Si field-init conserva "larvitar" pero la cuenta está fuera de la hunt y el
analyzer está a 0, se considera correctamente que Larvitar NO está activo.

favoriteMatchesCurrent() usa esta nueva comprobación.

CORRECCIÓN — TRANSICIÓN DIRECTA
===============================
startHuntByOfficialConfig() también tenía una segunda comprobación antigua que
podía abortar por el mismo field-init obsoleto.

Ahora:
- "already active" solo se acepta con favoriteHuntLiveConfirmed();
- después de solicitar hunt-config se espera una hunt VIVA del slug objetivo;
- un field-init viejo no puede confirmar el intento;
- el fallback visual también exige confirmación viva cuando se ejecuta desde
  Favoritos.

La ruta directa GET /api/game/hunt-config?slug=<objetivo> se mantiene en esta
versión porque el auditor actual demuestra que 1.1.31 NO llegó a ejecutarla:
el falso positivo ocurrió antes. Por tanto, esta prueba todavía no permite
concluir que dicha ruta falle.

INTERFAZ DE FAVORITOS
=====================
Se eliminan los textos engañosos.

Antes:
- "Objetivo activo"
- "Farm sincronizado en curso"
- "activo en las cuentas"

Ahora se distingue entre:
- "Objetivo sincronizado": el objetivo se ha enviado/guardado;
- "Hunt confirmada en esta cuenta": existe actividad real en la hunt objetivo;
- "pendiente en esta cuenta": todavía no se ha confirmado.

El script ya no afirma que las otras cuentas están cazando únicamente porque
comparten el objetivo.

AVISO DE ÉXITO / FALLO
======================
El aviso verde:
"Farm sincronizado activo"

se sustituye por:
"✅ Hunt confirmada en esta cuenta"

y solo aparece si la hunt está realmente activa.

Si transcurren 10,5 segundos sin confirmación se muestra un error visible:
"❌ Objetivo enviado, pero esta cuenta todavía no confirmó la hunt de <Pokémon>."

Ya no queda únicamente un warning escondido en consola.

POPUPS MOLESTOS DE DIAGNÓSTICO
==============================
Se identificó que los popups de la segunda captura son generados por:
PokeGrid - Script Bridge & Health Agent

Concretamente por su contenedor:
pg-bridge-auto-diagnostic-container

Las tarjetas corresponden a estados publicados por:
- Game Structure Monitor;
- Agente de datos del juego;
- Detector de decisiones y suministros.

En 1.1.32 se añade una supresión VISUAL del contenedor automático:
- se elimina una tarjeta/contenedor ya existente al cargar;
- se instala CSS permanente para que el Bridge no pueda volver a mostrarlo;
- no se desactivan los estados, errores, heartbeat ni diagnósticos internos;
- no se modifica el funcionamiento de los otros scripts.

Esto elimina el ruido en pantalla pero conserva la información técnica para
cuando necesitemos diagnosticar algo.

BOTÓN ALTERNATIVO TIPO AUTOHUNT
===============================
No se añade todavía.

Motivo:
esta prueba ha revelado un bug concreto anterior a cualquier intento real de
entrada: un field-init antiguo hacía que el script creyera que ya estaba dentro.

Primero debe probarse esta corrección. Si 1.1.32 ya genera el intento real pero
aun así no consigue entrar, entonces sí se abandona esta arquitectura y se
plantea el botón específico tipo AutoHunt para el favorito activo.

SE CONSERVA
===========
- Favoritos en pestaña independiente.
- Añadir/eliminar favoritos.
- Farmear x4 / Reenviar x4.
- Detener farm.
- BroadcastChannel + localStorage.
- Watchdog del objetivo sincronizado.
- Ranking XP/general.
- No capturados.
- Item Finder.
- Rendimiento.
- Histórico móvil de 12 muestras.
- Bridge UI de Hunt Intelligence.
- Auto Catch y Poké Ball sin cambios.

VALIDACIÓN
==========
- JavaScript validado con node --check.
- @version: 1.1.32.
- Guards internos actualizados de V1131 a V1132.
- 0 referencias restantes a 1.1.31.
- favoriteMatchesCurrent() ya no acepta un slug almacenado sin actividad real.
- startHuntByOfficialConfig() usa favoriteHuntLiveConfirmed().
- El éxito de Farm favorito requiere hunt viva.
- El estado visual distingue objetivo enviado de hunt confirmada.
- El contenedor automático de diagnósticos del Bridge queda oculto sin apagar
  el sistema de health/diagnóstico.

SHA-256
=======
a5fce179283daab7622b057c16724dfab1f1683462117472a48f373d67c6ad72

ARCHIVOS
========
Script:
pokegrid-hunt-intelligence-1.1.32.txt

Registro de cambios:
actualizaciones-hunt-intelligence-1.1.32.txt

## PokeGrid - Hunt Intelligence 1.1.31 — 2026-08-10

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.31
Fecha: 2026-08-10

VERSIÓN
=======
Anterior: 1.1.30
Nueva:    1.1.31

PROBLEMA CONFIRMADO
====================
El Farm sincronizado seguía sin iniciar ninguna hunt.

El nuevo Auditor General vuelve a mostrar que, en el momento de pulsar Farmear x4,
no se produce una transición real de hunt:
- no aparece GET /api/game/hunt-config?slug=<objetivo>;
- no aparece un nuevo WebSocket field-init con el slug objetivo.

Esto demuestra que el problema no estaba ya en elegir el Pokémon o calcular su
nivel, sino en el mecanismo utilizado para ENTRAR realmente a la hunt.

CAUSA DE ARQUITECTURA
=====================
Las versiones 1.1.29 y 1.1.30 intentaban automatizar la entrada imitando la
interfaz:
1. abrir Map;
2. buscar región;
3. localizar un marker;
4. ejecutar marker.click();
5. buscar un posible botón Hunt/Cazar/Start;
6. esperar a que cambie field-init.

Ese sistema depende del DOM, de React y de que el juego acepte clicks sintéticos.
En la prueba real no llegaba a generar la petición de entrada a la hunt.

REFERENCIA DE UNA TRANSICIÓN REAL
=================================
Auditorías anteriores donde el juego SÍ cambia correctamente de hunt muestran
una secuencia estable:

GET /api/game/hunt-config?slug=ancient_dragonair
→ WebSocket field-init
→ slug: ancient_dragonair

Por tanto, 1.1.31 utiliza esa ruta observable del propio juego como mecanismo
principal para el Farm de Favoritos.

AÑADIDO — TRANSICIÓN DIRECTA
=============================
Se añaden:

- huntRawSlug(hunt)
  Obtiene el slug exacto de la hunt.

- huntSlugConfirmed(hunt)
  Comprueba el estado real de window.__poke/ws y no considera éxito hasta que
  el slug activo coincide con el objetivo.

- requestHuntConfigTransition(slug)
  Solicita directamente:
  /api/game/hunt-config?slug=<slug>

  La petición utiliza:
  * credentials: same-origin;
  * accessToken de la sesión de ESA cuenta cuando está disponible;
  * renovación automática del accessToken en HTTP 401/403;
  * cache: no-store para evitar reutilizar una respuesta vieja.

- startHuntByOfficialConfig(hunt)
  Ejecuta la petición anterior y espera hasta 7 segundos a que el juego publique
  field-init para esa hunt.

CAMBIO PRINCIPAL EN FARM FAVORITO
=================================
Cuando Farmear x4 llega a cada cuenta:

ANTES:
Farm favorito
→ abrir Map
→ buscar marker
→ click sintético
→ intentar Start
→ esperar field-init

AHORA:
Farm favorito
→ resolver slug exacto
→ GET /api/game/hunt-config?slug=<slug>
→ esperar field-init real
→ hunt confirmada

La interfaz del mapa queda únicamente como RESPALDO.

Si la petición directa:
- falla;
- devuelve error de autenticación no recuperable;
- o responde pero no produce field-init;

entonces Hunt Intelligence vuelve a intentar el mecanismo visual anterior.

SINCRONIZACIÓN X4
=================
Se conserva:
- BroadcastChannel;
- localStorage de respaldo;
- objetivo activo compartido;
- deduplicación de órdenes;
- watchdog;
- prioridad del favorito sobre otros cambios de Hunt Intelligence.

La diferencia es que ahora cada pestaña/cuenta, al recibir la orden, intenta
entrar directamente a la hunt utilizando SU propia sesión y SU propio token.

DIAGNÓSTICO AÑADIDO
===================
La consola registra ahora:

[Hunt Intelligence · Farm favorito] Orden recibida: ...

[Hunt Intelligence · transición directa]
Solicitando hunt-config: <slug>

Y, cuando funciona:

[Hunt Intelligence · transición directa]
field-init confirmado: <slug>

Si hunt-config responde pero field-init no llega, se registra claramente antes
de utilizar el respaldo visual.

CONFIRMACIÓN DE ÉXITO
=====================
No se considera éxito por:
- guardar el favorito;
- emitir BroadcastChannel;
- escribir localStorage;
- localizar un marker;
- recibir HTTP 200 solamente.

El Farm solo devuelve éxito cuando el slug activo del juego queda confirmado
como la hunt objetivo mediante el estado real de field-init/currentSlug.

BOTÓN ALTERNATIVO TIPO AUTOHUNT
===============================
NO se añade todavía.

Motivo:
el nuevo auditor sí permite identificar un punto concreto donde se rompe la
arquitectura actual: nunca se genera la transición hunt-config → field-init.

Por petición del usuario, primero se corrige ese mecanismo. Solo tendría sentido
plantear un botón alternativo que reutilice otro AutoHunt si esta ruta directa,
que reproduce la secuencia observada en cambios reales de hunt, tampoco funciona.

SE CONSERVA
===========
- Pestaña ⭐ Favoritos.
- Lista persistente.
- Farmear x4 / Reenviar x4.
- Detener farm.
- Eliminación de favoritos.
- Sin favoritos en Hunts.
- Sin favoritos en No capturados.
- Sin botón flotante ⭐.
- Ranking XP/general.
- Item Finder.
- No capturados.
- Rendimiento.
- Histórico móvil de 12 muestras.
- Bridge UI.
- Auto Catch y Poké Ball sin modificaciones.

VALIDACIÓN
==========
- JavaScript validado correctamente con node --check mediante copia temporal .js.
- @version comprobada: 1.1.31.
- Guards internos actualizados a V1131.
- 0 referencias restantes a 1.1.30.
- Confirmada presencia de requestHuntConfigTransition().
- Confirmada presencia de startHuntByOfficialConfig().
- Confirmado uso de /api/game/hunt-config?slug=...
- Confirmada espera de field-init/currentSlug antes de devolver éxito.
- Confirmado fallback al sistema visual anterior.
- Confirmado que la ruta directa se aplica al Farm favorito sin alterar el
  comportamiento normal de los botones de Hunts/Items/No capturados.

SHA-256
=======
a6ba5e850d33e469ee54e998a7f66ad357c25f305e64d9859a5ddc087a2a4eda

ARCHIVOS
========
Script:
pokegrid-hunt-intelligence-1.1.31.txt

Registro de cambios:
actualizaciones-hunt-intelligence-1.1.31.txt

## PokeGrid - Hunt Intelligence 1.1.30 — 2026-08-10

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.30
Fecha: 2026-08-10

VERSIÓN
=======
Anterior: 1.1.29
Nueva: 1.1.30

PROBLEMA DETECTADO CON EL AUDITOR
=================================
La prueba de 1.1.29 mostraba que, al pulsar Farmear x4, Hunt Intelligence cargaba
los datos necesarios (personaje, criaturas, objetos y /api/game/map-markers),
pero no llegaba a una entrada real de hunt.

No aparecía:
GET /api/game/hunt-config?slug=<objetivo>

ni un nuevo:
WebSocket field-init

Por tanto el fallo estaba antes de que startHunt() llegara a ejecutar la hunt.

CAUSA
=====
resolveFavoriteHunt() dependía primero de recommendation.rows, es decir, de las
filas del ranking de Hunt Intelligence.

Si el Pokémon elegido manualmente como favorito no aparecía en esas filas,
1.1.29 devolvía null aunque la hunt existiera y estuviera desbloqueada.

Eso no corresponde al objetivo de Favoritos: una hunt favorita no tiene por qué
ser buena para XP ni aparecer en ningún ranking.

CORREGIDO
=========
Favoritos queda completamente independiente del ranking.

Ahora cada cuenta:
1. Consulta directamente el catálogo oficial de hunts.
2. Resuelve el Pokémon por slug exacto, speciesId, nombre exacto o coincidencia
   compatible de respaldo.
3. Calcula el nivel requerido de la hunt.
4. Calcula el nivel de acceso de esa cuenta usando el Pokémon equipado y el nivel
   del entrenador.
5. Si puede acceder, entrega directamente esa hunt a startHunt().
6. startHunt() abre el mapa, localiza el marker/región y ejecuta la entrada.

Favoritos ya NO depende de:
- Solo XP/h
- Mejor general
- Top N
- Item Finder
- No capturados
- recommendation.rows

CONFIRMACIÓN REAL
=================
startHunt() devuelve ahora:
- true si el juego confirma el slug de la nueva hunt;
- false si no consigue confirmarlo.

Farmear x4 ya no muestra éxito solamente porque la orden se haya emitido.

La cuenta desde la que pulsas:
- envía la orden;
- intenta entrar;
- espera a que el juego confirme el cambio;
- solo después muestra el Farm como iniciado correctamente.

Si no se confirma, queda como fallo y el watchdog puede reintentarlo mientras
el objetivo siga activo.

SINCRONIZACIÓN ENTRE CUENTAS
============================
Se conserva:
- BroadcastChannel;
- localStorage como respaldo;
- IDs únicos de orden;
- deduplicación;
- objetivo compartido;
- watchdog;
- prioridad del objetivo favorito.

Cada cuenta resuelve la hunt con su propio nivel.

BOTÓN FLOTANTE ⭐
=================
ELIMINADO.

Se elimina completamente el botón separado que únicamente abría la pestaña
Favoritos.

Se conserva la pestaña:
⭐ Favoritos

Dentro de ella siguen disponibles:
- buscador;
- añadir favorito;
- lista persistente;
- Farmear x4;
- Reenviar x4;
- Detener farm;
- eliminar favorito;
- objetivo activo.

NO MODIFICADO
=============
- No se añaden favoritos en Hunts.
- No se añaden favoritos en No capturados.
- No se cambia Auto Catch.
- No se cambia la Poké Ball.
- No se altera el histórico móvil de 12 muestras.
- No se altera el ranking XP/general.
- No se altera Item Finder.
- No se altera Rendimiento.
- No se altera Histórico.
- No se altera Bridge UI.

VALIDACIÓN
==========
- JavaScript validado correctamente con node --check usando copia temporal .js.
- @version: 1.1.30
- Guards internos: V1130
- 0 referencias a 1.1.29
- 0 referencias a FAVORITES_BUTTON_ID
- resolveFavoriteHunt() ya no depende de recommendation.rows
- startHunt() confirma éxito/fallo real
- sincronización BroadcastChannel + localStorage conservada

SHA-256
=======
46bc8ccffdf444cf190f7931153bf971786d0cbcd0a8a03f43f7aa5f7f4f3aea

ARCHIVOS
========
pokegrid-hunt-intelligence-1.1.30.txt
actualizaciones-hunt-intelligence-1.1.30.txt

## PokeGrid - Hunt Intelligence 1.1.29 — 2026-08-10

POKE IDLE WORLD — HUNT INTELLIGENCE
ACTUALIZACIONES DE LA VERSIÓN 1.1.29
Fecha: 2026-08-10

VERSIÓN
=======
Anterior: 1.1.28
Nueva:    1.1.29

OBJETIVO PRINCIPAL
==================
Añadir un modo independiente para farmear Pokémon concretos por interés personal,
sin utilizar XP/h, Item Finder ni No capturados como criterio.

La función se llama:

FARM SINCRONIZADO DE FAVORITOS

AÑADIDO
=======
- Nueva pestaña:
  ⭐ Favoritos

- Nuevo botón flotante:
  ⭐
  Abre Hunt Intelligence directamente en la pestaña Favoritos.

- Buscador de Pokémon con hunt disponible.

- Botón:
  ⭐ Añadir favorito

- Lista persistente de Pokémon favoritos.
  La lista se conserva al refrescar/cerrar el juego mediante localStorage.

- Cada favorito dispone de:
  * Farmear x4
  * Reenviar x4 cuando ya es el objetivo activo
  * Eliminar favorito

- Se añade un objetivo activo único:
  🎯 Objetivo activo: <Pokémon>

- Se añade botón:
  ⏹ Detener farm

- El botón ⭐ exterior cambia visualmente cuando existe un Farm sincronizado activo.

SINCRONIZACIÓN ENTRE CUENTAS
============================
- Se añade un canal propio de sincronización entre las pestañas/cuentas abiertas
  del mismo juego.

- Transporte principal:
  BroadcastChannel

- Respaldo:
  evento "storage" mediante localStorage.

- Cada orden incluye un ID único para evitar ejecutar dos veces la misma orden
  si llega simultáneamente por BroadcastChannel y localStorage.

- Al pulsar "Farmear x4":
  1. Se guarda el objetivo activo.
  2. Se emite la orden a todas las pestañas/cuentas.
  3. Cada cuenta resuelve por sí misma la hunt accesible de ese Pokémon.
  4. Cada cuenta reutiliza el startHunt() nativo de Hunt Intelligence.
  5. Cada cuenta abre su mapa, localiza la región/hunt y entra en ella.

- El sistema sigue funcionando aunque Hunt Intelligence esté cerrado en las
  otras pestañas; únicamente necesita que el userscript esté cargado allí.

PRIORIDAD SOBRE OTRAS HUNTS
===========================
- Mientras un favorito está activo, Hunt Intelligence bloquea cambios manuales
  hacia una hunt distinta desde sus otros paneles.

- Si una cuenta se desvía del objetivo mientras el Farm sincronizado sigue
  activo, Hunt Intelligence comprueba periódicamente su hunt y vuelve a enviar
  esa cuenta al Pokémon favorito.

- El Farm favorito tiene prioridad lógica sobre:
  * ranking XP/h
  * Mejor general
  * Item Finder
  * No capturados
  cuando esos módulos intentan iniciar una hunt distinta a través de
  Hunt Intelligence.

- Al pulsar "Detener farm" se libera inmediatamente ese bloqueo.

ACCESIBILIDAD POR CUENTA
========================
- La orden sincronizada contiene el Pokémon objetivo, no una orden ciega de
  pulsar exactamente el mismo elemento del mapa.

- Cada cuenta utiliza su propio estado y su propio cálculo de hunts accesibles.

- Si una cuenta todavía no puede acceder a esa hunt, esa cuenta no fuerza una
  hunt bloqueada.

- Las demás cuentas que sí puedan acceder continúan normalmente.

AUTO CATCH
==========
- No se modifica la Poké Ball configurada.
- No se cambia la configuración de Auto Catch.
- El Farm sincronizado se encarga de llevar las cuentas a la hunt elegida.
- Una vez allí, cada cuenta continúa usando su sistema normal de Auto Catch.

NO AÑADIDO POR PETICIÓN EXPRESA
===============================
- NO se añaden estrellas/favoritos en la pestaña Hunts.
- NO se añaden estrellas/favoritos en No capturados.
- NO se utiliza el ranking de XP/h para decidir el favorito.
- NO se utiliza No capturados para decidir el favorito.
- NO se utiliza Item Finder para decidir el favorito.

Los Favoritos son exclusivamente una lista manual para Pokémon que el usuario
quiere conseguir para sí mismo.

INTERFAZ
========
Nueva estructura:

Hunts
No capturados
Items
⭐ Favoritos
Rendimiento
Histórico

Dentro de Favoritos:

- Campo de búsqueda
- Añadir favorito
- Lista de favoritos
- Farmear x4
- Eliminar
- Banner de objetivo activo
- Detener farm

API INTERNA AÑADIDA
===================
Se añade:

window.__PGFavoriteFarm

Funciones expuestas:
- open()
- list()
- add(query)
- remove(key)
- start(key)
- stop()
- getActive()
- isActive()

También se amplía:

window.__PGHuntIntelligence

con:
- openFavorites()
- getFavorites()
- startFavoriteFarm()
- stopFavoriteFarm()
- getFavoriteFarmState()

SCRIPT BRIDGE / HEALTH AGENT
============================
- Nueva capability:
  favorite-farm

- Nueva capability:
  cross-tab-favorite-farm

- Nuevo comando:
  open-favorites

- Nuevo comando:
  stop-favorite-farm

- El estado de salud muestra ahora:
  * cantidad de favoritos
  * si existe Farm activo
  * Pokémon objetivo actual

MODIFICADO
==========
- startHunt() acepta ahora contexto de Farm favorito.
- startHunt() bloquea cambios incompatibles mientras existe un objetivo favorito.
- rerunActivePanel() reconoce Favoritos.
- switchTab() reconoce Favoritos.
- Refresh reconoce Favoritos.
- Bridge UI muestra "⭐ Favoritos" como subtítulo cuando corresponde.
- Health Agent reconoce el estado de Favoritos.
- Descripción y guards internos actualizados a 1.1.29.

ELIMINADO
=========
- No se elimina ninguna función existente de Hunt Intelligence.
- No se elimina el Histórico móvil de 12 muestras.
- No se elimina el ranking XP/h.
- No se elimina Mejor general.
- No se elimina No capturados.
- No se elimina Item Finder.
- No se elimina Rendimiento.
- No se elimina la integración con Bridge UI.
- No se elimina la lógica actual de apertura minimizada desde Mapa.

NOTA SOBRE LAS 4 CUENTAS
========================
La sincronización incluida en 1.1.29 funciona entre pestañas/ventanas que
comparten el mismo origen del juego y el mismo almacenamiento del navegador,
que es el escenario normal cuando las cuatro cuentas están abiertas en el mismo
contexto de navegador.

El repositorio actual de Hunt Intelligence no contenía un módulo explícito
llamado "AutoHunt x4" que pudiéramos reutilizar como transporte. Por eso esta
versión incorpora directamente su propio canal de sincronización y no depende de
Codex ni de otro userscript para mostrar el botón o enviar la orden.

VALIDACIÓN
==========
- JavaScript validado correctamente con:
  node --check

- @version comprobada: 1.1.29
- Guards internos actualizados a V1129.
- Confirmada pestaña Favoritos.
- Confirmado botón flotante ⭐.
- Confirmado BroadcastChannel.
- Confirmado respaldo por storage.
- Confirmada deduplicación de comandos.
- Confirmada prioridad del Farm favorito en startHunt().
- Confirmado temporizador de vigilancia del objetivo.
- Confirmado que no se añadieron favoritos a Hunts.
- Confirmado que no se añadieron favoritos a No capturados.
- No quedan referencias internas a 1.1.28.

SHA-256
=======
dd81ff4503597644fc237178109776d38131fcd4addf8bcf560d26d81b38bed2

ARCHIVOS
========
Script:
pokegrid-hunt-intelligence-1.1.29.txt

Registro de cambios:
actualizaciones-hunt-intelligence-1.1.29.txt

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

# PokeGrid - Hunt Intelligence

## 1.1.32 — 2026-08-10

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

## 1.1.31 — 2026-08-10

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

## 1.1.30 — 2026-08-10

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

## 1.1.29 — 2026-08-10

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

## 1.1.28 — 2026-08-10

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

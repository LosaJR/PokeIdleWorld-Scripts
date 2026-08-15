# PokeGrid - Hunt Intelligence

## 1.1.38 — 2026-08-16

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

## 1.1.37 — 2026-08-16

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

## 1.1.36 — 2026-08-15

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

## 1.1.35 — 2026-08-15

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

## 1.1.34 — 2026-08-15

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

## 1.1.33 — 2026-08-15

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

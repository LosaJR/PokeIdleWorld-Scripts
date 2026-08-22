# PokeGrid - Boss Damage Meter

## 1.0.7 — 2026-08-22

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

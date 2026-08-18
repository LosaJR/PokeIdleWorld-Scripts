# PokeGrid - Auditor General

## 1.0.2 — 2026-08-18

POKE IDLE WORLD — POKEGRID AUDITOR GENERAL
ACTUALIZACIONES DE LA VERSIÓN 1.0.2
Fecha: 2026-08-18

VERSIÓN
=======
Anterior: 1.0.1
Nueva:    1.0.2

OBJETIVO
========
Ampliar el Auditor General para investigación del comportamiento real del juego,
reteniendo hasta 1000 registros y observando más fuentes sin capturar cabeceras
HTTP, cookies ni credenciales deliberadamente sensibles.

CAPACIDAD
=========
- MAX_ENTRIES pasa de 500 a 1000.
- La interfaz muestra registros actuales / 1000.
- La previsualización muestra los últimos 20 registros visibles.

PERSISTENCIA
============
La 1.0.1 guardaba el array completo en sessionStorage. Con respuestas grandes,
eso podía agotar la cuota del navegador mucho antes del límite nominal.

La 1.0.2 añade:
- IndexedDB como almacenamiento principal de las entradas completas.
- Poda automática para conservar las 1000 entradas más recientes.
- Snapshot ligero de las últimas 120 entradas en sessionStorage.
- Migración/lectura del snapshot v1.0.1 cuando existe.

FUENTES AUDITADAS
=================
Se mantienen:
- fetch
- XMLHttpRequest
- WebSocket entrada
- WebSocket salida
- window.__poke.api

Se añaden:
- WebSocket open
- WebSocket close
- WebSocket error
- Decodificación de payloads WebSocket Blob/ArrayBuffer cuando son legibles
- EventSource / Server-Sent Events
- navigator.sendBeacon
- postMessage del mismo origen
- localStorage/sessionStorage setItem
- localStorage/sessionStorage removeItem
- localStorage/sessionStorage clear
- history.pushState
- history.replaceState
- popstate
- window.__poke.ws por clave
- window.__poke.sess
- window.__poke.prev
- window.__poke.lastSlug
- window.__poke.accountId

ESTADO VIVO DE POKEGRID/JUEGO
=============================
El escaneo del estado window.__poke pasa de 500 ms a 250 ms.

window.__poke.api y window.__poke.ws se comparan por huella. Solo se crea una
entrada cuando cambia el contenido de cada clave, evitando duplicados idénticos.

Esto permite recuperar estados recientes aunque la petición o mensaje original
se produjera antes de pulsar "Empezar".

EXPORTACIÓN
===========
La exportación añade:
- maxEntries
- persistence
- transportSummary

transportSummary contabiliza cuántas entradas existen de cada transporte/tipo,
para localizar rápidamente qué canales está utilizando más el juego.

SEGURIDAD / REDACCIÓN
=====================
Se mantiene la política de no registrar cabeceras HTTP ni cookies.

Se refuerza la redacción de:
- Authorization / Bearer
- JWT aparentes
- access token / refresh token
- claves de Storage sensibles
- campos token/secret/password/session id
- parámetros sensibles dentro de URLs

Las claves de Storage propias del auditor se excluyen de la auditoría para evitar
recursión y ruido.

COMPATIBILIDAD
==============
- Sigue funcionando con @grant none.
- Sigue arrancando en document-start.
- Mantiene los botones Empezar / Detener / exportar / limpiar.
- scanCache continúa existiendo en window.__PokeGridGeneralAuditor y ahora ejecuta
  el escaneo ampliado del estado runtime.
- Se añade scanRuntime().
- Se añade getCapacity().

VALIDACIÓN
==========
- node --check: CORRECTO.
- @version: 1.0.2.
- MAX_ENTRIES: 1000.
- WebSocket entrada/salida/ciclo de vida: presente.
- EventSource/SSE: presente.
- sendBeacon: presente.
- postMessage mismo origen: presente.
- Storage set/remove/clear: presente.
- navegación SPA: presente.
- window.__poke.api: presente.
- window.__poke.ws: presente.
- window.__poke.sess/prev: presente.
- IndexedDB: presente.
- redacción de parámetros sensibles de URL: presente.

ARCHIVOS
========
pokegrid-auditor-de-acciones-v1.0.2.user.txt
actualizaciones-auditor-general-v1.0.2.txt

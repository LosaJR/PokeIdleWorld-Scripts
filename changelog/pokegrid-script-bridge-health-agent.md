# PokeGrid - Script Bridge & Health Agent

## 1.1.8 — 2026-08-15

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

Historial de versiones generado automáticamente desde `incoming/`.

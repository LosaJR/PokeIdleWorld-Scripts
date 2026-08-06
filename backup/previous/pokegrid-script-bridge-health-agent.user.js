// ==UserScript==
// @name         PokeGrid - Script Bridge & Health Agent
// @namespace    ivan-pokegrid-tools
// @version      1.1.1
// @description  Puente local para que los scripts publiquen estado, métricas, errores y comandos a la interfaz principal de PokeGrid.
// @match        https://poke.idleworld.online/*
// @grant        none
// @run-at       document-start
// @updateURL     https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-script-bridge-health-agent.meta.js
// @downloadURL   https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-script-bridge-health-agent.user.js
// ==/UserScript==

(() => {
  'use strict';
  if (window.__pgScriptBridgeV111) return;
  window.__pgScriptBridgeV111 = true;

  const BRIDGE_VERSION = '1.1.1';
  const API_VERSION = '1.0.0'; // Contrato base compatible; las pruebas son campos aditivos.
  const EVENT_NAME = 'pokegrid-script-health-update';
  const READY_EVENT = 'pokegrid-health-bridge-ready';
  const DEFAULT_STALE_MS = 45000;
  const MAX_ERRORS = 40;
  const MAX_STRING = 1800;
  const scripts = new Map();
  const commandHandlers = new Map();
  const testHandlers = new Map();
  let testsRunning = false;
  let lastTestRunAt = 0;
  const globalErrors = [];
  let revision = 0;
  let lastEmitAt = 0;
  let emitTimer = null;

  const now = () => Date.now();
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

  function truncate(value, limit = MAX_STRING) {
    const text = String(value ?? '');
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  }

  function sanitize(value, depth = 0, seen = new WeakSet()) {
    if (value === null || value === undefined) return value ?? null;
    if (typeof value === 'string') return truncate(value);
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (depth >= 7) return '[profundidad limitada]';
    if (typeof value !== 'object') return truncate(value);
    if (seen.has(value)) return '[referencia circular]';
    seen.add(value);
    if (Array.isArray(value)) {
      const output = value.slice(0, 100).map(item => sanitize(item, depth + 1, seen)).filter(item => item !== undefined);
      seen.delete(value);
      return output;
    }
    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 150)) {
      if (/password|passwd|authorization|cookie|access.?token|refresh.?token|secret/i.test(key)) {
        output[key] = '[oculto]';
        continue;
      }
      const clean = sanitize(item, depth + 1, seen);
      if (clean !== undefined) output[key] = clean;
    }
    seen.delete(value);
    return output;
  }

  function safeError(error, context = '') {
    const source = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(sanitize(error)));
    return {
      at: now(),
      name: truncate(source.name || 'Error', 120),
      message: truncate(source.message || String(error), 1200),
      stack: truncate(source.stack || '', 3500),
      context: truncate(context, 500)
    };
  }

  function normalizeStatus(status) {
    const value = String(status || '').toLowerCase();
    return ['ok', 'warning', 'error', 'waiting', 'stopped', 'unknown'].includes(value) ? value : 'unknown';
  }

  function defaultEntry(meta) {
    const createdAt = now();
    return {
      id: String(meta.id),
      name: truncate(meta.name || meta.id, 160),
      version: truncate(meta.version || '0.0.0', 80),
      description: truncate(meta.description || '', 500),
      icon: truncate(meta.icon || '', 20),
      category: truncate(meta.category || 'script', 80),
      status: normalizeStatus(meta.status || 'waiting'),
      statusText: truncate(meta.statusText || 'Registrado; esperando primera actualización.', 500),
      createdAt,
      updatedAt: createdAt,
      lastHeartbeat: createdAt,
      lastSuccessAt: 0,
      staleAfterMs: Math.max(15000, Number(meta.staleAfterMs) || DEFAULT_STALE_MS),
      dependencies: {},
      metrics: {},
      details: {},
      lastError: null,
      errors: [],
      commands: {},
      selfTest: null,
      capabilities: sanitize(meta.capabilities || []),
      source: truncate(meta.source || 'userscript', 100)
    };
  }

  function emitUpdate(reason = 'update', immediate = false) {
    revision += 1;
    const dispatch = () => {
      emitTimer = null;
      lastEmitAt = now();
      try {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, {
          detail: { revision, reason, at: lastEmitAt }
        }));
      } catch {}
    };
    if (immediate || now() - lastEmitAt > 250) dispatch();
    else if (!emitTimer) emitTimer = setTimeout(dispatch, 260);
  }

  function makeClient(id) {
    return Object.freeze({
      id,
      update: patch => api.update(id, patch),
      heartbeat: patch => api.heartbeat(id, patch),
      setStatus: (status, statusText, extra) => api.setStatus(id, status, statusText, extra),
      setMetric: (key, value) => api.setMetric(id, key, value),
      setDependency: (key, value, detail) => api.setDependency(id, key, value, detail),
      reportError: (error, context, options) => api.reportError(id, error, context, options),
      clearError: () => api.clearError(id),
      registerCommand: (name, handler, meta) => api.registerCommand(id, name, handler, meta),
      registerTest: (handler, meta) => api.registerTest(id, handler, meta),
      runTest: () => api.runTests(id),
      getState: () => api.getScript(id)
    });
  }

  function register(meta = {}) {
    const id = String(meta.id || '').trim();
    if (!/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(id)) throw new Error('El script necesita un id estable válido.');
    const existing = scripts.get(id);
    if (!existing) scripts.set(id, defaultEntry({ ...meta, id }));
    else {
      existing.name = truncate(meta.name || existing.name, 160);
      existing.version = truncate(meta.version || existing.version, 80);
      existing.description = truncate(meta.description ?? existing.description, 500);
      existing.icon = truncate(meta.icon ?? existing.icon, 20);
      existing.category = truncate(meta.category || existing.category, 80);
      existing.source = truncate(meta.source || existing.source, 100);
      existing.staleAfterMs = Math.max(15000, Number(meta.staleAfterMs) || existing.staleAfterMs);
      if (meta.capabilities) existing.capabilities = sanitize(meta.capabilities);
      existing.updatedAt = now();
      existing.lastHeartbeat = now();
    }
    emitUpdate(`register:${id}`, true);
    return makeClient(id);
  }

  function update(id, patch = {}) {
    const entry = scripts.get(String(id));
    if (!entry) throw new Error(`Script no registrado: ${id}`);
    const time = now();
    if (patch.status !== undefined) entry.status = normalizeStatus(patch.status);
    if (patch.statusText !== undefined) entry.statusText = truncate(patch.statusText, 500);
    if (patch.version !== undefined) entry.version = truncate(patch.version, 80);
    if (patch.dependencies && isObject(patch.dependencies)) entry.dependencies = { ...entry.dependencies, ...sanitize(patch.dependencies) };
    if (patch.metrics && isObject(patch.metrics)) entry.metrics = { ...entry.metrics, ...sanitize(patch.metrics) };
    if (patch.details && isObject(patch.details)) entry.details = { ...entry.details, ...sanitize(patch.details) };
    if (patch.capabilities) entry.capabilities = sanitize(patch.capabilities);
    if (patch.lastSuccessAt !== undefined) entry.lastSuccessAt = Number(patch.lastSuccessAt) || 0;
    if (patch.clearError) entry.lastError = null;
    if (patch.heartbeat !== false) entry.lastHeartbeat = time;
    entry.updatedAt = time;
    if (entry.status === 'ok') entry.lastSuccessAt = time;
    emitUpdate(`update:${id}`);
    return makeClient(entry.id);
  }

  function heartbeat(id, patch = {}) {
    return update(id, { ...patch, heartbeat: true });
  }

  function setStatus(id, status, statusText = '', extra = {}) {
    return update(id, { ...extra, status, statusText });
  }

  function setMetric(id, key, value) {
    return update(id, { metrics: { [String(key)]: value } });
  }

  function setDependency(id, key, value, detail = '') {
    return update(id, {
      dependencies: {
        [String(key)]: {
          ok: Boolean(value),
          detail: truncate(detail, 300),
          checkedAt: now()
        }
      }
    });
  }

  function reportError(id, error, context = '', options = {}) {
    const entry = scripts.get(String(id));
    if (!entry) throw new Error(`Script no registrado: ${id}`);
    const item = safeError(error, context);
    entry.lastError = item;
    entry.errors.push(item);
    entry.errors = entry.errors.slice(-12);
    entry.updatedAt = now();
    entry.lastHeartbeat = now();
    if (!options.keepStatus) {
      entry.status = normalizeStatus(options.status || 'error');
      entry.statusText = truncate(options.statusText || item.message, 500);
    }
    emitUpdate(`error:${id}`, true);
    return sanitize(item);
  }

  function clearError(id) {
    const entry = scripts.get(String(id));
    if (!entry) return false;
    entry.lastError = null;
    entry.updatedAt = now();
    emitUpdate(`clear-error:${id}`);
    return true;
  }

  function registerCommand(id, name, handler, meta = {}) {
    const entry = scripts.get(String(id));
    if (!entry) throw new Error(`Script no registrado: ${id}`);
    if (typeof handler !== 'function') throw new Error('El comando necesita una función.');
    const command = String(name || '').trim();
    if (!/^[a-z0-9][a-z0-9._-]{1,60}$/i.test(command)) throw new Error('Nombre de comando inválido.');
    commandHandlers.set(`${id}:${command}`, handler);
    entry.commands[command] = {
      name: command,
      label: truncate(meta.label || command, 120),
      description: truncate(meta.description || '', 300),
      dangerous: Boolean(meta.dangerous),
      args: sanitize(meta.args || null)
    };
    entry.updatedAt = now();
    emitUpdate(`command:${id}:${command}`);
    return true;
  }

  function registerTest(id, handler, meta = {}) {
    const entry = scripts.get(String(id));
    if (!entry) throw new Error(`Script no registrado: ${id}`);
    if (typeof handler !== 'function') throw new Error('La prueba necesita una función.');
    testHandlers.set(String(id), { handler, meta: sanitize(meta || {}) });
    entry.selfTest = {
      registered: true,
      label: truncate(meta.label || 'Prueba funcional', 120),
      lastRunAt: entry.selfTest?.lastRunAt || 0,
      ok: entry.selfTest?.ok ?? null,
      result: entry.selfTest?.result || null,
      error: entry.selfTest?.error || null
    };
    entry.updatedAt = now();
    emitUpdate(`test-register:${id}`);
    return true;
  }

  async function runTests(targetId = null) {
    if (testsRunning && !targetId) return { ok: false, busy: true, at: now() };
    const ids = targetId ? [String(targetId)] : [...testHandlers.keys()];
    if (!targetId) testsRunning = true;
    const results = {};
    try {
      for (const id of ids) {
        const record = testHandlers.get(id);
        const entry = scripts.get(id);
        if (!record || !entry) { results[id] = { ok: false, error: 'Prueba no registrada.' }; continue; }
        const startedAt = now();
        try {
          const raw = await Promise.race([
            Promise.resolve().then(() => record.handler()),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera agotado (8 s).')), 8000))
          ]);
          const result = sanitize(raw ?? { ok: true });
          const ok = isObject(result) && 'ok' in result ? Boolean(result.ok) : raw !== false;
          entry.selfTest = { registered: true, label: truncate(record.meta?.label || 'Prueba funcional', 120), lastRunAt: now(), durationMs: now()-startedAt, ok, result, error: null };
          entry.metrics = { ...entry.metrics, selfTestAt: entry.selfTest.lastRunAt, selfTestOk: ok };
          results[id] = { ok, result };
        } catch (error) {
          const safe = safeError(error, 'self-test');
          entry.selfTest = { registered: true, label: truncate(record.meta?.label || 'Prueba funcional', 120), lastRunAt: now(), durationMs: now()-startedAt, ok: false, result: null, error: safe };
          entry.metrics = { ...entry.metrics, selfTestAt: entry.selfTest.lastRunAt, selfTestOk: false };
          results[id] = { ok: false, error: safe.message };
        }
        entry.updatedAt = now();
        entry.lastHeartbeat = now();
      }
      lastTestRunAt = now();
      emitUpdate(targetId ? `test:${targetId}` : 'tests:all', true);
      return { ok: Object.values(results).every(item => item.ok), results: sanitize(results), at: lastTestRunAt };
    } finally { if (!targetId) testsRunning = false; }
  }

  async function runCommand(id, name, args = null) {
    const key = `${id}:${name}`;
    const handler = commandHandlers.get(key);
    if (!handler) return { ok: false, error: `Comando no disponible: ${key}` };
    try {
      const result = await handler(sanitize(args));
      update(id, { metrics: { lastCommand: name, lastCommandAt: now() } });
      return { ok: true, result: sanitize(result), at: now() };
    } catch (error) {
      reportError(id, error, `command:${name}`, { keepStatus: true });
      return { ok: false, error: truncate(error?.message || String(error), 1200), at: now() };
    }
  }

  function accountInfo() {
    const poke = window.__poke || {};
    const character = poke.api?.['/api/characters/me']?.character || {};
    const hunt = poke.ws?.['field-init']?.slug || poke.lastSlug || poke.sess?.slug || '';
    return sanitize({
      id: character.id || '',
      name: character.name || '',
      level: Number(character.level) || 0,
      hunt: String(hunt || ''),
      gameUrl: location.origin + location.pathname
    });
  }

  function environmentInfo() {
    const poke = window.__poke;
    const ws = poke?.ws;
    const apiCache = poke?.api;
    const inventoryItems = ws?.inventory?.items;
    const balls = ws?.balls;
    const pokes = ws?.pokes?.list;
    const session = poke?.sess;
    return sanitize({
      poke: Boolean(poke),
      ws: Boolean(ws),
      api: Boolean(apiCache),
      inventory: Array.isArray(inventoryItems),
      inventoryItems: Array.isArray(inventoryItems) ? inventoryItems.length : 0,
      balls: Boolean(balls?.counts && balls?.catalog),
      ballTypes: balls?.counts && typeof balls.counts === 'object' ? Object.keys(balls.counts).length : 0,
      pokes: Array.isArray(pokes),
      pokemonCount: Array.isArray(pokes) ? pokes.length : 0,
      field: Boolean(ws?.['field-init']),
      currentHunt: ws?.['field-init']?.slug || poke?.lastSlug || session?.slug || '',
      session: Boolean(session?.start),
      sessionKills: Number(session?.kills) || 0,
      wsEventTypes: ws && typeof ws === 'object' ? Object.keys(ws).length : 0,
      apiEntries: apiCache && typeof apiCache === 'object' ? Object.keys(apiCache).length : 0
    });
  }

  function publicEntry(entry) {
    const elapsed = now() - entry.lastHeartbeat;
    const stale = elapsed > entry.staleAfterMs;
    const output = sanitize(entry);
    output.stale = stale;
    output.heartbeatAgeMs = elapsed;
    if (stale && output.status === 'ok') {
      output.effectiveStatus = 'warning';
      output.effectiveStatusText = `Sin actualización durante ${Math.round(elapsed / 1000)} s.`;
    } else {
      output.effectiveStatus = output.status;
      output.effectiveStatusText = output.statusText;
    }
    return output;
  }

  function getSnapshot() {
    const result = {};
    for (const [id, entry] of scripts) result[id] = publicEntry(entry);
    return sanitize({
      schemaVersion: API_VERSION,
      bridgeVersion: BRIDGE_VERSION,
      revision,
      generatedAt: now(),
      account: accountInfo(),
      environment: environmentInfo(),
      scripts: result,
      globalErrors: globalErrors.slice(-12)
    });
  }

  function getScript(id) {
    const entry = scripts.get(String(id));
    return entry ? publicEntry(entry) : null;
  }

  function listScripts() {
    return [...scripts.keys()];
  }

  function recordGlobalError(error, context) {
    globalErrors.push(safeError(error, context));
    while (globalErrors.length > MAX_ERRORS) globalErrors.shift();
    emitUpdate('global-error');
  }

  const api = Object.freeze({
    apiVersion: API_VERSION,
    bridgeVersion: BRIDGE_VERSION,
    eventName: EVENT_NAME,
    register,
    update,
    heartbeat,
    setStatus,
    setMetric,
    setDependency,
    reportError,
    clearError,
    registerCommand,
    runCommand,
    registerTest,
    runTests,
    getSnapshot,
    getScript,
    listScripts,
    getEnvironment: environmentInfo,
    sanitize
  });

  Object.defineProperty(window, '__pokeGridScripts', {
    value: api,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const bridgeClient = register({
    id: 'script-bridge',
    name: 'Script Bridge & Health Agent',
    version: BRIDGE_VERSION,
    description: 'API local entre los userscripts y la interfaz principal de PokeGrid.',
    icon: '🩺',
    category: 'infrastructure',
    status: 'ok',
    statusText: 'Puente local disponible.',
    staleAfterMs: 60000,
    capabilities: ['health', 'metrics', 'errors', 'commands', 'snapshot', 'functional-tests']
  });

  const gameClient = register({
    id: 'game-data-agent',
    name: 'Agente de datos del juego',
    version: BRIDGE_VERSION,
    description: 'Comprueba que window.__poke y sus datos esenciales estén disponibles.',
    icon: '🎮',
    category: 'infrastructure',
    status: 'waiting',
    statusText: 'Esperando datos del juego.',
    staleAfterMs: 40000
  });

  function updateGameAgent() {
    try {
      const env = environmentInfo();
      const requiredReady = env.poke && env.ws && env.api;
      const gameplayReady = env.inventory && env.balls && env.pokes && env.field;
      let status = 'waiting';
      let text = 'Esperando que el juego envíe sus datos iniciales.';
      if (requiredReady && gameplayReady) {
        status = 'ok';
        text = env.currentHunt ? `Datos completos; hunt actual: ${env.currentHunt}.` : 'Datos completos; sin hunt activa.';
      } else if (requiredReady) {
        status = 'warning';
        const missing = ['inventory', 'balls', 'pokes', 'field'].filter(key => !env[key]);
        text = `Datos parciales; faltan: ${missing.join(', ')}.`;
      }
      gameClient.heartbeat({
        status,
        statusText: text,
        dependencies: {
          poke: { ok: env.poke, checkedAt: now() },
          ws: { ok: env.ws, checkedAt: now() },
          api: { ok: env.api, checkedAt: now() },
          inventory: { ok: env.inventory, checkedAt: now() },
          balls: { ok: env.balls, checkedAt: now() },
          pokes: { ok: env.pokes, checkedAt: now() },
          field: { ok: env.field, checkedAt: now() }
        },
        metrics: env
      });
      const testEntries = [...scripts.values()].filter(entry => entry.selfTest?.lastRunAt);
      bridgeClient.heartbeat({ status: 'ok', statusText: 'Puente local disponible.', metrics: {
        registeredScripts: scripts.size, revision, lastTestRunAt,
        functionalTests: { total: testHandlers.size, passed: testEntries.filter(entry => entry.selfTest?.ok).length, failed: testEntries.filter(entry => entry.selfTest?.ok === false).length }
      } });
    } catch (error) {
      gameClient.reportError(error, 'update-game-agent');
    }
  }

  registerCommand('script-bridge', 'get-diagnostics', () => getSnapshot(), {
    label: 'Obtener diagnóstico',
    description: 'Devuelve el snapshot completo de esta cuenta.'
  });
  registerCommand('script-bridge', 'clear-global-errors', () => {
    globalErrors.length = 0;
    emitUpdate('clear-global-errors', true);
    return { cleared: true };
  }, { label: 'Borrar errores globales' });

  registerCommand('script-bridge', 'run-self-tests', () => runTests(), {
    label: 'Probar funciones',
    description: 'Ejecuta las comprobaciones no invasivas registradas por todos los scripts.'
  });
  registerCommand('script-bridge', 'get-self-tests', () => {
    const output = {};
    for (const [id, entry] of scripts) if (entry.selfTest) output[id] = entry.selfTest;
    return { lastTestRunAt, tests: output };
  }, { label: 'Obtener pruebas funcionales' });

  registerTest('script-bridge', () => ({
    ok: Boolean(window.__pokeGridScripts?.getSnapshot && scripts.size >= 2),
    registeredScripts: scripts.size,
    commandHandlers: commandHandlers.size,
    testHandlers: testHandlers.size
  }), { label: 'Probar puente local' });
  registerTest('game-data-agent', () => {
    const env = environmentInfo();
    return { ok: Boolean(env.poke && env.ws && env.api && env.inventory && env.balls && env.pokes), ...env };
  }, { label: 'Probar datos del juego' });

  window.addEventListener('error', event => {
    if (event?.error) recordGlobalError(event.error, 'window.error');
    else if (event?.message) recordGlobalError(event.message, 'window.error');
  });
  window.addEventListener('unhandledrejection', event => recordGlobalError(event?.reason || 'Promesa rechazada', 'unhandledrejection'));

  updateGameAgent();
  setInterval(updateGameAgent, 10000);
  setTimeout(() => runTests().catch(() => {}), 15000);
  setInterval(() => runTests().catch(() => {}), 60000);

  try {
    const queued = Array.isArray(window.__pokeGridHealthQueue) ? window.__pokeGridHealthQueue.splice(0) : [];
    for (const task of queued) {
      try { if (typeof task === 'function') task(api); } catch (error) { recordGlobalError(error, 'health-queue'); }
    }
  } catch {}

  try { window.dispatchEvent(new CustomEvent(READY_EVENT, { detail: { apiVersion: API_VERSION, bridgeVersion: BRIDGE_VERSION } })); } catch {}
  console.info('[PokeGrid Script Bridge] v1.1.1 cargado: pruebas funcionales automáticas activas.');
})();

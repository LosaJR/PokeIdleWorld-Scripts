// ==UserScript==
// @name         PokeGrid - Script Bridge & Health Agent
// @namespace    ivan-pokegrid-tools
// @version      1.1.3
// @description  Puente local para que los scripts publiquen estado, métricas, errores y comandos a la interfaz principal de PokeGrid.
// @match        https://poke.idleworld.online/*
// @grant        none
// @run-at       document-start
// @updateURL     https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-script-bridge-health-agent.meta.js
// @downloadURL   https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-script-bridge-health-agent.user.js
// ==/UserScript==

(() => {
  'use strict';
  if (window.__pgScriptBridgeV113) return;
  window.__pgScriptBridgeV113 = true;

  const BRIDGE_VERSION = '1.1.3';
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
  const DIAG_CONTAINER_ID = 'pg-bridge-auto-diagnostic-container';
  const UI_CORE_VERSION = '1.0.0';
  const UI_STYLE_ID = 'pg-bridge-ui-core-style';
  const UI_STORAGE_PREFIX = 'pokegrid-ui-core-v1';
  const uiWindows = new Map();
  const alertedFailures = new Map();
  let lastAutoDiagnostic = null;

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

  function failedDependencies(entry) {
    if (!entry?.dependencies || typeof entry.dependencies !== 'object') return [];
    return Object.entries(entry.dependencies)
      .filter(([, value]) => value && typeof value === 'object' && value.ok === false)
      .map(([key, value]) => ({
        key,
        detail: truncate(value.detail || value.statusText || value.message || '', 300),
        checkedAt: Number(value.checkedAt) || 0
      }));
  }

  function buildAutoDiagnostic(entry) {
    const script = publicEntry(entry);
    return sanitize({
      bridgeVersion: BRIDGE_VERSION,
      generatedAt: now(),
      account: accountInfo(),
      environment: environmentInfo(),
      script,
      failedDependencies: failedDependencies(entry)
    });
  }

  async function copyDiagnosticText(value) {
    const text = JSON.stringify(value, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;left:-10000px;top:-10000px;opacity:0;';
      document.body.appendChild(area);
      area.focus();
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return Boolean(ok);
    } catch {
      return false;
    }
  }

  function ensureDiagnosticContainer() {
    if (!document.body) return null;
    let container = document.getElementById(DIAG_CONTAINER_ID);
    if (container) return container;
    container = document.createElement('div');
    container.id = DIAG_CONTAINER_ID;
    container.style.cssText = [
      'position:fixed',
      'right:14px',
      'top:14px',
      'z-index:100500',
      'width:min(430px,calc(100vw - 28px))',
      'display:flex',
      'flex-direction:column',
      'gap:8px',
      'pointer-events:none',
      'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';');
    document.body.appendChild(container);
    return container;
  }

  function showAutoDiagnostic(entry) {
    if (!entry || entry.status !== 'error') return;
    if (!document.body) {
      setTimeout(() => {
        const current = scripts.get(entry.id);
        if (current?.status === 'error') showAutoDiagnostic(current);
      }, 250);
      return;
    }

    const diagnostic = buildAutoDiagnostic(entry);
    lastAutoDiagnostic = diagnostic;
    const failed = diagnostic.failedDependencies || [];
    const error = entry.lastError;
    const container = ensureDiagnosticContainer();
    if (!container) return;

    const card = document.createElement('section');
    card.style.cssText = [
      'pointer-events:auto',
      'background:rgba(30,14,18,.94)',
      'color:#f5edf0',
      'border:1px solid rgba(255,116,126,.55)',
      'border-radius:11px',
      'box-shadow:0 12px 36px rgba(0,0,0,.55)',
      'padding:10px 11px',
      'backdrop-filter:blur(3px)'
    ].join(';');

    const dependencyText = failed.length
      ? failed.map(row => row.key).join(', ')
      : 'ninguna dependencia marcada como fallida';

    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <strong style="font-size:13px;flex:1;">⚠️ ${truncate(entry.name || entry.id, 120)} · error</strong>
        <button type="button" data-copy style="border:1px solid #70434a;background:#321b20;color:#ffd7dc;border-radius:7px;padding:5px 8px;cursor:pointer;font:700 11px system-ui;">Copiar diagnóstico</button>
        <button type="button" data-close style="border:0;background:transparent;color:#d9aeb4;font-size:18px;cursor:pointer;line-height:1;">×</button>
      </div>
      <div style="font-size:11px;line-height:1.45;color:#f0d8dc;">
        <div><b>Versión:</b> ${truncate(entry.version || '—', 80)}</div>
        <div><b>Estado:</b> ${truncate(entry.statusText || 'Error sin descripción', 360)}</div>
        <div><b>Dependencias:</b> ${truncate(dependencyText, 360)}</div>
        <div><b>Último heartbeat:</b> ${Math.max(0, Math.round((now() - entry.lastHeartbeat) / 1000))} s</div>
        ${error ? `<div><b>Último error:</b> ${truncate(error.context ? `${error.context}: ${error.message}` : error.message, 420)}</div>` : ''}
      </div>
    `;

    card.querySelector('[data-close]')?.addEventListener('click', () => card.remove());
    card.querySelector('[data-copy]')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      const copied = await copyDiagnosticText(diagnostic);
      button.textContent = copied ? 'Copiado ✓' : 'No se pudo copiar';
      setTimeout(() => {
        if (button.isConnected) button.textContent = 'Copiar diagnóstico';
      }, 1800);
    });

    container.prepend(card);
    while (container.children.length > 3) container.lastElementChild?.remove();
  }

  function evaluateAutoDiagnostic(entry) {
    if (!entry) return;
    if (entry.status !== 'error') {
      alertedFailures.delete(entry.id);
      return;
    }
    const failed = failedDependencies(entry).map(row => row.key).sort().join(',');
    const fingerprint = [
      entry.status,
      entry.statusText,
      entry.lastError?.message || '',
      entry.lastError?.context || '',
      failed
    ].join('|');
    if (alertedFailures.get(entry.id) === fingerprint) return;
    alertedFailures.set(entry.id, fingerprint);
    showAutoDiagnostic(entry);
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
    evaluateAutoDiagnostic(entry);
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
    evaluateAutoDiagnostic(entry);
    return sanitize(item);
  }

  function clearError(id) {
    const entry = scripts.get(String(id));
    if (!entry) return false;
    entry.lastError = null;
    entry.updatedAt = now();
    alertedFailures.delete(entry.id);
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

  function uiClamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function uiStorageKey(id, kind) {
    return `${UI_STORAGE_PREFIX}:${String(id)}:${kind}`;
  }

  function uiReadJson(key, fallback = null) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function uiWriteJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function uiReadOpacity(id, fallback = 90) {
    try {
      const stored = Number(localStorage.getItem(uiStorageKey(id, 'opacity')));
      return Number.isFinite(stored) ? uiClamp(stored, 0, 100) : uiClamp(fallback, 0, 100);
    } catch {
      return uiClamp(fallback, 0, 100);
    }
  }

  function uiWriteOpacity(id, value) {
    try {
      localStorage.setItem(uiStorageKey(id, 'opacity'), String(uiClamp(value, 0, 100)));
      return true;
    } catch {
      return false;
    }
  }

  function ensureUiCoreStyles() {
    if (document.getElementById(UI_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = UI_STYLE_ID;
    style.textContent = `
      .pg-ui-window{
        --pg-ui-opacity:.90;
        --pg-ui-head-opacity:.94;
        --pg-ui-card-opacity:.82;
        --pg-ui-soft-opacity:.68;
        position:fixed;z-index:100260;box-sizing:border-box;
        background:rgba(12,19,29,var(--pg-ui-opacity));
        color:#edf3fa;border:1px solid rgba(84,105,132,.78);border-radius:13px;
        box-shadow:0 16px 48px rgba(0,0,0,.62);
        backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);
        font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        overflow:auto
      }
      .pg-ui-window[hidden]{display:none!important}
      .pg-ui-window.pg-ui-minimized{height:auto!important;min-height:0!important;resize:none!important;overflow:hidden!important}
      .pg-ui-window.pg-ui-minimized>.pg-ui-body{display:none!important}
      .pg-ui-window.pg-ui-maximized{
        left:12px!important;top:12px!important;width:calc(100vw - 24px)!important;height:calc(100vh - 24px)!important;
        max-width:none!important;max-height:none!important;resize:none!important
      }
      .pg-ui-header{
        position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:8px;
        padding:9px 10px;background:rgba(17,27,41,var(--pg-ui-head-opacity));
        border-bottom:1px solid rgba(69,88,113,.80);
        cursor:grab;user-select:none;touch-action:none
      }
      .pg-ui-header:active{cursor:grabbing}
      .pg-ui-title{font-weight:900;font-size:13px;white-space:nowrap}
      .pg-ui-subtitle{
        min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        color:#b5c0cf;font-size:10px;margin-right:auto
      }
      .pg-ui-opacity{
        display:flex;align-items:center;gap:5px;flex:none;min-width:126px;
        color:#b9c5d4;font-size:9px;font-weight:800
      }
      .pg-ui-opacity input[type="range"]{
        width:76px;height:16px;margin:0;cursor:pointer;accent-color:#78aee0
      }
      .pg-ui-opacity-value{width:30px;text-align:right;font-variant-numeric:tabular-nums}
      .pg-ui-button{
        border:1px solid #4b607a;background:rgba(24,36,56,.88);color:#f4f8ff;
        border-radius:7px;min-width:29px;height:27px;padding:0 7px;
        font:800 12px system-ui;cursor:pointer;flex:none
      }
      .pg-ui-button:hover{background:rgba(38,55,80,.94)}
      .pg-ui-body{box-sizing:border-box}
      @media(max-width:700px){
        .pg-ui-opacity{min-width:104px}
        .pg-ui-opacity input[type="range"]{width:55px}
        .pg-ui-subtitle{display:none}
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function createUiWindow(options = {}) {
    if (!document.body) throw new Error('UI Core todavía no dispone de document.body.');

    const id = String(options.id || '').trim();
    if (!/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(id)) throw new Error('UI Core necesita un id estable válido.');
    const existing = uiWindows.get(id);
    if (existing && existing.panel?.isConnected) return existing;

    ensureUiCoreStyles();

    const domId = String(options.domId || `pg-ui-${id}`);
    const layoutKey = uiStorageKey(id, 'layout');
    const defaultOpacity = uiClamp(options.defaultOpacity ?? 90, 0, 100);
    const minWidth = Math.max(220, Number(options.minWidth) || 320);
    const minHeight = Math.max(80, Number(options.minHeight) || 150);
    const width = Math.max(minWidth, Number(options.width) || 460);
    const height = options.height == null ? null : Math.max(minHeight, Number(options.height) || minHeight);
    const movable = options.movable !== false;
    const resizable = options.resizable !== false;
    const minimizable = options.minimizable !== false;
    const maximizable = options.maximizable !== false;
    const closable = options.closable !== false;
    const rememberLayout = options.rememberLayout !== false;

    const panel = document.createElement('section');
    panel.id = domId;
    panel.className = `pg-ui-window pg-ui-managed${options.className ? ` ${String(options.className)}` : ''}`;
    panel.hidden = options.hidden !== false;
    panel.style.width = `${width}px`;
    panel.style.minWidth = `${minWidth}px`;
    panel.style.minHeight = `${minHeight}px`;
    panel.style.maxWidth = '96vw';
    panel.style.maxHeight = '92vh';
    panel.style.resize = resizable ? 'both' : 'none';
    panel.style.left = options.left != null ? `${Number(options.left)}px` : `calc(100vw - ${width + 30}px)`;
    panel.style.top = options.top != null ? `${Number(options.top)}px` : '72px';
    if (height != null) panel.style.height = `${height}px`;

    const header = document.createElement('div');
    header.className = 'pg-ui-header';

    const title = document.createElement('span');
    title.className = 'pg-ui-title';
    title.textContent = String(options.title || id);

    const subtitle = document.createElement('span');
    subtitle.className = 'pg-ui-subtitle';
    subtitle.textContent = String(options.subtitle || '');

    const opacityWrap = document.createElement('label');
    opacityWrap.className = 'pg-ui-opacity';
    opacityWrap.title = 'Opacidad del fondo de esta ventana';
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.step = '1';
    const opacityValue = document.createElement('span');
    opacityValue.className = 'pg-ui-opacity-value';

    opacityWrap.append(opacitySlider, opacityValue);
    header.append(title, subtitle, opacityWrap);

    const minimizeButton = minimizable ? document.createElement('button') : null;
    if (minimizeButton) {
      minimizeButton.type = 'button';
      minimizeButton.className = 'pg-ui-button';
      minimizeButton.textContent = '—';
      minimizeButton.title = 'Minimizar';
      header.appendChild(minimizeButton);
    }

    const maximizeButton = maximizable ? document.createElement('button') : null;
    if (maximizeButton) {
      maximizeButton.type = 'button';
      maximizeButton.className = 'pg-ui-button';
      maximizeButton.textContent = '□';
      maximizeButton.title = 'Maximizar';
      header.appendChild(maximizeButton);
    }

    const closeButton = closable ? document.createElement('button') : null;
    if (closeButton) {
      closeButton.type = 'button';
      closeButton.className = 'pg-ui-button';
      closeButton.textContent = '×';
      closeButton.title = 'Cerrar';
      header.appendChild(closeButton);
    }

    const body = document.createElement('div');
    body.className = `pg-ui-body${options.bodyClass ? ` ${String(options.bodyClass)}` : ''}`;
    panel.append(header, body);
    document.body.appendChild(panel);

    let maximized = false;
    let layoutBeforeMaximize = null;
    let drag = null;

    const applyOpacity = value => {
      const percent = uiClamp(value, 0, 100);
      const alpha = percent / 100;
      panel.style.setProperty('--pg-ui-opacity', alpha.toFixed(2));
      panel.style.setProperty('--pg-ui-head-opacity', uiClamp(alpha + 0.04, 0, 1).toFixed(2));
      panel.style.setProperty('--pg-ui-card-opacity', uiClamp(alpha * 0.91, 0, 1).toFixed(2));
      panel.style.setProperty('--pg-ui-soft-opacity', uiClamp(alpha * 0.76, 0, 1).toFixed(2));
      opacitySlider.value = String(Math.round(percent));
      opacityValue.textContent = `${Math.round(percent)}%`;
      uiWriteOpacity(id, percent);
      return percent;
    };

    const clampPanel = () => {
      if (!panel.isConnected || maximized) return;
      const rect = panel.getBoundingClientRect();
      const maxLeft = Math.max(4, innerWidth - Math.min(rect.width, innerWidth - 8) - 4);
      const maxTop = Math.max(4, innerHeight - Math.min(rect.height, innerHeight - 8) - 4);
      panel.style.left = `${uiClamp(rect.left, 4, maxLeft)}px`;
      panel.style.top = `${uiClamp(rect.top, 4, maxTop)}px`;
    };

    const saveLayout = () => {
      if (!rememberLayout || panel.hidden || maximized || panel.classList.contains('pg-ui-minimized')) return false;
      const rect = panel.getBoundingClientRect();
      return uiWriteJson(layoutKey, {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      });
    };

    const restoreLayout = () => {
      if (!rememberLayout) return false;
      const layout = uiReadJson(layoutKey, null);
      if (!layout || !['left','top','width','height'].every(key => Number.isFinite(Number(layout[key])))) return false;
      panel.style.left = `${Number(layout.left)}px`;
      panel.style.top = `${Number(layout.top)}px`;
      panel.style.width = `${Math.max(minWidth, Number(layout.width))}px`;
      panel.style.height = `${Math.max(minHeight, Number(layout.height))}px`;
      requestAnimationFrame(clampPanel);
      return true;
    };

    const setMinimized = minimized => {
      const next = Boolean(minimized);
      panel.classList.toggle('pg-ui-minimized', next);
      if (minimizeButton) {
        minimizeButton.textContent = next ? '▾' : '—';
        minimizeButton.title = next ? 'Desplegar' : 'Minimizar';
      }
      return next;
    };

    const toggleMaximize = () => {
      maximized = !maximized;
      if (maximized) {
        const rect = panel.getBoundingClientRect();
        layoutBeforeMaximize = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        panel.classList.add('pg-ui-maximized');
        setMinimized(false);
        if (maximizeButton) {
          maximizeButton.textContent = '❐';
          maximizeButton.title = 'Restaurar';
        }
      } else {
        panel.classList.remove('pg-ui-maximized');
        const layout = layoutBeforeMaximize || uiReadJson(layoutKey, null);
        if (layout) {
          panel.style.left = `${Number(layout.left)}px`;
          panel.style.top = `${Number(layout.top)}px`;
          panel.style.width = `${Math.max(minWidth, Number(layout.width))}px`;
          panel.style.height = `${Math.max(minHeight, Number(layout.height))}px`;
        }
        if (maximizeButton) {
          maximizeButton.textContent = '□';
          maximizeButton.title = 'Maximizar';
        }
        clampPanel();
        saveLayout();
      }
      return maximized;
    };

    if (movable) {
      header.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('button,input,label')) return;
        if (maximized) return;
        const rect = panel.getBoundingClientRect();
        drag = {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          left: rect.left,
          top: rect.top
        };
        try { header.setPointerCapture(event.pointerId); } catch {}
      });

      header.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.id) return;
        panel.style.left = `${uiClamp(drag.left + event.clientX - drag.startX, 4, Math.max(4, innerWidth - panel.offsetWidth - 4))}px`;
        panel.style.top = `${uiClamp(drag.top + event.clientY - drag.startY, 4, Math.max(4, innerHeight - panel.offsetHeight - 4))}px`;
        event.preventDefault();
      });

      const finishDrag = event => {
        if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
        drag = null;
        clampPanel();
        saveLayout();
      };
      header.addEventListener('pointerup', finishDrag);
      header.addEventListener('pointercancel', finishDrag);
    }

    opacitySlider.addEventListener('input', () => applyOpacity(opacitySlider.value));
    minimizeButton?.addEventListener('click', () => setMinimized(!panel.classList.contains('pg-ui-minimized')));
    maximizeButton?.addEventListener('click', toggleMaximize);
    closeButton?.addEventListener('click', () => { panel.hidden = true; });

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => saveLayout());
      observer.observe(panel);
      panel.__pgUiResizeObserver = observer;
    }
    const onResize = () => clampPanel();
    window.addEventListener('resize', onResize);

    applyOpacity(uiReadOpacity(id, defaultOpacity));
    restoreLayout();

    const controller = Object.freeze({
      id,
      panel,
      header,
      body,
      titleElement: title,
      subtitleElement: subtitle,
      opacitySlider,
      open: () => {
        panel.hidden = false;
        requestAnimationFrame(clampPanel);
        return true;
      },
      close: () => {
        panel.hidden = true;
        return true;
      },
      isOpen: () => !panel.hidden,
      setTitle: value => {
        title.textContent = String(value ?? '');
        return title.textContent;
      },
      setSubtitle: value => {
        subtitle.textContent = String(value ?? '');
        return subtitle.textContent;
      },
      setOpacity: value => applyOpacity(value),
      getOpacity: () => Number(opacitySlider.value),
      setMinimized,
      toggleMinimized: () => setMinimized(!panel.classList.contains('pg-ui-minimized')),
      toggleMaximized: toggleMaximize,
      saveLayout,
      restoreLayout,
      destroy: () => {
        try { panel.__pgUiResizeObserver?.disconnect(); } catch {}
        window.removeEventListener('resize', onResize);
        panel.remove();
        uiWindows.delete(id);
        return true;
      }
    });

    uiWindows.set(id, controller);
    return controller;
  }

  function getUiWindow(id) {
    return uiWindows.get(String(id)) || null;
  }

  const uiCore = Object.freeze({
    version: UI_CORE_VERSION,
    createWindow: createUiWindow,
    getWindow: getUiWindow,
    listWindows: () => [...uiWindows.keys()],
    getOpacity: id => uiReadOpacity(String(id), 90),
    setOpacity: (id, value) => {
      const controller = getUiWindow(id);
      return controller ? controller.setOpacity(value) : (uiWriteOpacity(String(id), value), uiClamp(value, 0, 100));
    }
  });

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
    sanitize,
    ui: uiCore
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
    capabilities: ['health', 'metrics', 'errors', 'commands', 'snapshot', 'functional-tests', 'auto-error-diagnostics', 'ui-core']
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
  registerCommand('script-bridge', 'get-last-auto-diagnostic', () => lastAutoDiagnostic || null, {
    label: 'Último diagnóstico automático',
    description: 'Devuelve el último diagnóstico mostrado al detectar un script en error.'
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
    ok: Boolean(window.__pokeGridScripts?.getSnapshot && window.__pokeGridScripts?.ui?.createWindow && scripts.size >= 2),
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
  console.info('[PokeGrid Script Bridge] v1.1.3 cargado: UI Core v1 con layout y opacidad persistentes por script.');
})();

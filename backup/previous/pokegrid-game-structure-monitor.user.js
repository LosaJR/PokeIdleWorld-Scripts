// ==UserScript==
// @name         PokeGrid - Game Structure Monitor
// @namespace    ivan-pokegrid-tools
// @version      1.2.0
// @description  Detecta cambios estructurales en los datos del juego y los publica en Script Bridge para facilitar reparaciones.
// @match        https://poke.idleworld.online/*
// @grant        none
// @run-at       document-start
// @updateURL     https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-game-structure-monitor.meta.js
// @downloadURL   https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-game-structure-monitor.user.js
// ==/UserScript==

(() => {
  'use strict';
  if (window.__pgGameStructureMonitorV120) return;
  window.__pgGameStructureMonitorV120 = true;

  const VERSION = '1.2.0';
  const SCRIPT_ID = 'game-structure-monitor';
  const BASELINE_KEY = 'pg-game-structure-monitor-v3:baseline';
  const HISTORY_KEY = 'pg-game-structure-monitor-v3:history';
  const LEARN_KEY = 'pg-game-structure-monitor-v3:learned';
  const BASELINE_SAMPLE_COUNT = 3;
  const BASELINE_SAMPLE_MS = 8000;
  const STARTED_AT = Date.now();
  const STABILIZE_MS = 30000;
  const SCAN_MS = 60000;
  const MAX_DEPTH = 6;
  const MAX_CHANGES = 160;
  let client = null;
  let currentSnapshot = null;
  let lastResult = null;
  let scanning = false;
  let timer = null;
  let bootstrapTimer = null;
  let pendingBaselineSamples = [];

  const now = () => Date.now();
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

  function clone(value, fallback = null) {
    try { return structuredClone(value); } catch {
      try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; }
    }
  }

  function loadJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : clone(fallback, fallback);
    } catch { return clone(fallback, fallback); }
  }

  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }

  function valueType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  function mergeShapes(shapes) {
    const valid = shapes.filter(Boolean);
    if (!valid.length) return { type: 'unknown' };
    const types = [...new Set(valid.map(shape => shape.type))];
    if (types.length > 1) return { type: 'union', options: types.sort() };
    const type = types[0];
    if (type === 'object') {
      const keys = [...new Set(valid.flatMap(shape => Object.keys(shape.children || {})))].sort();
      const children = {};
      for (const key of keys) {
        children[key] = mergeShapes(valid.map(shape => shape.children?.[key]).filter(Boolean));
      }
      return { type, children };
    }
    if (type === 'array') return { type, item: mergeShapes(valid.map(shape => shape.item).filter(Boolean)) };
    if (type === 'map') return { type, keyKind: valid[0].keyKind || 'dynamic', value: mergeShapes(valid.map(shape => shape.value).filter(Boolean)) };
    return { type };
  }

  const DYNAMIC_MAP_PATHS = [
    /^session\.hp$/,
    /^session\.shinySeen$/
  ];

  function isDynamicMapPath(path) {
    return DYNAMIC_MAP_PATHS.some(rule => rule.test(path));
  }

  function structuralShape(value, depth = 0, path = '') {
    const type = valueType(value);
    if (depth >= MAX_DEPTH) return { type };
    if (type === 'array') {
      const samples = value
        .filter(item => item !== undefined && item !== null)
        .slice(0, 5)
        .map(item => structuralShape(item, depth + 1, `${path}[]`));
      return { type: 'array', item: mergeShapes(samples) };
    }
    if (type === 'object') {
      const keys = Object.keys(value).sort();
      const numericKeys = keys.length >= 3 && keys.every(key => /^\d+$/.test(key));
      if (isDynamicMapPath(path)) {
        // Los IDs internos cambian continuamente. Solo importa que siga siendo un mapa,
        // no el tipo del primer valor observado cuando estaba vacío.
        return { type: 'map', keyKind: 'dynamic', value: { type: 'dynamic-value' } };
      }
      if (numericKeys) {
        const samples = keys.slice(0, 8).map(key => structuralShape(value[key], depth + 1, `${path}{}`));
        return { type: 'map', keyKind: 'numeric', value: mergeShapes(samples) };
      }
      const children = {};
      for (const key of keys.slice(0, 120)) {
        const childPath = path ? `${path}.${key}` : key;
        children[key] = structuralShape(value[key], depth + 1, childPath);
      }
      return { type: 'object', children };
    }
    return { type };
  }

  function getPath(root, path) {
    let current = root;
    for (const part of path) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }

  const ROOTS = [
    { id: 'ws.balls', path: ['ws', 'balls'], required: true },
    { id: 'ws.inventory', path: ['ws', 'inventory'], required: true },
    { id: 'ws.pokes', path: ['ws', 'pokes'], required: true },
    { id: 'ws.field-init', path: ['ws', 'field-init'], required: false },
    { id: 'api.items', path: ['api', '/game/items.json'], required: false },
    { id: 'api.creatures', path: ['api', '/game/creatures.json'], required: false },
    { id: 'session', path: ['sess'], required: false }
  ];

  function makeSnapshot() {
    const poke = window.__poke || {};
    const roots = {};
    const missing = [];
    for (const descriptor of ROOTS) {
      const value = getPath(poke, descriptor.path);
      if (value === undefined || value === null) {
        roots[descriptor.id] = { type: 'missing' };
        if (descriptor.required) missing.push(descriptor.id);
      } else roots[descriptor.id] = structuralShape(value, 0, descriptor.id);
    }
    return {
      schemaVersion: '1.2.0',
      generatedAt: now(),
      roots,
      missing,
      eventTypes: poke.ws && typeof poke.ws === 'object' ? Object.keys(poke.ws).sort() : [],
      apiEndpoints: poke.api && typeof poke.api === 'object' ? Object.keys(poke.api).sort() : []
    };
  }

  function mergeSnapshots(samples) {
    const valid = (samples || []).filter(Boolean);
    if (!valid.length) return null;
    const roots = {};
    for (const descriptor of ROOTS) roots[descriptor.id] = mergeShapes(valid.map(snapshot => snapshot.roots?.[descriptor.id]).filter(Boolean));
    return {
      schemaVersion: '1.2.0',
      generatedAt: now(),
      roots,
      missing: [...new Set(valid.flatMap(snapshot => snapshot.missing || []))],
      eventTypes: [...new Set(valid.flatMap(snapshot => snapshot.eventTypes || []))].sort(),
      apiEndpoints: [...new Set(valid.flatMap(snapshot => snapshot.apiEndpoints || []))].sort(),
      sampleCount: valid.length
    };
  }

  function learnedPattern(path) {
    return String(path || '')
      .replace(/[a-z0-9]{18,}/gi, '*')
      .replace(/\.\d+(?=\.|$)/g, '.*')
      .replace(/\{\}/g, '{*}');
  }

  function applyDynamicLearning(changes) {
    const registry = loadJson(LEARN_KEY, {});
    let changed = false;
    const critical = /^(ws\.(balls|inventory|pokes|field-init)|api\.(items|creatures))/;
    const result = [];
    for (const item of changes) {
      if (critical.test(item.path) || item.severity === 'info') { result.push(item); continue; }
      const pattern = learnedPattern(item.path);
      const row = registry[pattern] || { count: 0, firstAt: now(), lastAt: 0 };
      row.count += 1; row.lastAt = now(); registry[pattern] = row; changed = true;
      if (row.count >= 3 && /^session(?:\.|$)/.test(item.path)) {
        result.push({ ...item, severity: 'info', learnedDynamic: true });
      } else result.push(item);
    }
    if (changed) saveJson(LEARN_KEY, registry);
    return result;
  }

  function pushChange(changes, path, change, severity, before, after) {
    if (changes.length >= MAX_CHANGES) return;
    changes.push({ path, change, severity, before: before?.type || before || null, after: after?.type || after || null });
  }

  function compareShape(before, after, path, changes) {
    if (!before && after) return pushChange(changes, path, 'added', 'info', null, after);
    if (before && !after) return pushChange(changes, path, 'removed', 'high', before, null);
    if (!before || !after) return;
    if (before.type !== after.type) {
      pushChange(changes, path, 'type-changed', 'high', before, after);
      return;
    }
    if (before.type === 'object') {
      const beforeKeys = Object.keys(before.children || {});
      const afterKeys = Object.keys(after.children || {});
      for (const key of beforeKeys) {
        if (!(key in (after.children || {}))) pushChange(changes, `${path}.${key}`, 'removed', 'high', before.children[key], null);
      }
      for (const key of afterKeys) {
        if (!(key in (before.children || {}))) pushChange(changes, `${path}.${key}`, 'added', 'info', null, after.children[key]);
        else compareShape(before.children[key], after.children[key], `${path}.${key}`, changes);
      }
    } else if (before.type === 'array') compareShape(before.item, after.item, `${path}[]`, changes);
    else if (before.type === 'map') {
      if (before.value?.type === 'dynamic-value' || after.value?.type === 'dynamic-value') return;
      compareShape(before.value, after.value, `${path}{}`, changes);
    }
    else if (before.type === 'union') {
      const left = JSON.stringify(before.options || []);
      const right = JSON.stringify(after.options || []);
      if (left !== right) pushChange(changes, path, 'union-changed', 'medium', before, after);
    }
  }

  function compareSnapshots(baseline, current) {
    const changes = [];
    const baselineRoots = baseline?.snapshot?.roots || baseline?.roots || {};
    for (const descriptor of ROOTS) compareShape(baselineRoots[descriptor.id], current.roots[descriptor.id], descriptor.id, changes);
    const oldEvents = new Set(baseline?.snapshot?.eventTypes || baseline?.eventTypes || []);
    const newEvents = new Set(current.eventTypes || []);
    // Que un evento no aparezca en una sesión no implica que el juego lo haya eliminado.
    // Solo registramos eventos nuevos; los ausentes se ignoran para evitar falsos positivos.
    for (const event of newEvents) if (!oldEvents.has(event)) pushChange(changes, `ws.event:${event}`, 'event-added', 'info', null, 'present');
    return applyDynamicLearning(changes);
  }

  const AFFECTED_RULES = [
    [/^ws\.balls/, ['decision-detector', 'auto-catch']],
    [/^ws\.inventory/, ['inventory-market', 'decision-detector', 'hunt-advisor']],
    [/^ws\.pokes/, ['hunt-advisor', 'performance-supervisor']],
    [/^ws\.field-init|^session/, ['hunt-advisor', 'performance-supervisor', 'decision-detector']],
    [/^api\.items/, ['inventory-market', 'decision-detector', 'hunt-advisor']],
    [/^api\.creatures/, ['hunt-advisor', 'performance-supervisor']]
  ];

  function affectedScripts(changes) {
    const result = new Set();
    for (const item of changes) {
      for (const [rule, ids] of AFFECTED_RULES) if (rule.test(item.path)) ids.forEach(id => result.add(id));
    }
    return [...result].sort();
  }

  function summary(changes) {
    return {
      total: changes.length,
      high: changes.filter(item => item.severity === 'high').length,
      medium: changes.filter(item => item.severity === 'medium').length,
      info: changes.filter(item => item.severity === 'info').length
    };
  }

  function historyPush(result) {
    const history = loadJson(HISTORY_KEY, []);
    if (!Array.isArray(history)) return;
    history.push({ at: result.scannedAt, summary: result.summary, affectedScripts: result.affectedScripts, changes: result.changes.slice(0, 30) });
    saveJson(HISTORY_KEY, history.slice(-20));
  }

  function acceptBaseline(reason = 'manual') {
    currentSnapshot = makeSnapshot();
    const snapshots = reason.startsWith('automatic') && pendingBaselineSamples.length
      ? pendingBaselineSamples.slice(-BASELINE_SAMPLE_COUNT)
      : [currentSnapshot];
    const merged = mergeSnapshots(snapshots) || currentSnapshot;
    const baseline = { version: VERSION, acceptedAt: now(), reason, sampleCount: snapshots.length, snapshot: merged };
    saveJson(BASELINE_KEY, baseline);
    pendingBaselineSamples = [];
    lastResult = {
      baselineAt: baseline.acceptedAt,
      scannedAt: now(),
      ready: merged.missing.length === 0,
      changes: [], importantChanges: [],
      summary: { total: 0, high: 0, medium: 0, info: 0 },
      affectedScripts: [],
      message: snapshots.length > 1 ? `Referencia estable creada con ${snapshots.length} muestras.` : 'La estructura actual se ha guardado como referencia.'
    };
    publish();
    return clone(baseline);
  }

  function clearBaseline() {
    try { localStorage.removeItem(BASELINE_KEY); } catch {}
    lastResult = null;
    pendingBaselineSamples = [];
    publish();
    return { cleared: true };
  }

  function scanNow(force = false) {
    if (scanning) return clone(lastResult);
    scanning = true;
    try {
      currentSnapshot = makeSnapshot();
      const baseline = loadJson(BASELINE_KEY, null);
      const ready = currentSnapshot.missing.length === 0;
      if (!baseline && ready) {
        pendingBaselineSamples.push(currentSnapshot);
        pendingBaselineSamples = pendingBaselineSamples.slice(-BASELINE_SAMPLE_COUNT);
        if (force) return acceptBaseline('forced-first-baseline');
        if (now() - STARTED_AT >= STABILIZE_MS && pendingBaselineSamples.length >= BASELINE_SAMPLE_COUNT) {
          return acceptBaseline('automatic-stable-baseline');
        }
      }
      if (!baseline) {
        lastResult = {
          baselineAt: 0, scannedAt: now(), ready, changes: [], importantChanges: [],
          summary: { total: 0, high: 0, medium: 0, info: 0 }, affectedScripts: [],
          message: ready
            ? `Preparando referencia estable: ${pendingBaselineSamples.length}/${BASELINE_SAMPLE_COUNT} muestras.`
            : `Esperando datos: ${currentSnapshot.missing.join(', ')}.`
        };
      } else {
        const changes = compareSnapshots(baseline, currentSnapshot);
        const important = changes.filter(item => item.severity !== 'info');
        const count = important.length;
        lastResult = {
          baselineAt: baseline.acceptedAt || 0, scannedAt: now(), ready,
          changes, importantChanges: important, summary: summary(changes),
          affectedScripts: affectedScripts(important),
          message: count ? `Se ha${count === 1 ? '' : 'n'} detectado ${count} cambio${count === 1 ? '' : 's'} estructural${count === 1 ? '' : 'es'} relevante${count === 1 ? '' : 's'}.` : 'No se han detectado cambios estructurales relevantes.'
        };
        if (important.length) historyPush(lastResult);
      }
      publish();
      return clone(lastResult);
    } catch (error) {
      client?.reportError(error, 'scan-structure');
      throw error;
    } finally { scanning = false; }
  }

  function structureSelfTest() {
    const snapshot = currentSnapshot || makeSnapshot();
    const hp = snapshot.roots?.session?.children?.hp;
    const shiny = snapshot.roots?.session?.children?.shinySeen;
    return {
      ok: Boolean(snapshot && snapshot.roots && !snapshot.missing.length),
      roots: Object.keys(snapshot.roots || {}).length,
      requiredReady: !snapshot.missing.length,
      stableBaseline: Boolean(loadJson(BASELINE_KEY, null)),
      hpDynamicMap: !hp || hp.type === 'map',
      shinyDynamicMap: !shiny || shiny.type === 'map'
    };
  }

  function publish() {
    if (!client) return;
    const result = lastResult || { ready: false, summary: { total: 0, high: 0, medium: 0, info: 0 }, changes: [], affectedScripts: [], message: 'Preparando monitor.' };
    let status = 'waiting';
    if (result.ready) status = result.summary?.high || result.summary?.medium ? 'warning' : 'ok';
    client.heartbeat({
      status,
      statusText: result.message,
      metrics: {
        baselineAt: result.baselineAt || 0,
        lastScanAt: result.scannedAt || 0,
        ready: Boolean(result.ready),
        missing: currentSnapshot?.missing || [],
        changeSummary: result.summary,
        affectedScripts: result.affectedScripts || [],
        eventTypes: currentSnapshot?.eventTypes?.length || 0,
        apiEndpoints: currentSnapshot?.apiEndpoints?.length || 0,
        ignoredDynamicPaths: ['session.hp.*', 'session.shinySeen.*', 'ws.event:* no observado'],
        baselineSamples: loadJson(BASELINE_KEY, null)?.sampleCount || pendingBaselineSamples.length,
        learnedDynamicPatterns: Object.keys(loadJson(LEARN_KEY, {})).length,
        functionalTest: structureSelfTest()
      },
      details: {
        changes: (result.changes || []).slice(0, 100),
        importantChanges: (result.importantChanges || []).slice(0, 100)
      }
    });
  }

  function connectBridge() {
    const bridge = window.__pokeGridScripts;
    if (!bridge?.register) return false;
    if (client) return true;
    client = bridge.register({
      id: SCRIPT_ID,
      name: 'Game Structure Monitor',
      version: VERSION,
      description: 'Compara la estructura de los datos del juego con una referencia aceptada.',
      icon: '🧬',
      category: 'diagnostics',
      status: 'waiting',
      statusText: 'Preparando la primera lectura.',
      staleAfterMs: 150000,
      capabilities: ['structure-snapshot', 'diff', 'baseline', 'stable-baseline', 'dynamic-learning', 'export']
    });
    client.registerCommand('scan-now', () => scanNow(true), { label: 'Analizar ahora' });
    client.registerCommand('accept-baseline', () => acceptBaseline('manual-command'), { label: 'Aceptar estructura actual', dangerous: true });
    client.registerCommand('clear-baseline', clearBaseline, { label: 'Borrar referencia', dangerous: true });
    client.registerCommand('get-current-snapshot', () => currentSnapshot || makeSnapshot(), { label: 'Obtener snapshot actual' });
    client.registerCommand('get-diff', () => lastResult || scanNow(false), { label: 'Obtener diferencias' });
    client.registerCommand('get-history', () => loadJson(HISTORY_KEY, []), { label: 'Obtener historial' });
    try { client.registerTest?.(structureSelfTest, { label: 'Probar monitor estructural' }); } catch {}
    publish();
    return true;
  }

  window.__PGGameStructureMonitor = Object.freeze({
    version: VERSION,
    scanNow,
    acceptBaseline,
    clearBaseline,
    getCurrentSnapshot: () => clone(currentSnapshot || makeSnapshot()),
    getLastResult: () => clone(lastResult),
    getBaseline: () => clone(loadJson(BASELINE_KEY, null)),
    getHistory: () => clone(loadJson(HISTORY_KEY, [])),
    getLearnedPatterns: () => clone(loadJson(LEARN_KEY, {})),
    selfTest: structureSelfTest
  });

  window.addEventListener('pokegrid-health-bridge-ready', connectBridge);
  const bridgeTimer = setInterval(() => { if (connectBridge()) clearInterval(bridgeTimer); }, 1000);
  connectBridge();
  setTimeout(() => scanNow(false), 3000);
  bootstrapTimer = setInterval(() => {
    if (loadJson(BASELINE_KEY, null)) { clearInterval(bootstrapTimer); bootstrapTimer = null; return; }
    scanNow(false);
  }, BASELINE_SAMPLE_MS);
  timer = setInterval(() => scanNow(false), SCAN_MS);
  console.info('[Game Structure Monitor] v1.2.0 cargado: referencia multimuestra y aprendizaje de estructuras dinámicas.');
})();

// ==UserScript==
// @name         PokeGrid - Auditor General
// @namespace    ivan-pokegrid-tools
// @version      1.0.3
// @description  Auditor GAME ONLY para PokeGrid: hasta 1000 registros centrados en tráfico/estado del juego, filtrando scripts de usuario y evitando duplicados de window.__poke.ws.
// @match        https://poke.idleworld.online/*
// @grant        none
// @run-at       document-start
// @updateURL     https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-auditor-general.meta.js
// @downloadURL   https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-auditor-general.user.js
// ==/UserScript==

(() => {
  'use strict';
  if (window.__pgGeneralAuditorV103) return;
  window.__pgGeneralAuditorV103 = true;

  const VERSION = '1.0.3';
  const STORAGE_KEY = 'pokegrid-general-auditor-v1.0.3';
  const OLD_STORAGE_KEYS = ['pokegrid-general-auditor-v1.0.2', 'pokegrid-general-auditor-v1.0.1'];
  const DB_NAME = 'pokegrid-general-auditor-db-v2';
  const DB_STORE = 'entries';
  const MAX_ENTRIES = 1000;
  const SESSION_SNAPSHOT_ENTRIES = 120;
  const MAX_BODY_CHARS = 350000;
  const CACHE_POLL_MS = 250;
  const CAPTURE_MODE = 'GAME_ONLY';
  const SESSION_SAVE_DEBOUNCE_MS = 300;
  const UI_ID = 'pg-general-auditor-panel';
  const LAUNCHER_ID = 'pg-general-auditor-launcher';

  let enabled = false;
  let entries = loadEntries();
  let panel = null;
  let statusNode = null;
  let listNode = null;
  let filterNode = null;
  let saveTimer = null;
  let dbPromise = null;
  let idbWriteCounter = 0;
  let persistenceMode = 'memoria';
  let captureSequence = 0;

  const nowIso = () => new Date().toISOString();

  function loadEntries() {
    const merged = [];
    const keys = [STORAGE_KEY];
    for (const key of keys) {
      try {
        const parsed = JSON.parse(sessionStorage.getItem(key) || '[]');
        if (Array.isArray(parsed)) merged.push(...parsed);
      } catch {}
    }
    const byId = new Map();
    for (const entry of merged) {
      if (!entry || typeof entry !== 'object') continue;
      const id = String(entry.id || `${entry.timestamp || ''}:${entry.transport || ''}:${byId.size}`);
      byId.set(id, entry);
    }
    return [...byId.values()]
      .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')))
      .slice(-MAX_ENTRIES);
  }

  function saveEntries() {
    // sessionStorage queda como snapshot ligero de recuperación rápida. La copia
    // completa se conserva en IndexedDB para no chocar con la cuota pequeña de
    // Storage cuando la auditoría contiene cuerpos grandes.
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-SESSION_SNAPSHOT_ENTRIES)));
      persistenceMode = dbPromise ? 'IndexedDB + snapshot' : 'snapshot de sesión';
    } catch {
      persistenceMode = dbPromise ? 'IndexedDB' : 'solo memoria';
    }
  }

  function scheduleSaveEntries() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveEntries();
    }, SESSION_SAVE_DEBOUNCE_MS);
  }

  function openAuditDb() {
    if (dbPromise) return dbPromise;
    if (!('indexedDB' in window)) return null;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          const store = db.createObjectStore(DB_STORE, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB no disponible'));
    }).catch(error => {
      console.warn('[PokeGrid Auditor General] IndexedDB no disponible; se usará memoria/snapshot.', error);
      dbPromise = null;
      persistenceMode = 'snapshot de sesión';
      return null;
    });
    return dbPromise;
  }

  async function hydrateEntriesFromDb() {
    const db = await openAuditDb();
    if (!db) return;
    const stored = await new Promise(resolve => {
      try {
        const tx = db.transaction(DB_STORE, 'readonly');
        const request = tx.objectStore(DB_STORE).getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => resolve([]);
      } catch { resolve([]); }
    });
    if (!stored.length) {
      persistenceMode = 'IndexedDB + snapshot';
      return;
    }
    const byId = new Map();
    for (const entry of [...stored, ...entries]) {
      if (!entry || typeof entry !== 'object') continue;
      byId.set(String(entry.id || `${entry.timestamp || ''}:${byId.size}`), entry);
    }
    entries = [...byId.values()]
      .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')))
      .slice(-MAX_ENTRIES);
    persistenceMode = 'IndexedDB + snapshot';
    saveEntries();
    render();
  }

  async function persistEntry(entry) {
    const db = await openAuditDb();
    if (!db || !entry?.id) return false;
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('No se pudo guardar entrada'));
        tx.onabort = () => reject(tx.error || new Error('Guardado abortado'));
      });
      persistenceMode = 'IndexedDB + snapshot';
      idbWriteCounter++;
      if (idbWriteCounter % 25 === 0) pruneAuditDb();
      return true;
    } catch {
      return false;
    }
  }

  async function pruneAuditDb() {
    const db = await openAuditDb();
    if (!db) return;
    try {
      const count = await new Promise(resolve => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const request = tx.objectStore(DB_STORE).count();
        request.onsuccess = () => resolve(Number(request.result) || 0);
        request.onerror = () => resolve(0);
      });
      let remove = Math.max(0, count - MAX_ENTRIES);
      if (!remove) return;
      await new Promise(resolve => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        const index = tx.objectStore(DB_STORE).index('timestamp');
        const cursor = index.openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current || remove <= 0) return;
          current.delete();
          remove--;
          current.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {}
  }

  async function clearPersistentEntries() {
    const db = await openAuditDb();
    if (db) {
      try {
        await new Promise(resolve => {
          const tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        });
      } catch {}
    }
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      for (const key of OLD_STORAGE_KEYS) sessionStorage.removeItem(key);
    } catch {}
  }

  function truncateText(text, limit = MAX_BODY_CHARS) {
    const value = String(text ?? '');
    return value.length > limit ? `${value.slice(0, limit)}\n[truncado ${value.length - limit} caracteres]` : value;
  }

  function isSensitiveStorageKey(key) {
    const text = String(key || '');
    return /token|authorization|auth(?:entication)?|credential|cookie|password|passwd|secret|jwt|refresh.?token|access.?token/i.test(text);
  }

  function sanitize(value, depth = 0, seen = new WeakSet()) {
    if (value === null || value === undefined) return value ?? null;
    if (typeof value === 'string') {
      if (/^Bearer\s+/i.test(value)) return '[REDACTADO]';
      if (/eyJ[a-zA-Z0-9_-]{20,}\./.test(value)) return '[POSIBLE_TOKEN_REDACTADO]';
      if (/\\b(?:access|refresh)[_-]?token\\b\s*[:=]/i.test(value)) return '[POSIBLE_TOKEN_REDACTADO]';
      return truncateText(value);
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (depth > 12) return '[profundidad limitada]';
    if (typeof value !== 'object') return truncateText(value);
    if (seen.has(value)) return '[referencia circular]';
    seen.add(value);

    if (Array.isArray(value)) {
      const out = value.map(item => sanitize(item, depth + 1, seen));
      seen.delete(value);
      return out;
    }

    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/authorization|cookie|token|secret|password|passwd|session.?id/i.test(key)) {
        out[key] = '[REDACTADO]';
      } else {
        const clean = sanitize(item, depth + 1, seen);
        if (clean !== undefined) out[key] = clean;
      }
    }
    seen.delete(value);
    return out;
  }

  function parseMaybeJson(text) {
    const raw = truncateText(text);
    if (!raw) return '';
    try { return sanitize(JSON.parse(raw)); }
    catch { return sanitize(raw); }
  }

  function normalizeBody(body) {
    if (body === null || body === undefined) return null;
    if (typeof body === 'string') return parseMaybeJson(body);
    if (body instanceof URLSearchParams) return sanitize(Object.fromEntries(body.entries()));
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const out = {};
      for (const [key, value] of body.entries()) {
        out[key] = typeof value === 'string' ? value : `[archivo:${value?.name || 'sin-nombre'}]`;
      }
      return sanitize(out);
    }
    if (body instanceof Blob) return `[Blob ${body.type || 'sin-tipo'} ${body.size} bytes]`;
    if (body instanceof ArrayBuffer) return `[ArrayBuffer ${body.byteLength} bytes]`;
    if (ArrayBuffer.isView(body)) return `[TypedArray ${body.byteLength} bytes]`;
    return sanitize(body);
  }

  async function normalizeWirePayload(payload) {
    try {
      if (typeof payload === 'string') return parseMaybeJson(payload);
      if (payload instanceof Blob) {
        if (payload.size > MAX_BODY_CHARS) return `[Blob ${payload.type || 'sin-tipo'} ${payload.size} bytes]`;
        try { return parseMaybeJson(await payload.text()); }
        catch { return `[Blob ${payload.type || 'sin-tipo'} ${payload.size} bytes]`; }
      }
      if (payload instanceof ArrayBuffer) {
        if (payload.byteLength > MAX_BODY_CHARS) return `[ArrayBuffer ${payload.byteLength} bytes]`;
        try { return parseMaybeJson(new TextDecoder().decode(payload)); }
        catch { return `[ArrayBuffer ${payload.byteLength} bytes]`; }
      }
      if (ArrayBuffer.isView(payload)) {
        if (payload.byteLength > MAX_BODY_CHARS) return `[TypedArray ${payload.byteLength} bytes]`;
        try { return parseMaybeJson(new TextDecoder().decode(payload)); }
        catch { return `[TypedArray ${payload.byteLength} bytes]`; }
      }
      return sanitize(payload);
    } catch (error) {
      return `[payload no legible: ${error?.message || error}]`;
    }
  }

  function redactUrlObject(parsed) {
    try {
      for (const key of [...parsed.searchParams.keys()]) {
        if (isSensitiveStorageKey(key)) parsed.searchParams.set(key, '[REDACTADO]');
      }
    } catch {}
    return parsed;
  }

  function absoluteUrl(url) {
    try { return redactUrlObject(new URL(String(url || ''), location.href)).href; }
    catch { return String(url || '').replace(/([?&](?:access|refresh)?_?token|[?&](?:auth|authorization|jwt|secret))=[^&#]*/gi, '$1=[REDACTADO]'); }
  }

  function routeOf(url) {
    try {
      const parsed = redactUrlObject(new URL(url, location.href));
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return String(url || '').replace(/([?&](?:access|refresh)?_?token|[?&](?:auth|authorization|jwt|secret))=[^&#]*/gi, '$1=[REDACTADO]');
    }
  }

  function captureCallerStack() {
    try { return String(new Error().stack || ''); }
    catch { return ''; }
  }

  function externalCallerStack(stack) {
    const lines = String(stack || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines[0] && /^error\b/i.test(lines[0])) lines.shift();
    // captureCallerStack + wrapper auditado son nuestros dos primeros frames.
    // Se excluyen para que Tampermonkey no haga parecer "userscript" a todas
    // las llamadas legítimas del juego solo porque pasan por el auditor.
    return lines.slice(2, 10).join('\n');
  }

  function isLikelyUserscriptStack(stack) {
    const text = externalCallerStack(stack);
    if (!text) return false;
    return /userscript|tampermonkey|violentmonkey|greasemonkey|chrome-extension:|moz-extension:|pokegrid-(?:hunt|piwtools|decision|game-structure|boss|favorites?|bridge|script)|pg-(?:hunt|piwtools|decision|game-structure|boss|favorites?|bridge)|piwtools/i.test(text);
  }

  function websocketEventType(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
    const type = payload.type;
    return typeof type === 'string' && type.trim() ? type.trim() : '';
  }

  function websocketRoute(payload) {
    const type = websocketEventType(payload);
    return type ? `ws.${type}` : 'websocket';
  }

  function isInterestingUrl(url) {
    const route = routeOf(url);
    return (
      route.includes('/api/') ||
      route.endsWith('.json') ||
      /pokedex|caught|hunt|market|shop|inventory|pokemon|item|stone|npc|flint/i.test(route)
    );
  }

  function addEntry(entry) {
    if (!enabled) return;
    const clean = sanitize({
      id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: nowIso(),
      sequence: ++captureSequence,
      page: location.href,
      ...entry
    });

    entries.push(clean);
    if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
    scheduleSaveEntries();
    persistEntry(clean).catch(() => {});
    render();
  }

  async function responseBody(response) {
    try {
      const clone = response.clone();
      const contentType = clone.headers?.get?.('content-type') || '';
      if (
        contentType.includes('application/json') ||
        contentType.includes('text/') ||
        isInterestingUrl(response.url)
      ) {
        return parseMaybeJson(await clone.text());
      }
      return `[respuesta omitida: ${contentType || 'tipo desconocido'}]`;
    } catch (error) {
      return `[no se pudo leer respuesta: ${error?.message || error}]`;
    }
  }

  async function requestBodyFromFetch(input, init) {
    if (init?.body !== undefined) return normalizeBody(init.body);
    if (typeof Request !== 'undefined' && input instanceof Request) {
      try { return parseMaybeJson(await input.clone().text()); }
      catch { return '[no se pudo leer el cuerpo del Request]'; }
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // FETCH
  // -----------------------------------------------------------------------
  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = async function auditedFetch(input, init = {}) {
      const url = absoluteUrl(
        typeof input === 'string' || input instanceof URL ? input : input?.url
      );
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      const started = performance.now();
      const auditThisCall = !isLikelyUserscriptStack(captureCallerStack());
      const requestBody = auditThisCall ? await requestBodyFromFetch(input, init) : null;

      try {
        const response = await nativeFetch.apply(this, arguments);
        if (auditThisCall) addEntry({
          transport: 'fetch',
          method,
          url,
          route: routeOf(url),
          status: response.status,
          ok: response.ok,
          elapsedMs: Math.round((performance.now() - started) * 10) / 10,
          requestBody,
          responseBody: await responseBody(response)
        });
        return response;
      } catch (error) {
        if (auditThisCall) addEntry({
          transport: 'fetch',
          method,
          url,
          route: routeOf(url),
          elapsedMs: Math.round((performance.now() - started) * 10) / 10,
          requestBody,
          error: String(error?.message || error)
        });
        throw error;
      }
    };
  }

  // -----------------------------------------------------------------------
  // XHR
  // -----------------------------------------------------------------------
  const NativeXHR = window.XMLHttpRequest;
  if (typeof NativeXHR === 'function') {
    const nativeOpen = NativeXHR.prototype.open;
    const nativeSend = NativeXHR.prototype.send;

    NativeXHR.prototype.open = function auditedOpen(method, url) {
      this.__pgAudit = {
        method: String(method || 'GET').toUpperCase(),
        url: absoluteUrl(url)
      };
      return nativeOpen.apply(this, arguments);
    };

    NativeXHR.prototype.send = function auditedSend(body) {
      const meta = this.__pgAudit || { method: 'GET', url: '' };
      const started = performance.now();
      const auditThisCall = !isLikelyUserscriptStack(captureCallerStack());
      const requestBody = auditThisCall ? normalizeBody(body) : null;

      this.addEventListener('loadend', () => {
        if (!auditThisCall) return;
        let bodyOut = null;
        try {
          if (!this.responseType || this.responseType === 'text') {
            bodyOut = parseMaybeJson(this.responseText);
          } else if (this.responseType === 'json') {
            bodyOut = sanitize(this.response);
          } else {
            bodyOut = `[XHR responseType=${this.responseType}]`;
          }
        } catch (error) {
          bodyOut = `[no se pudo leer respuesta XHR: ${error?.message || error}]`;
        }

        addEntry({
          transport: 'xhr',
          method: meta.method,
          url: meta.url,
          route: routeOf(meta.url),
          status: this.status,
          ok: this.status >= 200 && this.status < 300,
          elapsedMs: Math.round((performance.now() - started) * 10) / 10,
          requestBody,
          responseBody: bodyOut
        });
      }, { once: true });

      return nativeSend.apply(this, arguments);
    };
  }

  // -----------------------------------------------------------------------
  // WEBSOCKET DEL JUEGO
  // Se conserva el mensaje original una sola vez. No se duplica después desde
  // window.__poke.ws. Las conexiones abiertas desde userscripts/extensiones se
  // excluyen por callsite cuando pueden identificarse.
  // -----------------------------------------------------------------------
  const NativeWebSocket = window.WebSocket;
  if (typeof NativeWebSocket === 'function') {
    class AuditedWebSocket extends NativeWebSocket {
      constructor(...args) {
        const callerStack = captureCallerStack();
        super(...args);
        this.__pgGeneralAuditorWrapped = true;
        this.__pgGeneralAuditorGameSocket = !isLikelyUserscriptStack(callerStack);
        const socketUrl = absoluteUrl(args[0]);

        if (this.__pgGeneralAuditorGameSocket) {
          this.addEventListener('open', () => addEntry({
            transport: 'websocket-open',
            url: socketUrl,
            route: 'websocket',
            protocol: this.protocol || ''
          }));

          this.addEventListener('message', event => {
            const receivedAt = nowIso();
            Promise.resolve(normalizeWirePayload(event.data)).then(payload => addEntry({
              timestamp: receivedAt,
              transport: 'websocket-in',
              url: socketUrl,
              route: websocketRoute(payload),
              eventType: websocketEventType(payload),
              payload
            }));
          });

          this.addEventListener('close', event => addEntry({
            transport: 'websocket-close',
            url: socketUrl,
            route: 'websocket',
            code: event.code,
            reason: sanitize(event.reason || ''),
            wasClean: Boolean(event.wasClean)
          }));

          this.addEventListener('error', () => addEntry({
            transport: 'websocket-error',
            url: socketUrl,
            route: 'websocket',
            error: 'Evento error de WebSocket'
          }));
        }
      }

      send(data) {
        const auditThisCall = this.__pgGeneralAuditorGameSocket && !isLikelyUserscriptStack(captureCallerStack());
        if (auditThisCall) {
          const sentAt = nowIso();
          Promise.resolve(normalizeWirePayload(data)).then(payload => addEntry({
            timestamp: sentAt,
            transport: 'websocket-out',
            url: this.url,
            route: websocketRoute(payload),
            eventType: websocketEventType(payload),
            payload
          }));
        }
        return super.send(data);
      }
    }

    Object.defineProperties(AuditedWebSocket, {
      CONNECTING: { value: NativeWebSocket.CONNECTING },
      OPEN: { value: NativeWebSocket.OPEN },
      CLOSING: { value: NativeWebSocket.CLOSING },
      CLOSED: { value: NativeWebSocket.CLOSED }
    });

    window.WebSocket = AuditedWebSocket;
  }

  // -----------------------------------------------------------------------
  // EVENTSOURCE / SSE
  // -----------------------------------------------------------------------
  const NativeEventSource = window.EventSource;
  if (typeof NativeEventSource === 'function') {
    class AuditedEventSource extends NativeEventSource {
      constructor(url, options) {
        const callerStack = captureCallerStack();
        super(url, options);
        if (isLikelyUserscriptStack(callerStack)) return;
        const sourceUrl = absoluteUrl(url);
        this.addEventListener('open', () => addEntry({ transport: 'eventsource-open', url: sourceUrl, route: routeOf(sourceUrl) }));
        this.addEventListener('message', event => addEntry({
          transport: 'eventsource-in',
          url: sourceUrl,
          route: routeOf(sourceUrl),
          eventType: event.type,
          lastEventId: event.lastEventId || '',
          payload: parseMaybeJson(event.data)
        }));
        this.addEventListener('error', () => addEntry({ transport: 'eventsource-error', url: sourceUrl, route: routeOf(sourceUrl) }));
      }
    }
    Object.defineProperties(AuditedEventSource, {
      CONNECTING: { value: NativeEventSource.CONNECTING },
      OPEN: { value: NativeEventSource.OPEN },
      CLOSED: { value: NativeEventSource.CLOSED }
    });
    window.EventSource = AuditedEventSource;
  }

  // -----------------------------------------------------------------------
  // SEND BEACON
  // -----------------------------------------------------------------------
  const nativeSendBeacon = navigator.sendBeacon?.bind(navigator);
  if (nativeSendBeacon) {
    try {
      navigator.sendBeacon = function auditedSendBeacon(url, data) {
        const auditThisCall = !isLikelyUserscriptStack(captureCallerStack());
        if (auditThisCall) addEntry({
          transport: 'beacon-out',
          method: 'BEACON',
          url: absoluteUrl(url),
          route: routeOf(url),
          requestBody: normalizeBody(data)
        });
        return nativeSendBeacon(url, data);
      };
    } catch {}
  }

  // -----------------------------------------------------------------------
  // GAME ONLY
  // No se interceptan postMessage, Storage ni history: en PokeGrid esas vías
  // están muy contaminadas por userscripts y consumían cientos de slots sin
  // aportar nueva telemetría del servidor.
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // CONTEXTO DEL JUEGO EN window.__poke
  // La API se observa por cambios porque puede contener respuestas cargadas
  // antes de pulsar Empezar. window.__poke.ws NO se sondea continuamente: el
  // WebSocket original ya se captura y duplicarlo malgastaba ~35% de los slots.
  // Al iniciar solo se toma un bootstrap pequeño de estados persistentes útiles.
  // -----------------------------------------------------------------------
  const cacheFingerprints = new Map();
  const bootstrapFingerprints = new Map();
  const BOOTSTRAP_WS_KEYS = Object.freeze([
    'pokes', 'field-init', 'field', 'analyzer', 'balls', 'inventory', 'events',
    'pending', 'trade'
  ]);

  function lightweightFingerprint(value) {
    try {
      const raw = JSON.stringify(value);
      if (raw.length <= 20000) return raw;
      return `${raw.length}:${raw.slice(0, 9000)}:${raw.slice(-9000)}`;
    } catch {
      return String(value);
    }
  }

  function scanObjectChanges(source, transport, prefix, fingerprints) {
    if (!source || typeof source !== 'object') return;
    for (const [key, value] of Object.entries(source)) {
      const fingerprint = lightweightFingerprint(value);
      const fpKey = `${prefix}:${key}`;
      if (fingerprints.get(fpKey) === fingerprint) continue;
      fingerprints.set(fpKey, fingerprint);
      addEntry({
        transport,
        method: 'CACHE',
        url: prefix === 'api' ? absoluteUrl(key) : location.href,
        route: prefix === 'api' ? key : `${prefix}.${key}`,
        responseBody: sanitize(value)
      });
    }
  }

  function scanPokeApiCache() {
    if (!enabled) return;
    try {
      const api = window.__poke?.api;
      if (!api || typeof api !== 'object') return;
      scanObjectChanges(api, 'poke-api-cache', 'api', cacheFingerprints);
    } catch {
      // El auditor nunca debe interferir con el juego.
    }
  }

  function capturePokeWsBootstrap(force = false) {
    if (!enabled) return;
    try {
      const ws = window.__poke?.ws;
      if (!ws || typeof ws !== 'object') return;
      for (const key of BOOTSTRAP_WS_KEYS) {
        if (!(key in ws)) continue;
        const value = ws[key];
        const fingerprint = lightweightFingerprint(value);
        const fpKey = `bootstrap:${key}`;
        if (!force && bootstrapFingerprints.get(fpKey) === fingerprint) continue;
        bootstrapFingerprints.set(fpKey, fingerprint);
        addEntry({
          transport: 'poke-ws-bootstrap',
          method: 'BOOTSTRAP',
          url: location.href,
          route: `ws.${key}`,
          eventType: value && typeof value === 'object' ? String(value.type || key) : key,
          responseBody: sanitize(value)
        });
      }
    } catch {
      // Contexto opcional; nunca interferir con el juego.
    }
  }

  function scanPokeGameContext({ bootstrap = false, forceBootstrap = false } = {}) {
    scanPokeApiCache();
    if (bootstrap) capturePokeWsBootstrap(forceBootstrap);
  }

  setInterval(scanPokeApiCache, CACHE_POLL_MS);
  setTimeout(scanPokeApiCache, 0);
  setTimeout(scanPokeApiCache, 500);
  setTimeout(scanPokeApiCache, 1000);
  setTimeout(scanPokeApiCache, 3000);

  // -----------------------------------------------------------------------
  // Exportación / UI
  // -----------------------------------------------------------------------
  function startCapture() {
    if (enabled) return;
    enabled = true;

    // Fuerza un snapshot de la caché existente justo al empezar, aunque esos
    // datos se hubieran cargado antes de activar el auditor.
    cacheFingerprints.clear();
    bootstrapFingerprints.clear();
    scanPokeGameContext({ bootstrap: true, forceBootstrap: true });
    render();
  }

  function stopCapture() {
    enabled = false;
    render();
  }

  function filteredEntries() {
    const query = String(filterNode?.value || '').trim().toLowerCase();
    if (!query) return entries;
    return entries.filter(entry => {
      const haystack = [
        entry.transport,
        entry.method,
        entry.route,
        entry.url,
        JSON.stringify(entry.requestBody ?? ''),
        JSON.stringify(entry.responseBody ?? ''),
        JSON.stringify(entry.payload ?? '')
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  function exportPayload(filtered = false) {
    const selected = filtered ? filteredEntries() : entries;
    return {
      tool: 'PokeGrid - Auditor General',
      version: VERSION,
      exportedAt: nowIso(),
      page: location.href,
      totalEntries: selected.length,
      totalStoredEntries: entries.length,
      maxEntries: MAX_ENTRIES,
      captureMode: CAPTURE_MODE,
      persistence: persistenceMode,
      transportSummary: selected.reduce((out, entry) => {
        const key = String(entry.transport || 'desconocido');
        out[key] = (out[key] || 0) + 1;
        return out;
      }, {}),
      filter: filtered ? String(filterNode?.value || '') : '',
      notes: [
        'Modo GAME ONLY: no se registran Storage, postMessage ni navegación, porque en PokeGrid esas vías están dominadas por userscripts.',
        'Las llamadas de red iniciadas desde userscripts/extensiones se filtran por callsite cuando el navegador permite identificarlas.',
        'window.__poke.ws solo aporta un bootstrap inicial de contexto; no se sondea continuamente para evitar duplicar los mismos mensajes WebSocket.',
        'No se registran cabeceras HTTP ni cookies; claves/campos de credenciales y tokens se redactan.',
        'La retención máxima en memoria/IndexedDB es de 1000 registros; sessionStorage solo conserva un snapshot ligero.'
      ],
      entries: selected
    };
  }

  async function copyExport(filtered = false) {
    const text = JSON.stringify(exportPayload(filtered), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      alert('Auditoría copiada.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      alert('Auditoría copiada.');
    }
  }

  function saveExport(filtered = false) {
    const payload = exportPayload(filtered);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = filtered && filterNode?.value
      ? `-${filterNode.value.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 30)}`
      : '';
    a.download = `pokegrid-general-audit${suffix}-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function clearEntries() {
    entries = [];
    cacheFingerprints.clear();
    bootstrapFingerprints.clear();
    clearPersistentEntries().catch(() => {});
    saveEntries();
    render();
    scanPokeGameContext({ bootstrap: true, forceBootstrap: true });
  }

  function createButton(label, fn) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = 'padding:6px 9px;border:1px solid #334155;border-radius:6px;background:#111827;color:#e5e7eb;cursor:pointer;font:600 12px Arial,sans-serif;';
    button.addEventListener('click', fn);
    return button;
  }

  function render() {
    if (!panel) return;
    const selected = filteredEntries();
    statusNode.textContent = `${enabled ? 'Grabando' : 'Detenido'} · GAME ONLY · ${entries.length}/${MAX_ENTRIES} registros · ${selected.length} visibles · ${persistenceMode}`;
    statusNode.style.color = enabled ? '#86efac' : '#fca5a5';

    listNode.textContent = selected.length
      ? JSON.stringify(selected.slice(-20), null, 2)
      : 'Sin registros para el filtro actual.';
  }

  function installUi() {
    if (!document.body || document.getElementById(LAUNCHER_ID)) return;

    const launcher = document.createElement('button');
    launcher.id = LAUNCHER_ID;
    launcher.type = 'button';
    launcher.textContent = 'AUD';
    launcher.title = 'PokeGrid Auditor General';
    launcher.style.cssText = `
      position:fixed;right:14px;bottom:142px;z-index:2147483646;
      width:42px;height:42px;border-radius:50%;border:1px solid #60a5fa;
      background:#07111f;color:white;font-size:20px;cursor:pointer;
      box-shadow:0 8px 24px rgba(0,0,0,.45);
    `;

    panel = document.createElement('section');
    panel.id = UI_ID;
    panel.style.cssText = `
      display:none;position:fixed;right:14px;bottom:192px;z-index:2147483647;
      width:min(700px,calc(100vw - 28px));max-height:min(720px,calc(100vh - 220px));
      overflow:auto;background:#07111f;color:#e5e7eb;border:1px solid #334155;
      border-radius:10px;padding:12px;box-shadow:0 14px 40px rgba(0,0,0,.6);
      font:13px Arial,sans-serif;
    `;

    const title = document.createElement('div');
    title.innerHTML = `<b>PokeGrid Auditor General v${VERSION}</b><br><small>GAME ONLY · 1000 registros · Red/WS/SSE · API · sin ruido de scripts</small>`;
    title.style.marginBottom = '9px';

    statusNode = document.createElement('div');
    statusNode.style.marginBottom = '9px';

    filterNode = document.createElement('input');
    filterNode.placeholder = 'Filtro: ws.field, field-kill, catch-result, poke-delta, pokedex, analyzer';
    filterNode.style.cssText = 'width:100%;box-sizing:border-box;margin-bottom:8px;padding:7px 9px;border:1px solid #334155;border-radius:6px;background:#020617;color:#e5e7eb;';
    filterNode.addEventListener('input', render);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px;';
    controls.append(
      createButton('Empezar', startCapture),
      createButton('Detener', stopCapture),
      createButton('Escanear contexto', () => { scanPokeGameContext({ bootstrap: true, forceBootstrap: true }); render(); }),
      createButton('Copiar filtrado', () => copyExport(true)),
      createButton('Guardar filtrado', () => saveExport(true)),
      createButton('Guardar todo', () => saveExport(false)),
      createButton('Limpiar', clearEntries),
      createButton('Cerrar', () => { panel.style.display = 'none'; })
    );

    listNode = document.createElement('pre');
    listNode.style.cssText = 'white-space:pre-wrap;word-break:break-word;margin:0;padding:10px;background:#020617;border:1px solid #1e293b;border-radius:7px;max-height:460px;overflow:auto;font:11px/1.4 Consolas,monospace;';

    panel.append(title, statusNode, filterNode, controls, listNode);
    document.body.append(launcher, panel);

    launcher.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      render();
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installUi, { once: true });
  } else {
    installUi();
  }

  window.__PokeGridGeneralAuditor = Object.freeze({
    version: VERSION,
    start: startCapture,
    stop: stopCapture,
    enable: startCapture,
    disable: stopCapture,
    clear: clearEntries,
    scanCache: scanPokeGameContext,
    scanRuntime: scanPokeGameContext,
    getCapacity: () => ({ maxEntries: MAX_ENTRIES, currentEntries: entries.length, captureMode: CAPTURE_MODE, persistence: persistenceMode }),
    getEntries: () => structuredClone(entries),
    exportAll: () => structuredClone(exportPayload(false)),
    exportFiltered: query => {
      const q = String(query || '').toLowerCase();
      const selected = !q ? entries : entries.filter(entry =>
        JSON.stringify(entry).toLowerCase().includes(q)
      );
      return structuredClone({
        tool: 'PokeGrid - Auditor General',
        version: VERSION,
        exportedAt: nowIso(),
        query,
        totalEntries: selected.length,
        entries: selected
      });
    }
  });

  hydrateEntriesFromDb().catch(() => {});
  console.info(`[PokeGrid Auditor General] v${VERSION} listo · GAME ONLY · capacidad ${MAX_ENTRIES} · captura detenida hasta pulsar Empezar.`);
})();

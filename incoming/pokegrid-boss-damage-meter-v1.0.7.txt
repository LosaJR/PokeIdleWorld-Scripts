// ==UserScript==
// @name         PokeGrid - Boss Damage Meter
// @namespace    ivan-pokegrid-tools
// @version      1.0.7
// @description  Medidor de daño por Boss con Top 6 en tiempo real, contador de Bronze Boss Token y repetición automática opcional del Boss seleccionado.
// @match        https://poke.idleworld.online/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-boss-damage-meter.meta.js
// @downloadURL  https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-boss-damage-meter.user.js
// ==/UserScript==

(() => {
  'use strict';
  if (window.__pgBossDamageMeterV107) return;
  window.__pgBossDamageMeterV107 = true;

  const VERSION = '1.0.7';
  const PANEL_ID = 'pg-boss-damage-meter-panel';
  const STYLE_ID = 'pg-boss-damage-meter-style';
  const LAYOUT_KEY = 'pg-boss-damage-meter-v1:layout';
  const AUTO_BOSS_SELECTION_KEY = 'pg-boss-damage-meter-v1:auto-boss-selection';
  const BRONZE_TOKEN_ITEM_ID = 70000;

  const POLL_MS = 80;
  const SOCKET_REATTACH_MS = 1000;
  const BOSS_REFRESH_MS = 5 * 60 * 1000;
  const BOSS_BOOT_REFRESH_MS = 1500;
  const BOSS_BOOT_REFRESH_COUNT = 12;
  const FINISH_AUTO_CLOSE_MS = 4500;
  const AUTO_BOSS_LOOT_WAIT_MS = 1800;
  const AUTO_BOSS_RETRY_MS = 7000;
  const AUTO_BOSS_UI_WAIT_MS = 420;

  let bossConfig = null;
  let bossCatalog = new Map();
  let arenaToBoss = new Map();

  let run = null;
  let lastFieldSeq = null;
  let lastFieldInitKey = '';
  let socket = null;
  let socketListener = null;
  let panelClosedForRun = false;
  let finishCloseTimer = null;
  let maximized = false;
  let layoutBeforeMaximize = null;
  let healthClient = null;
  let uiWindow = null;
  let usingBridgeUi = false;

  // Auto Boss nunca se reactiva tras recargar la página: el usuario debe
  // activarlo expresamente desde la propia interfaz en cada sesión.
  let autoBossEnabled = false;
  let selectedAutoBossKey = String(localStorage.getItem(AUTO_BOSS_SELECTION_KEY) || '');
  let bronzeTokens = null;
  let autoBossStatus = 'Inactivo';
  let autoBossBusy = false;
  let autoBossNextAttemptAt = 0;
  let autoBossRuns = 0;
  let lastInventoryRequestAt = 0;
  let lastAutoBossRunKey = '';

  const finite = (...values) => {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  const fmt = (value, decimals = 0) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-ES', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  function nowMs() {
    return Date.now();
  }

  function readJson(key, fallback = null) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function normalizeUiText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-ES')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function availableBosses() {
    const active = Array.isArray(bossConfig?.bosses) ? bossConfig.bosses : [];
    return active.map(key => {
      const bossKey = String(key);
      const catalog = bossCatalog.get(bossKey) || {};
      const arena = bossConfig?.arenas?.[bossKey] || null;
      return {
        key: bossKey,
        name: String(catalog.name || bossKey),
        image: String(catalog.img || catalog.icon || ''),
        level: finite(catalog.level),
        category: String(catalog.category || ''),
        arena
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'es-ES'));
  }

  function selectedAutoBoss() {
    return availableBosses().find(boss => boss.key === selectedAutoBossKey) || null;
  }

  function persistAutoBossSelection() {
    try {
      if (selectedAutoBossKey) localStorage.setItem(AUTO_BOSS_SELECTION_KEY, selectedAutoBossKey);
      else localStorage.removeItem(AUTO_BOSS_SELECTION_KEY);
    } catch {}
  }

  function ensureAutoBossSelection() {
    const bosses = availableBosses();
    if (!bosses.length) {
      selectedAutoBossKey = '';
      return null;
    }
    const existing = bosses.find(boss => boss.key === selectedAutoBossKey);
    if (existing) return existing;
    const currentBoss = bosses.find(boss => boss.key === run?.bossKey);
    selectedAutoBossKey = (currentBoss || bosses[0]).key;
    persistAutoBossSelection();
    return currentBoss || bosses[0];
  }

  function inventoryItemsFromPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.inventory)) return payload.inventory;
    return [];
  }

  function updateBronzeTokensFromItems(items, shouldRender = true) {
    if (!Array.isArray(items)) return false;
    const entry = items.find(item => Number(item?.itemId ?? item?.id) === BRONZE_TOKEN_ITEM_ID);
    const nextCount = Math.max(0, Math.floor(finite(entry?.quantity, entry?.qty, 0)));
    const changed = bronzeTokens !== nextCount;
    bronzeTokens = nextCount;
    if (autoBossEnabled && bronzeTokens <= 0) {
      autoBossEnabled = false;
      autoBossBusy = false;
      autoBossNextAttemptAt = 0;
      autoBossStatus = 'Sin Bronze Boss Tokens · Auto Boss detenido';
    }
    if (shouldRender && changed) render();
    return changed;
  }

  function syncBronzeTokensFromCache(shouldRender = false) {
    const cached = window.__poke?.ws?.inventory;
    const items = inventoryItemsFromPayload(cached);
    if (!items.length && !Array.isArray(cached?.items)) return false;
    return updateBronzeTokensFromItems(items, shouldRender);
  }

  function requestInventoryRefresh(force = false) {
    syncBronzeTokensFromCache(false);
    const now = nowMs();
    if (!force && now - lastInventoryRequestAt < 1800) return false;
    if (!socket || socket.readyState !== WebSocket.OPEN || typeof socket.send !== 'function') return false;
    lastInventoryRequestAt = now;
    try {
      socket.send(JSON.stringify({ type: 'inv-get' }));
      return true;
    } catch {
      return false;
    }
  }

  function setAutoBossStatus(text, shouldRender = true) {
    const next = String(text || '');
    if (autoBossStatus === next) return;
    autoBossStatus = next;
    if (shouldRender) render();
  }

  function stopAutoBoss(reason = 'Detenido por el usuario') {
    autoBossEnabled = false;
    autoBossBusy = false;
    autoBossNextAttemptAt = 0;
    autoBossStatus = String(reason || 'Inactivo');
    render();
    heartbeat();
    return true;
  }

  function setAutoBossEnabled(enabled) {
    if (!enabled) return stopAutoBoss('Detenido por el usuario');
    const boss = ensureAutoBossSelection();
    if (!boss) {
      autoBossStatus = 'No hay Bosses activos disponibles';
      render();
      return false;
    }
    syncBronzeTokensFromCache(false);
    requestInventoryRefresh(true);
    if (bronzeTokens !== null && bronzeTokens <= 0) {
      autoBossStatus = 'Sin Bronze Boss Tokens';
      render();
      return false;
    }
    autoBossEnabled = true;
    autoBossBusy = false;
    autoBossNextAttemptAt = nowMs();
    autoBossStatus = run && !run.outcome
      ? `Activo · esperando que termine ${run.bossName}`
      : `Activo · preparando ${boss.name}`;
    panelClosedForRun = false;
    openPanel(true);
    render();
    heartbeat();
    return true;
  }

  function elementIsVisible(element) {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.right > 0
      && rect.top < innerHeight && rect.left < innerWidth;
  }

  function elementDescriptor(element) {
    if (!element) return '';
    const parts = [
      element.textContent,
      element.getAttribute?.('title'),
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('data-boss'),
      element.getAttribute?.('data-boss-key'),
      element.getAttribute?.('data-key'),
      element.getAttribute?.('data-guide')
    ];
    element.querySelectorAll?.('img').forEach(img => {
      parts.push(img.alt, img.title, img.getAttribute('src'));
    });
    return normalizeUiText(parts.filter(Boolean).join(' '));
  }

  function clickableAncestor(element) {
    if (!element) return null;
    return element.closest?.('button, [role="button"], a, [tabindex], [data-boss], [data-boss-key]') || element;
  }

  function findNativeBossTarget(boss) {
    if (!boss) return null;
    const panel = document.getElementById(PANEL_ID);
    const name = normalizeUiText(boss.name);
    const key = normalizeUiText(boss.key);
    const image = normalizeUiText(String(boss.image || '').split('/').pop()?.replace(/\.[^.]+$/, '') || '');
    const selectors = [
      '[data-boss]', '[data-boss-key]', '[class*="boss"] button', '[class*="boss"] [role="button"]',
      '[class*="boss-card"]', '[class*="boss-row"]', 'button', '[role="button"]', 'a'
    ];
    const seen = new Set();
    const candidates = [];
    document.querySelectorAll(selectors.join(',')).forEach(node => {
      const target = clickableAncestor(node);
      if (!target || seen.has(target) || panel?.contains(target) || !elementIsVisible(target)) return;
      seen.add(target);
      const descriptor = elementDescriptor(target);
      let score = 0;
      if (name && descriptor === name) score += 120;
      if (name && descriptor.includes(name)) score += 80;
      if (key && descriptor.includes(key)) score += 65;
      if (image && descriptor.includes(image)) score += 55;
      if (normalizeUiText(target.getAttribute?.('data-boss-key')) === key) score += 150;
      if (/boss|chefe|jefe/.test(descriptor)) score += 5;
      if (score > 0) candidates.push({ target, score });
    });
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.target || null;
  }

  function findNativeBossLauncher() {
    const panel = document.getElementById(PANEL_ID);
    const exactLabels = new Set(['boss', 'bosses', 'chefes', 'jefes']);
    const candidates = [];
    document.querySelectorAll('button, [role="button"], a').forEach(target => {
      if (panel?.contains(target) || !elementIsVisible(target)) return;
      const descriptor = elementDescriptor(target);
      if (/damage meter|medidor/.test(descriptor)) return;
      const guide = normalizeUiText(target.getAttribute?.('data-guide'));
      let score = 0;
      if (exactLabels.has(descriptor)) score += 100;
      if (guide.includes('boss')) score += 90;
      if (/^(boss|bosses|chefes|jefes)\b/.test(descriptor)) score += 65;
      if (score) candidates.push({ target, score });
    });
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.target || null;
  }

  function findNativeBossConfirm() {
    const panel = document.getElementById(PANEL_ID);
    const labels = new Set([
      'lutar', 'enfrentar', 'desafiar', 'entrar', 'iniciar',
      'fight', 'challenge', 'enter', 'start',
      'combatir', 'luchar'
    ]);
    return Array.from(document.querySelectorAll('button, [role="button"]')).find(target => {
      if (panel?.contains(target) || !elementIsVisible(target) || target.disabled) return false;
      return labels.has(normalizeUiText(target.textContent || target.getAttribute?.('aria-label') || target.title));
    }) || null;
  }

  async function tryStartSelectedBoss() {
    if (!autoBossEnabled || autoBossBusy) return false;
    if (run && !run.outcome) return false;
    const boss = selectedAutoBoss() || ensureAutoBossSelection();
    if (!boss) return stopAutoBoss('Boss seleccionado no disponible');

    syncBronzeTokensFromCache(false);
    if (bronzeTokens !== null && bronzeTokens <= 0) return stopAutoBoss('Sin Bronze Boss Tokens');

    autoBossBusy = true;
    autoBossNextAttemptAt = nowMs() + AUTO_BOSS_RETRY_MS;
    setAutoBossStatus(`Abriendo Bosses · ${boss.name}`);
    try {
      let target = findNativeBossTarget(boss);
      if (!target) {
        const launcher = findNativeBossLauncher();
        if (launcher) {
          launcher.click();
          await sleep(AUTO_BOSS_UI_WAIT_MS);
          target = findNativeBossTarget(boss);
        }
      }

      if (!target) {
        setAutoBossStatus(`No encuentro ${boss.name} en la interfaz nativa · reintento automático`);
        return false;
      }

      target.click();
      setAutoBossStatus(`Seleccionado ${boss.name} · esperando inicio`);
      await sleep(AUTO_BOSS_UI_WAIT_MS);

      // Algunas versiones del panel nativo empiezan al pulsar la tarjeta; otras
      // muestran un segundo botón de confirmación. Solo lo pulsamos después de
      // haber seleccionado explícitamente el Boss solicitado.
      const confirm = findNativeBossConfirm();
      if (confirm && !isBossField(currentField())) confirm.click();

      requestInventoryRefresh(true);
      return true;
    } catch (error) {
      setAutoBossStatus(`Error al seleccionar Boss: ${error?.message || error}`);
      return false;
    } finally {
      autoBossBusy = false;
      render();
    }
  }

  function autoBossTick() {
    if (!autoBossEnabled || autoBossBusy) return;
    syncBronzeTokensFromCache(false);
    if (bronzeTokens !== null && bronzeTokens <= 0) {
      stopAutoBoss('Sin Bronze Boss Tokens · Auto Boss detenido');
      return;
    }
    if (run && !run.outcome) {
      setAutoBossStatus(`Activo · combate en curso: ${run.bossName}`, false);
      return;
    }
    if (nowMs() < autoBossNextAttemptAt) return;
    void tryStartSelectedBoss();
  }

  function queueNextAutoBossAfterLoot(field) {
    if (!autoBossEnabled || !run) return false;
    if (String(run.outcome).toLocaleLowerCase() !== 'won') {
      stopAutoBoss(`Combate terminado sin victoria (${run.outcome || 'resultado desconocido'})`);
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(field || {}, 'bossLoot') || !Array.isArray(field?.bossLoot)) {
      setAutoBossStatus('Victoria detectada · esperando resolución del loot');
      return false;
    }
    if (lastAutoBossRunKey === run.key) return true;
    lastAutoBossRunKey = run.key;
    autoBossRuns += 1;
    requestInventoryRefresh(true);
    autoBossNextAttemptAt = nowMs() + AUTO_BOSS_LOOT_WAIT_MS;
    const boss = selectedAutoBoss();
    setAutoBossStatus(`Loot recibido · siguiente: ${boss?.name || 'Boss seleccionado'}`);
    return true;
  }

  function autoBossControlsHtml() {
    const bosses = availableBosses();
    const selected = selectedAutoBossKey || bosses[0]?.key || '';
    const tokenText = bronzeTokens === null ? '—' : fmt(bronzeTokens);
    const options = bosses.length
      ? bosses.map(boss => `<option value="${esc(boss.key)}" ${boss.key === selected ? 'selected' : ''}>${esc(boss.name)}${boss.level ? ` · Nv. ${fmt(boss.level)}` : ''}</option>`).join('')
      : '<option value="">Sin Bosses activos</option>';
    return `
      <section class="pg-bdm-auto ${autoBossEnabled ? 'on' : ''}">
        <div class="pg-bdm-auto-head">
          <b>🤖 Auto Boss</b>
          <span class="pg-bdm-token"><img src="/assets/items/bronze_boss_token.png" alt=""> Bronze: <strong>${tokenText}</strong></span>
        </div>
        <div class="pg-bdm-auto-controls">
          <select data-auto-boss-select ${bosses.length ? '' : 'disabled'}>${options}</select>
          <button type="button" data-auto-boss-toggle class="${autoBossEnabled ? 'stop' : 'start'}">${autoBossEnabled ? '■ Detener' : '▶ Activar'}</button>
          <button type="button" data-auto-boss-refresh title="Actualizar Bosses y Bronze Tokens">↻</button>
        </div>
        <div class="pg-bdm-auto-status">${esc(autoBossStatus)}${autoBossRuns ? ` · ${fmt(autoBossRuns)} victoria${autoBossRuns === 1 ? '' : 's'} auto` : ''}</div>
      </section>`;
  }

  function installAutoBossPanelEvents(panel) {
    if (!panel || panel.dataset.pgAutoBossEvents === '1') return;
    panel.dataset.pgAutoBossEvents = '1';
    panel.addEventListener('change', event => {
      const select = event.target.closest?.('[data-auto-boss-select]');
      if (!select) return;
      selectedAutoBossKey = String(select.value || '');
      persistAutoBossSelection();
      const boss = selectedAutoBoss();
      autoBossStatus = autoBossEnabled
        ? `Activo · próximo Boss: ${boss?.name || selectedAutoBossKey}`
        : 'Boss seleccionado · pulsa Activar para repetirlo';
      if (autoBossEnabled && !(run && !run.outcome)) autoBossNextAttemptAt = nowMs();
      render();
    });
    panel.addEventListener('click', event => {
      const toggle = event.target.closest?.('[data-auto-boss-toggle]');
      if (toggle) {
        event.preventDefault();
        setAutoBossEnabled(!autoBossEnabled);
        return;
      }
      const refresh = event.target.closest?.('[data-auto-boss-refresh]');
      if (refresh) {
        event.preventDefault();
        refreshBossDefinitions().catch(() => {});
        requestInventoryRefresh(true);
        setAutoBossStatus('Actualizando Bosses y Bronze Tokens');
      }
    });
  }

  function normalizeBossPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const bosses = Array.isArray(payload.bosses) ? payload.bosses.map(String) : [];
    const arenas = payload.arenas && typeof payload.arenas === 'object' ? payload.arenas : {};
    if (!bosses.length || !Object.keys(arenas).length) return null;
    return { ...payload, bosses, arenas };
  }

  function normalizeCatalog(payload) {
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.bosses)
        ? payload.bosses
        : [];
    return rows.filter(row => row && typeof row === 'object' && row.key);
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  }

  async function refreshBossDefinitions() {
    let bossPayload = normalizeBossPayload(window.__poke?.api?.['/api/game/boss']);
    let catalogPayload = normalizeCatalog(
      window.__poke?.api?.['/game/bossCatalog.json']
      || window.__poke?.api?.['https://poke.idleworld.online/game/bossCatalog.json']
    );

    if (!bossPayload) {
      try {
        bossPayload = normalizeBossPayload(await fetchJson('/api/game/boss'));
      } catch (error) {
        console.warn('[Boss Damage Meter] No se pudo actualizar /api/game/boss:', error);
      }
    }

    if (!catalogPayload.length) {
      try {
        catalogPayload = normalizeCatalog(await fetchJson('/game/bossCatalog.json'));
      } catch (error) {
        console.warn('[Boss Damage Meter] No se pudo actualizar bossCatalog.json:', error);
      }
    }

    if (bossPayload) bossConfig = bossPayload;
    if (catalogPayload.length) {
      bossCatalog = new Map(catalogPayload.map(row => [String(row.key), row]));
    }

    rebuildArenaMap();
    ensureAutoBossSelection();
    syncBronzeTokensFromCache(false);
    updateCurrentRunBossIdentity();
    inspectCurrentGameState();
    render();
    return {
      activeBosses: bossConfig?.bosses?.length || 0,
      arenas: arenaToBoss.size,
      catalog: bossCatalog.size
    };
  }

  function rebuildArenaMap() {
    arenaToBoss = new Map();
    const active = bossConfig?.bosses || [];
    const arenas = bossConfig?.arenas || {};

    for (const key of active) {
      const arena = arenas[key];
      const map = String(arena?.map || '').trim();
      if (!map) continue;
      const catalog = bossCatalog.get(String(key)) || {};
      arenaToBoss.set(map, {
        key: String(key),
        name: String(catalog.name || key),
        image: catalog.img || catalog.icon || '',
        arena
      });
    }
  }

  function currentFieldInit() {
    return window.__poke?.ws?.['field-init'] || null;
  }

  function currentField() {
    return window.__poke?.ws?.field || null;
  }

  function currentSlug() {
    return String(
      currentFieldInit()?.slug
      || window.__poke?.lastSlug
      || window.__poke?.sess?.slug
      || ''
    ).trim();
  }

  function isBossField(field) {
    const team = field?.bossTeam;
    const idx = Number(field?.bossActiveIdx);
    return Array.isArray(team)
      && team.length > 0
      && Number.isInteger(idx)
      && idx >= 0
      && idx < team.length
      && Number.isFinite(Number(field?.bossLooktype));
  }

  function bossDescriptorFromContext(field = null) {
    const slug = currentSlug();
    const known = resolveBossForArena(slug);
    if (known) return known;

    return {
      key: '',
      name: slug ? `Boss · ${slug}` : 'Boss',
      image: '',
      arena: slug ? { map: slug } : null,
      looktype: finite(field?.bossLooktype)
    };
  }

  function updateCurrentRunBossIdentity() {
    if (!run) return false;
    const known = resolveBossForArena(run.arenaSlug || currentSlug());
    if (!known) return false;
    run.bossKey = known.key || run.bossKey;
    run.bossName = known.name || run.bossName;
    run.bossImage = known.image || run.bossImage;
    render();
    return true;
  }

  function getTeamSnapshot() {
    const list = window.__poke?.ws?.pokes?.list;
    const equipped = Array.isArray(list)
      ? list.filter(pokemon => pokemon?.team)
          .sort((a, b) => finite(a?.slot, 99) - finite(b?.slot, 99))
          .slice(0, 6)
      : [];

    return Array.from({ length: 6 }, (_, index) => {
      const pokemon = equipped[index] || {};
      return {
        index,
        id: String(pokemon.id || pokemon.instanceId || pokemon.uid || ''),
        speciesId: pokemon.speciesId ?? pokemon.pokeId ?? pokemon.pokemonId ?? null,
        name: String(pokemon.name || `Pokémon ${index + 1}`),
        level: finite(pokemon.level),
        damage: 0,
        hits: 0,
        maxRawHit: 0,
        hp: null,
        maxHp: null
      };
    });
  }

  function getBossMob(field) {
    if (!Array.isArray(field?.mobs) || !field.mobs.length) return null;
    const targeted = field.mobs.find(mob => Number(mob?.slot) === Number(field?.targetSlot));
    if (targeted?.maxHp) return targeted;
    return field.mobs.find(mob => finite(mob?.maxHp) > 0) || null;
  }

  function resolveBossForArena(slug) {
    return arenaToBoss.get(String(slug || '')) || null;
  }

  function makeRunKey(init) {
    return String(init?.huntKey || `${init?.slug || 'boss'}:${nowMs()}`);
  }

  function startRun(init, boss, firstField = null) {
    const fallbackKey = `boss:${String(init?.slug || currentSlug() || 'unknown')}:${finite(firstField?.serverNow, nowMs())}`;
    const key = String(init?.huntKey || fallbackKey);
    if (run?.key === key && !run?.outcome) return run;

    const slug = String(init?.slug || currentSlug() || boss?.arena?.map || '');
    run = {
      key,
      huntKey: String(init?.huntKey || ''),
      arenaSlug: slug,
      bossKey: boss?.key || '',
      bossName: boss?.name || (slug ? `Boss · ${slug}` : 'Boss'),
      bossImage: boss?.image || '',
      bossLooktype: finite(firstField?.bossLooktype),
      startedAt: nowMs(),
      finishedAt: 0,
      outcome: '',
      maxBossHp: 0,
      bossHp: 0,
      lastBossHp: null,
      healingReceived: 0,
      totalDamage: 0,
      activeIdx: null,
      lastServerNow: 0,
      team: getTeamSnapshot()
    };

    lastFieldSeq = null;
    panelClosedForRun = false;
    autoBossBusy = false;
    if (autoBossEnabled) {
      const selected = selectedAutoBoss();
      autoBossStatus = selected && selected.key === run.bossKey
        ? `Activo · combate en curso: ${run.bossName}`
        : `Activo · combate en curso: ${run.bossName} · después irá ${selected?.name || 'el Boss seleccionado'}`;
    }
    if (finishCloseTimer) clearTimeout(finishCloseTimer);
    finishCloseTimer = null;
    ensureUi();
    openPanel(true);
    render();
    heartbeat();

    console.info(`[Boss Damage Meter] Run iniciada: ${run.bossName} · ${run.key}`);
    return run;
  }

  function finishRun(outcome = 'won', finalField = null) {
    if (!run) return;
    if (run.outcome) {
      if (autoBossEnabled) queueNextAutoBossAfterLoot(finalField);
      return;
    }
    run.outcome = String(outcome || 'won');
    run.finishedAt = nowMs();
    run.bossLoot = Array.isArray(finalField?.bossLoot) ? finalField.bossLoot.map(item => ({ ...item })) : null;
    const finishedAt = run.finishedAt;
    render();
    heartbeat();
    if (finishCloseTimer) clearTimeout(finishCloseTimer);
    finishCloseTimer = null;

    const queued = autoBossEnabled && queueNextAutoBossAfterLoot(finalField);
    if (!autoBossEnabled && !queued) {
      finishCloseTimer = setTimeout(() => {
        finishCloseTimer = null;
        if (run?.outcome && run.finishedAt === finishedAt) closePanelForRun();
      }, FINISH_AUTO_CLOSE_MS);
    }
    console.info(`[Boss Damage Meter] Run finalizada: ${run.bossName} · daño ${run.totalDamage}/${run.maxBossHp}.`);
  }

  function processFieldInit(init) {
    if (!init || init.type && init.type !== 'field-init') return;
    const slug = String(init.slug || '');
    const key = String(init.huntKey || slug);
    if (!slug || !key) return;

    if (lastFieldInitKey === key && run?.huntKey === String(init.huntKey || '')) return;
    lastFieldInitKey = key;

    const boss = resolveBossForArena(slug);
    if (boss) startRun(init, boss);
  }

  function updateTeamFromBossState(field) {
    if (!run || !Array.isArray(field?.bossTeam)) return;
    field.bossTeam.slice(0, 6).forEach((state, index) => {
      const row = run.team[index];
      if (!row) return;
      row.hp = Number.isFinite(Number(state?.hp)) ? Math.max(0, Number(state.hp)) : row.hp;
      row.maxHp = Number.isFinite(Number(state?.maxHp)) ? Math.max(0, Number(state.maxHp)) : row.maxHp;
    });

    const idx = Number(field?.bossActiveIdx);
    if (Number.isInteger(idx) && idx >= 0 && idx < run.team.length && field?.heroName) {
      // bossActiveIdx + heroName es la relación más fiable observada para el Pokémon
      // que está en pantalla. Corrige cualquier discrepancia del orden de ws.pokes.list.
      run.team[idx].name = String(field.heroName);
    }
  }

  function resolveDamageOwner(previousActiveIdx, currentActiveIdx, switchDetected) {
    if (switchDetected && Number.isInteger(previousActiveIdx)) return previousActiveIdx;
    if (Number.isInteger(previousActiveIdx)) return previousActiveIdx;
    if (Number.isInteger(currentActiveIdx)) return currentActiveIdx;
    return null;
  }

  function processPlayerHits(field, ownerIdx) {
    if (!run || !Number.isInteger(ownerIdx) || !run.team[ownerIdx]) return;
    const hits = Array.isArray(field?.hits) ? field.hits : [];
    for (const hit of hits) {
      // En la auditoría, los golpes del jugador apuntan al slot 0 del Boss;
      // los ataques del Boss usan slot -1. No mezclamos daño recibido con daño hecho.
      if (finite(hit?.slot, -1) < 0) continue;
      const amount = Math.max(0, finite(hit?.amount));
      run.team[ownerIdx].hits += 1;
      run.team[ownerIdx].maxRawHit = Math.max(run.team[ownerIdx].maxRawHit, amount);
    }
  }

  function processField(field) {
    if (!field || field.type && field.type !== 'field') return;

    const seq = Number(field.seq);
    if (Number.isFinite(seq) && seq === lastFieldSeq) return;

    const bossField = isBossField(field);
    if (!bossField) {
      if (Number.isFinite(seq)) lastFieldSeq = seq;
      return;
    }

    const init = currentFieldInit();
    const descriptor = bossDescriptorFromContext(field);
    const incomingHuntKey = String(init?.huntKey || '');

    const sameLiveRun = Boolean(
      run
      && !run.outcome
      && (
        (incomingHuntKey && run.huntKey === incomingHuntKey)
        || (!incomingHuntKey && run.bossLooktype === finite(field?.bossLooktype))
      )
    );

    if (!sameLiveRun) {
      const finalCachedFrame = Boolean(field?.bossOutcome) || finite(getBossMob(field)?.hp) <= 0;
      if (run?.outcome && finalCachedFrame) {
        if (Number.isFinite(seq)) lastFieldSeq = seq;
        return;
      }
      startRun(init, descriptor, field);
    } else if (!run.bossKey) {
      updateCurrentRunBossIdentity();
    }

    if (run.outcome) {
      if (field?.bossOutcome) finishRun(field.bossOutcome, field);
      if (Number.isFinite(seq)) lastFieldSeq = seq;
      return;
    }

    const mob = getBossMob(field);
    if (!mob) {
      if (Number.isFinite(seq)) lastFieldSeq = seq;
      return;
    }

    const currentIdxRaw = Number(field?.bossActiveIdx);
    const currentIdx = Number.isInteger(currentIdxRaw) && currentIdxRaw >= 0 && currentIdxRaw < 6
      ? currentIdxRaw
      : null;
    const previousIdx = Number.isInteger(run.activeIdx) ? run.activeIdx : null;
    const switchDetected = Boolean(field?.bossSwitch)
      || (previousIdx !== null && currentIdx !== null && previousIdx !== currentIdx);

    const ownerIdx = resolveDamageOwner(previousIdx, currentIdx, switchDetected);

    updateTeamFromBossState(field);

    const hp = Math.max(0, finite(mob.hp));
    const maxHp = Math.max(0, finite(mob.maxHp));
    if (maxHp > 0) run.maxBossHp = Math.max(run.maxBossHp, maxHp);

    let effectiveDamage = 0;

    if (run.lastBossHp === null) {
      // El primer field del combate puede llegar después de uno o varios golpes.
      // La diferencia contra maxHp pertenece al primer Pokémon activo.
      effectiveDamage = Math.max(0, maxHp - hp);
    } else if (hp < run.lastBossHp) {
      effectiveDamage = run.lastBossHp - hp;
    } else if (hp > run.lastBossHp) {
      // Preparado para futuros bosses con curación/fases: el daño vuelve a contarse
      // cuando se quite esa vida otra vez, sin restar daño ya realizado.
      run.healingReceived += hp - run.lastBossHp;
    }

    if (effectiveDamage > 0) {
      const effectiveOwner = run.lastBossHp === null ? currentIdx : ownerIdx;
      if (Number.isInteger(effectiveOwner) && run.team[effectiveOwner]) {
        run.team[effectiveOwner].damage += effectiveDamage;
        run.totalDamage += effectiveDamage;
      }
    }

    processPlayerHits(field, run.lastBossHp === null ? currentIdx : ownerIdx);

    run.lastBossHp = hp;
    run.bossHp = hp;
    run.lastServerNow = finite(field.serverNow, nowMs());
    if (currentIdx !== null) run.activeIdx = currentIdx;
    if (Number.isFinite(seq)) lastFieldSeq = seq;

    if (field?.bossOutcome) finishRun(field.bossOutcome, field);
    render();
    heartbeat();
  }

  function processSocketPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.type === 'field-init') processFieldInit(payload);
    else if (payload.type === 'field') processField(payload);
    else if (payload.type === 'inventory') updateBronzeTokensFromItems(inventoryItemsFromPayload(payload));
  }

  function onSocketMessage(event) {
    try {
      if (typeof event?.data !== 'string') return;
      const payload = JSON.parse(event.data);
      processSocketPayload(payload);
    } catch {}
  }

  function attachSocket() {
    const next = window.__poke?.sock;
    if (!next || typeof next.addEventListener !== 'function') return false;
    if (next === socket) return true;

    if (socket && socketListener) {
      try { socket.removeEventListener('message', socketListener); } catch {}
    }

    socket = next;
    socketListener = onSocketMessage;

    try {
      socket.addEventListener('message', socketListener);
      return true;
    } catch {
      socket = null;
      socketListener = null;
      return false;
    }
  }

  function inspectCurrentGameState() {
    syncBronzeTokensFromCache(false);
    const init = currentFieldInit();
    if (init) processFieldInit(init);
    const field = currentField();
    if (field) processField(field);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}:not(.pg-ui-managed){
        position:fixed;z-index:100290;left:calc(100vw - 490px);top:80px;
        width:460px;height:auto;min-width:380px;min-height:210px;max-width:96vw;max-height:92vh;
        resize:both;overflow:auto;background:rgba(12,19,29,.86);color:#f2f6fb;
        backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);
        border:1px solid #40516a;border-radius:14px;box-shadow:0 18px 56px #000d;
        font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif
      }
      #${PANEL_ID}[hidden]{display:none!important}
      #${PANEL_ID}.minimized{height:auto!important;min-height:0!important;resize:none!important;overflow:hidden!important}
      #${PANEL_ID}.minimized .pg-bdm-body{display:none!important}
      #${PANEL_ID}.maximized{
        left:12px!important;top:12px!important;width:calc(100vw - 24px)!important;height:calc(100vh - 24px)!important;
        max-width:none!important;max-height:none!important;resize:none!important
      }
      #${PANEL_ID} .pg-bdm-head{
        position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;
        padding:10px 11px;background:rgba(17,27,41,.90);border-bottom:1px solid #40516a;
        cursor:grab;user-select:none;touch-action:none
      }
      #${PANEL_ID} .pg-bdm-head:active{cursor:grabbing}
      #${PANEL_ID} .pg-bdm-title{font-weight:900;font-size:14px;white-space:nowrap}
      #${PANEL_ID} .pg-bdm-boss{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#aebbd0;font-size:11px;margin-right:auto}
      #${PANEL_ID} button{
        border:1px solid #52657f;background:rgba(24,36,56,.88);color:#f4f8ff;border-radius:7px;
        min-width:30px;height:28px;padding:0 7px;font:800 12px system-ui;cursor:pointer
      }
      #${PANEL_ID} button:hover{background:#263750}
      #${PANEL_ID} .pg-bdm-body{padding:11px}
      #${PANEL_ID} .pg-bdm-status{
        display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;
        font-size:10px;color:#b7c3d3
      }
      #${PANEL_ID} .pg-bdm-state{
        display:inline-flex;align-items:center;gap:5px;padding:3px 7px;border-radius:999px;
        border:1px solid #785d26;background:#2a2110;color:#ffdc84;font-weight:900
      }
      #${PANEL_ID} .pg-bdm-state.won{border-color:#347649;background:#10271a;color:#9aefb0}
      #${PANEL_ID} .pg-bdm-hp{
        position:relative;height:18px;overflow:hidden;border-radius:999px;background:#241318;
        border:1px solid #55313a;margin-bottom:9px
      }
      #${PANEL_ID} .pg-bdm-hp-fill{
        position:absolute;inset:0 auto 0 0;width:0%;background:linear-gradient(90deg,#7e2731,#b63b46);
        transition:width .12s linear
      }
      #${PANEL_ID} .pg-bdm-hp-label{
        position:relative;z-index:2;height:100%;display:grid;place-items:center;
        font-size:10px;font-weight:900;text-shadow:0 1px 2px #000
      }
      #${PANEL_ID} .pg-bdm-summary{
        display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:10px
      }
      #${PANEL_ID} .pg-bdm-summary>div{
        padding:8px;border:1px solid #34465d;border-radius:9px;background:rgba(16,25,35,var(--pg-ui-card-opacity,.78));text-align:center
      }
      #${PANEL_ID} .pg-bdm-summary b{display:block;font-size:13px;color:#f3f7fc}
      #${PANEL_ID} .pg-bdm-summary small{display:block;margin-top:2px;color:#8190a5;font-size:9px}
      #${PANEL_ID} .pg-bdm-table-head,
      #${PANEL_ID} .pg-bdm-row{
        display:grid;grid-template-columns:34px minmax(125px,1fr) 92px 64px 48px 72px;
        gap:7px;align-items:center
      }
      #${PANEL_ID} .pg-bdm-table-head{
        padding:5px 7px;color:#a9b5c5;font-size:8.5px;font-weight:900;text-transform:uppercase
      }
      #${PANEL_ID} .pg-bdm-table-head>span:not(:nth-child(2)){text-align:right}
      #${PANEL_ID} .pg-bdm-row{
        position:relative;overflow:hidden;padding:8px 7px;margin-bottom:5px;
        border:1px solid #34465d;border-radius:9px;background:rgba(16,25,35,var(--pg-ui-card-opacity,.80));font-size:10px
      }
      #${PANEL_ID} .pg-bdm-row.active{border-color:#4f83b9;box-shadow:inset 0 0 0 1px #315b83}
      #${PANEL_ID} .pg-bdm-row.ko{opacity:.72}
      #${PANEL_ID} .pg-bdm-row-bg{
        position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#2f639477,#24466a28 72%,transparent);
        pointer-events:none;transition:width .12s linear
      }
      #${PANEL_ID} .pg-bdm-row>*:not(.pg-bdm-row-bg){position:relative;z-index:1}
      #${PANEL_ID} .pg-bdm-rank{text-align:center;font-weight:950;font-size:13px;color:#f0c968}
      #${PANEL_ID} .pg-bdm-name{min-width:0}
      #${PANEL_ID} .pg-bdm-name b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
      #${PANEL_ID} .pg-bdm-name small{display:block;margin-top:2px;color:#a5b2c4;font-size:8.5px}
      #${PANEL_ID} .pg-bdm-num{text-align:right;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .pg-bdm-damage{font-weight:900;color:#75baff}
      #${PANEL_ID} .pg-bdm-auto{
        margin:0 0 10px;padding:9px;border:1px solid #34465d;border-radius:10px;
        background:rgba(14,23,34,var(--pg-ui-card-opacity,.76))
      }
      #${PANEL_ID} .pg-bdm-auto.on{border-color:#347649;box-shadow:inset 0 0 0 1px #1d4b2d}
      #${PANEL_ID} .pg-bdm-auto-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px;font-size:11px}
      #${PANEL_ID} .pg-bdm-auto-head>b{color:#e7edf6;font-size:12px}
      #${PANEL_ID} .pg-bdm-token{display:inline-flex;align-items:center;gap:5px;padding:3px 7px;border:1px solid #785d26;border-radius:999px;background:#2a2110;color:#ffdc84;white-space:nowrap}
      #${PANEL_ID} .pg-bdm-token img{width:15px;height:15px;object-fit:contain}
      #${PANEL_ID} .pg-bdm-auto-controls{display:grid;grid-template-columns:minmax(140px,1fr) auto 32px;gap:6px;align-items:center}
      #${PANEL_ID} .pg-bdm-auto select{
        width:100%;min-width:0;height:30px;padding:0 8px;border:1px solid #52657f;border-radius:7px;
        background:rgba(11,20,31,.94);color:#f3f6fa;font:700 11px system-ui
      }
      #${PANEL_ID} [data-auto-boss-toggle].start{border-color:#347649;background:#163522;color:#a7f0bc}
      #${PANEL_ID} [data-auto-boss-toggle].stop{border-color:#91444d;background:#401a20;color:#ffc1c7}
      #${PANEL_ID} .pg-bdm-auto-status{margin-top:6px;min-height:13px;color:#91a3b8;font-size:9px;line-height:1.35}
      #${PANEL_ID} .pg-bdm-empty{padding:18px 12px 22px;text-align:center;color:#8e9cb0;font-size:11px}
      @media(max-width:650px){
        #${PANEL_ID}{left:2vw;top:60px;width:96vw;min-width:0}
        #${PANEL_ID} .pg-bdm-table-head,#${PANEL_ID} .pg-bdm-row{
          grid-template-columns:28px minmax(110px,1fr) 82px 58px
        }
        #${PANEL_ID} .pg-bdm-hide-mobile{display:none}
        #${PANEL_ID} .pg-bdm-summary{grid-template-columns:1fr}
        #${PANEL_ID} .pg-bdm-auto-controls{grid-template-columns:1fr auto 32px}
      }
    `;
    document.head.appendChild(style);
  }

  function createBridgeUiWindow(layout = null, shouldOpen = false) {
    const bridgeUi = window.__pokeGridScripts?.ui;
    if (!bridgeUi?.createWindow) return false;
    if (usingBridgeUi && uiWindow?.panel?.isConnected) return true;

    const existing = document.getElementById(PANEL_ID);
    const fallback = existing && !existing.classList.contains('pg-ui-managed') ? existing : null;
    const originalId = fallback?.id || '';

    if (fallback) fallback.id = `${PANEL_ID}-fallback-upgrading`;

    try {
      uiWindow = bridgeUi.createWindow({
        id: 'boss-damage-meter',
        domId: PANEL_ID,
        title: '⚔️ Boss Damage Meter',
        subtitle: run?.bossName || 'Esperando Boss',
        width: layout?.width || 460,
        height: layout?.height || undefined,
        left: layout?.left,
        top: layout?.top,
        minWidth: 380,
        minHeight: 210,
        resizable: true,
        movable: true,
        minimizable: true,
        maximizable: true,
        closable: true,
        rememberLayout: true,
        defaultOpacity: 86,
        bodyClass: 'pg-bdm-body'
      });
      uiWindow.body.setAttribute('data-body', '');
      uiWindow.subtitleElement.setAttribute('data-boss-title', '');
      usingBridgeUi = true;
      uiWindow.panel.addEventListener('click', event => {
        const close = event.target.closest?.('.pg-ui-header .pg-ui-button');
        if (close?.title === 'Cerrar') panelClosedForRun = true;
      }, true);

      if (fallback) fallback.remove();
      if (shouldOpen) uiWindow.open();

      render();
      console.info('[Boss Damage Meter] Interfaz actualizada dinámicamente a Bridge UI Core.');
      return true;
    } catch (error) {
      if (fallback && fallback.isConnected) fallback.id = originalId;
      uiWindow = null;
      usingBridgeUi = false;
      console.warn('[Boss Damage Meter] UI Core todavía no está disponible; se mantiene la interfaz propia.', error);
      return false;
    }
  }

  function upgradeUiCoreIfAvailable() {
    if (usingBridgeUi && uiWindow?.panel?.isConnected) return true;
    const bridgeUi = window.__pokeGridScripts?.ui;
    if (!bridgeUi?.createWindow) return false;

    const existing = document.getElementById(PANEL_ID);
    if (existing?.classList.contains('pg-ui-managed')) {
      uiWindow = bridgeUi.getWindow?.('boss-damage-meter') || null;
      usingBridgeUi = Boolean(uiWindow);
      return usingBridgeUi;
    }

    let layout = null;
    let shouldOpen = false;
    if (existing) {
      const rect = existing.getBoundingClientRect();
      layout = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };
      shouldOpen = !existing.hidden;
    }

    return createBridgeUiWindow(layout, shouldOpen);
  }

  function ensureFallbackUi() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) return existing;

    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.innerHTML = `
      <div class="pg-bdm-head">
        <span class="pg-bdm-title">⚔️ Boss Damage Meter</span>
        <span class="pg-bdm-boss" data-boss-title>Esperando Boss</span>
        <button type="button" data-minimize title="Minimizar">—</button>
        <button type="button" data-maximize title="Maximizar">□</button>
        <button type="button" data-close title="Cerrar">×</button>
      </div>
      <div class="pg-bdm-body" data-body></div>
    `;
    document.body.appendChild(panel);

    restoreLayout(panel);
    installPanelInteractions(panel);

    panel.querySelector('[data-minimize]')?.addEventListener('click', event => {
      event.preventDefault();
      panel.classList.toggle('minimized');
      event.currentTarget.textContent = panel.classList.contains('minimized') ? '▾' : '—';
      event.currentTarget.title = panel.classList.contains('minimized') ? 'Desplegar' : 'Minimizar';
    });

    panel.querySelector('[data-maximize]')?.addEventListener('click', event => {
      event.preventDefault();
      toggleMaximize(panel);
    });
    panel.querySelector('[data-close]')?.addEventListener('click', event => {
      event.preventDefault();
      closePanelForRun();
    });
    return panel;
  }

  function ensureUi() {
    ensureStyles();

    if (upgradeUiCoreIfAvailable()) return;
    ensureFallbackUi();
  }
  function closePanelForRun() {
    const panel = document.getElementById(PANEL_ID);
    if (usingBridgeUi && uiWindow) uiWindow.close();
    else if (panel) panel.hidden = true;
    panelClosedForRun = true;
    return true;
  }

  function openPanel(force = false) {
    ensureUi();
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    if (!force && panelClosedForRun) return;
    if (usingBridgeUi && uiWindow) uiWindow.open();
    else panel.hidden = false;
    render();
  }

  function restoreLayout(panel) {
    const layout = readJson(LAYOUT_KEY, null);
    if (!layout || !['left','top','width','height'].every(key => Number.isFinite(Number(layout[key])))) return;
    panel.style.left = `${layout.left}px`;
    panel.style.top = `${layout.top}px`;
    panel.style.width = `${layout.width}px`;
    panel.style.height = `${layout.height}px`;
  }

  function saveLayout(panel) {
    if (!panel || panel.hidden || panel.classList.contains('maximized') || panel.classList.contains('minimized')) return;
    const rect = panel.getBoundingClientRect();
    writeJson(LAYOUT_KEY, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    });
  }

  function clampPanel(panel) {
    if (!panel || panel.classList.contains('maximized')) return;
    const rect = panel.getBoundingClientRect();
    const left = clamp(rect.left, 4, Math.max(4, innerWidth - Math.min(rect.width, innerWidth - 8) - 4));
    const top = clamp(rect.top, 4, Math.max(4, innerHeight - Math.min(rect.height, innerHeight - 8) - 4));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function toggleMaximize(panel) {
    maximized = !maximized;
    const button = panel.querySelector('[data-maximize]');
    if (maximized) {
      const rect = panel.getBoundingClientRect();
      layoutBeforeMaximize = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      panel.classList.add('maximized');
      panel.classList.remove('minimized');
      if (button) {
        button.textContent = '❐';
        button.title = 'Restaurar';
      }
    } else {
      panel.classList.remove('maximized');
      const layout = layoutBeforeMaximize || readJson(LAYOUT_KEY, null);
      if (layout) {
        panel.style.left = `${layout.left}px`;
        panel.style.top = `${layout.top}px`;
        panel.style.width = `${layout.width}px`;
        panel.style.height = `${layout.height}px`;
      }
      if (button) {
        button.textContent = '□';
        button.title = 'Maximizar';
      }
      clampPanel(panel);
      saveLayout(panel);
    }
  }

  function installPanelInteractions(panel) {
    const head = panel.querySelector('.pg-bdm-head');
    if (!head) return;

    let drag = null;

    head.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      if (panel.classList.contains('maximized')) return;

      const rect = panel.getBoundingClientRect();
      drag = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top
      };
      try { head.setPointerCapture(event.pointerId); } catch {}
    });

    head.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const x = drag.left + event.clientX - drag.startX;
      const y = drag.top + event.clientY - drag.startY;
      panel.style.left = `${clamp(x, 4, Math.max(4, innerWidth - panel.offsetWidth - 4))}px`;
      panel.style.top = `${clamp(y, 4, Math.max(4, innerHeight - panel.offsetHeight - 4))}px`;
      event.preventDefault();
    });

    const finish = event => {
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
      drag = null;
      clampPanel(panel);
      saveLayout(panel);
    };

    head.addEventListener('pointerup', finish);
    head.addEventListener('pointercancel', finish);

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => saveLayout(panel));
      observer.observe(panel);
      panel.__pgBdmResizeObserver = observer;
    }

    window.addEventListener('resize', () => clampPanel(panel));
  }

  function elapsedText() {
    if (!run) return '0:00';
    const end = run.finishedAt || nowMs();
    const seconds = Math.max(0, Math.floor((end - run.startedAt) / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
  }

  function rankLabel(index) {
    return index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : String(index + 1);
  }

  function render() {
    ensureUi();
    const panel = document.getElementById(PANEL_ID);
    const body = panel?.querySelector('[data-body]');
    const title = panel?.querySelector('[data-boss-title]');
    if (!panel || !body) return;
    installAutoBossPanelEvents(panel);
    ensureAutoBossSelection();

    if (!run) {
      if (title) title.textContent = 'Esperando Boss';
      body.innerHTML = `${autoBossControlsHtml()}<div class="pg-bdm-empty">El medidor se abrirá automáticamente al entrar en una arena de Boss activa.<br>También puedes elegir un Boss arriba y activar la repetición automática.</div>`;
      return;
    }

    if (title) title.textContent = run.bossName;

    const maxHp = Math.max(0, run.maxBossHp);
    const hp = Math.max(0, run.bossHp);
    const hpPct = maxHp ? clamp(hp / maxHp * 100, 0, 100) : 0;
    const damagePct = maxHp ? run.totalDamage / maxHp * 100 : 0;

    const rows = run.team
      .map(row => ({ ...row }))
      .sort((a, b) => b.damage - a.damage || a.index - b.index);
    const leaderDamage = Math.max(0, finite(rows[0]?.damage));

    body.innerHTML = `
      ${autoBossControlsHtml()}
      <div class="pg-bdm-status">
        <span class="pg-bdm-state ${run.outcome ? 'won' : ''}">${run.outcome ? '🏆 VICTORIA' : '⚔️ EN COMBATE'}</span>
        <span>Top 6 en tiempo real · barras relativas al líder · sin acumulación histórica</span>
      </div>

      <div class="pg-bdm-hp">
        <div class="pg-bdm-hp-fill" style="width:${hpPct.toFixed(3)}%"></div>
        <div class="pg-bdm-hp-label">${fmt(hp)} / ${fmt(maxHp)} HP · ${fmt(hpPct, 1)}%</div>
      </div>

      <div class="pg-bdm-summary">
        <div><b>${fmt(run.totalDamage)}</b><small>Daño efectivo total</small></div>
        <div><b>${fmt(damagePct, 1)}%</b><small>Vida máxima dañada</small></div>
        <div><b>${elapsedText()}</b><small>Duración de la run</small></div>
      </div>

      <div class="pg-bdm-table-head">
        <span>#</span><span>Pokémon</span><span>Daño</span><span>% Boss</span>
        <span class="pg-bdm-hide-mobile">Hits</span><span class="pg-bdm-hide-mobile">Golpe máx.</span>
      </div>

      <div>
        ${rows.map((row, rank) => {
          const pct = maxHp ? row.damage / maxHp * 100 : 0;
          const active = !run.outcome && row.index === run.activeIdx;
          const ko = row.hp !== null && row.hp <= 0;
          const bar = leaderDamage > 0 ? clamp(row.damage / leaderDamage * 100, 0, 100) : 0;
          return `
            <div class="pg-bdm-row ${active ? 'active' : ''} ${ko ? 'ko' : ''}">
              <div class="pg-bdm-row-bg" style="width:${bar.toFixed(3)}%"></div>
              <div class="pg-bdm-rank">${rankLabel(rank)}</div>
              <div class="pg-bdm-name">
                <b>${active ? '⚔️ ' : ''}${esc(row.name)}</b>
                <small>${row.level ? `Nv. ${fmt(row.level)} · ` : ''}${ko ? 'KO' : row.hp !== null && row.maxHp ? `${fmt(row.hp)} / ${fmt(row.maxHp)} HP` : `Slot ${row.index + 1}`}</small>
              </div>
              <div class="pg-bdm-num pg-bdm-damage">${fmt(row.damage)}</div>
              <div class="pg-bdm-num">${fmt(pct, 2)}%</div>
              <div class="pg-bdm-num pg-bdm-hide-mobile">${fmt(row.hits)}</div>
              <div class="pg-bdm-num pg-bdm-hide-mobile">${row.maxRawHit ? fmt(row.maxRawHit) : '—'}</div>
            </div>`;
        }).join('')}
      </div>
      ${run.healingReceived > 0 ? `<div style="margin-top:7px;color:#8fa0b6;font-size:9px;text-align:right">Curación/fase detectada del Boss: +${fmt(run.healingReceived)} HP. El daño repetido se contabiliza de nuevo.</div>` : ''}
    `;
  }

  function state() {
    return {
      version: VERSION,
      ui: {
        bridgeUiAvailable: Boolean(window.__pokeGridScripts?.ui?.createWindow),
        usingBridgeUi,
        opacity: usingBridgeUi && uiWindow ? uiWindow.getOpacity() : null
      },
      detection: {
        directBossField: true,
        bossDefinitionsReady: arenaToBoss.size > 0,
        currentSlug: currentSlug(),
        currentFieldIsBoss: isBossField(currentField())
      },
      activeBossArenas: [...arenaToBoss.entries()].map(([map, boss]) => ({
        map,
        key: boss.key,
        name: boss.name
      })),
      autoBoss: {
        enabled: autoBossEnabled,
        selectedBossKey: selectedAutoBossKey,
        selectedBossName: selectedAutoBoss()?.name || '',
        bronzeTokens,
        status: autoBossStatus,
        victories: autoBossRuns,
        busy: autoBossBusy
      },
      run: run ? {
        key: run.key,
        bossKey: run.bossKey,
        bossName: run.bossName,
        arenaSlug: run.arenaSlug,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        outcome: run.outcome,
        maxBossHp: run.maxBossHp,
        bossHp: run.bossHp,
        totalDamage: run.totalDamage,
        healingReceived: run.healingReceived,
        activeIdx: run.activeIdx,
        team: run.team.map(row => ({ ...row }))
      } : null
    };
  }

  function heartbeat() {
    if (!healthClient) return;
    try {
      const active = Boolean(run && !run.outcome);
      healthClient.heartbeat({
        status: active ? 'ok' : run?.outcome ? 'ok' : 'waiting',
        statusText: active
          ? `${run.bossName}: ${fmt(run.totalDamage)} daño efectivo.`
          : run?.outcome
            ? `${run.bossName}: run ganada con ${fmt(run.totalDamage)} daño.`
            : 'Esperando entrada a un Boss.',
        dependencies: {
          gameState: { ok: Boolean(window.__poke?.ws), checkedAt: nowMs() },
          bossDefinitions: { ok: arenaToBoss.size > 0, checkedAt: nowMs() }
        },
        metrics: {
          active,
          boss: run?.bossName || '',
          bossHp: finite(run?.bossHp),
          bossMaxHp: finite(run?.maxBossHp),
          totalDamage: finite(run?.totalDamage),
          teamRows: run?.team?.length || 0,
          autoBoss: autoBossEnabled,
          autoBossKey: selectedAutoBossKey,
          bronzeTokens: bronzeTokens ?? -1,
          autoBossVictories: autoBossRuns,
          uiCore: usingBridgeUi,
          opacity: usingBridgeUi && uiWindow ? uiWindow.getOpacity() : 86
        }
      });
    } catch {}
  }

  function connectHealth() {
    const bridge = window.__pokeGridScripts;
    if (!bridge?.register || healthClient) return Boolean(healthClient);

    try {
      healthClient = bridge.register({
        id: 'boss-damage-meter',
        name: 'Boss Damage Meter',
        version: VERSION,
        description: 'Mide el daño efectivo de cada Pokémon durante una run de Boss.',
        icon: '⚔️',
        category: 'gameplay-analysis',
        status: 'waiting',
        statusText: 'Esperando entrada a un Boss.',
        staleAfterMs: 45000,
        capabilities: ['boss-auto-detection', 'per-run-damage', 'team-top6', 'effective-hp-delta', 'bronze-token-counter', 'manual-auto-boss-toggle', 'native-ui-boss-repeat', 'bridge-ui-core', 'persistent-opacity']
      });
      healthClient.registerCommand('open', () => {
        panelClosedForRun = false;
        openPanel(true);
        requestInventoryRefresh(true);
        return { opened: true };
      }, { label: 'Abrir Damage Meter' });
      healthClient.registerCommand('get-state', () => state(), { label: 'Obtener estado' });
      heartbeat();
      return true;
    } catch {
      healthClient = null;
      return false;
    }
  }

  window.__PGBossDamageMeter = {
    version: VERSION,
    getState: state,
    open: () => {
      panelClosedForRun = false;
      openPanel(true);
      requestInventoryRefresh(true);
      return state();
    },
    close: () => closePanelForRun(),
    refreshBosses: refreshBossDefinitions,
    refreshBronzeTokens: () => requestInventoryRefresh(true),
    setAutoBoss: (enabled, bossKey = selectedAutoBossKey) => {
      if (bossKey) {
        selectedAutoBossKey = String(bossKey);
        persistAutoBossSelection();
      }
      return setAutoBossEnabled(Boolean(enabled));
    },
    processPayload: payload => processSocketPayload(payload)
  };

  ensureUi();
  attachSocket();
  syncBronzeTokensFromCache(false);
  setTimeout(() => requestInventoryRefresh(true), 500);
  refreshBossDefinitions().catch(() => {});
  inspectCurrentGameState();
  connectHealth();

  let bootBossRefreshes = 0;
  const bootBossTimer = setInterval(() => {
    bootBossRefreshes += 1;
    refreshBossDefinitions().catch(() => {});
    if (arenaToBoss.size > 0 || bootBossRefreshes >= BOSS_BOOT_REFRESH_COUNT) clearInterval(bootBossTimer);
  }, BOSS_BOOT_REFRESH_MS);

  setInterval(() => {
    attachSocket();
    upgradeUiCoreIfAvailable();
    inspectCurrentGameState();
    connectHealth();
    if (autoBossEnabled && nowMs() - lastInventoryRequestAt >= 5000) requestInventoryRefresh();
    autoBossTick();
  }, SOCKET_REATTACH_MS);

  setInterval(() => {
    const field = currentField();
    if (field) processField(field);
  }, POLL_MS);

  setInterval(() => refreshBossDefinitions().catch(() => {}), BOSS_REFRESH_MS);
  setInterval(heartbeat, 10000);

  console.info('[Boss Damage Meter] v1.0.7 cargado · contador Bronze + Auto Boss opcional desde la interfaz · Bridge UI Core compatible.');
})();

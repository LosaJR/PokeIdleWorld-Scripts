// ==UserScript==
// @name         PokeGrid - Hunt Intelligence
// @namespace    ivan-pokegrid-tools
// @version      1.1.18
// @description  Recomendador, No capturados, Item Finder, supervisor e histórico unificados con VIP y bonus diario normalizados.
// @match        https://poke.idleworld.online/*
// @grant        none
// @run-at       document-idle
// @updateURL     https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-hunt-intelligence.meta.js
// @downloadURL   https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-hunt-intelligence.user.js
// ==/UserScript==

(() => {
  'use strict';
  if (window.__pgHuntIntelligenceCoreV1118) return;
  window.__pgHuntIntelligenceCoreV1118 = true;

  const NS = 'pg-best-hunt-v1';
  const CFG_KEY = `${NS}:config`;
  const HISTORY_KEY = `${NS}:history`;
  const PANEL_ID = `${NS}-panel`;
  const BUTTON_ID = `${NS}-button`;
  const STYLE_ID = `${NS}-style`;

  const TYPE_CHART = {
    normal: { rock: 0.5, ghost: 0, steel: 0.5 },
    fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
    electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
    ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
    fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
    poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
    ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
    flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
    bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
    ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
    dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
    steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
    fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
  };

  const DEFAULT_CFG = {
    mode: 'xp',
    xpWeight: 40,
    lootWeight: 30,
    rareWeight: 0,
    goldWeight: 30,
    topN: 8,
    autoOpen: true
  };

  let config = loadJson(CFG_KEY, DEFAULT_CFG);
  let history = loadJson(HISTORY_KEY, {});
  let dataCache = null;
  let dataCacheAt = 0;
  let busy = false;

  function loadJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed && typeof parsed === 'object' ? Object.assign(Array.isArray(fallback) ? [] : {}, fallback, parsed) : structuredCloneSafe(fallback);
    } catch {
      return structuredCloneSafe(fallback);
    }
  }

  function structuredCloneSafe(value) {
    try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
  }

  function saveState() {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(config));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.warn('[Mejor Hunt] No se pudo guardar la configuración:', error);
    }
  }

  function norm(value) {
    return String(value ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[_-]+/g, ' ')
      .replace(/\[[^\]]*]/g, '').replace(/\([^)]*\)/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function finite(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  function pick(obj, paths, fallback = 0) {
    for (const path of paths) {
      const parts = path.split('.');
      let value = obj;
      for (const part of parts) value = value?.[part];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function fmt(value, decimals = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-ES', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  }

  function normalizeChance(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    if (n > 1) return n / 100;
    return n;
  }

  function effectiveness(moveType, defenderTypes) {
    const attack = norm(moveType).replace(/ /g, '');
    if (!attack || !TYPE_CHART[attack]) return 1;
    return defenderTypes.filter(Boolean).reduce((total, type) => {
      const defend = norm(type).replace(/ /g, '');
      return total * (TYPE_CHART[attack][defend] ?? 1);
    }, 1);
  }

  function getPokeState() {
    return window.__poke || null;
  }

  function getLeadPokemon() {
    const list = getPokeState()?.ws?.pokes?.list;
    if (!Array.isArray(list)) return null;
    return list.filter(p => p?.team)
      .sort((a, b) => finite(a.slot, 99) - finite(b.slot, 99))[0] || null;
  }

  function getCurrentHuntSlug() {
    const p = getPokeState();
    return p?.ws?.['field-init']?.slug || p?.lastSlug || p?.sess?.slug || '';
  }

  function getCharacter() {
    return getPokeState()?.api?.['/api/characters/me']?.character || {};
  }

  function getAutoCatchInfo(itemsById) {
    const p = getPokeState();
    const ch = getCharacter();
    const balls = p?.ws?.balls;
    const id = ch.autoCatchBallId || p?.ws?.['catch-result']?.ballId;
    const ball = Array.isArray(balls?.catalog) ? balls.catalog.find(x => String(x.id) === String(id)) : null;
    return {
      active: Boolean(ch.autoCatchBallId),
      ballId: id || null,
      ballPrice: finite(ball?.priceGold, ball?.price, itemsById?.[id]?.npcPrice, 0)
    };
  }

  async function loadData(force = false) {
    if (!force && dataCache && Date.now() - dataCacheAt < 5 * 60_000) return dataCache;
    const [markersDoc, creaturesDoc, itemsDoc] = await Promise.all([
      fetch('/api/game/map-markers').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/game/creatures.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/game/items.json').then(r => r.ok ? r.json() : null).catch(() => null)
    ]);

    const creatures = Array.isArray(creaturesDoc?.creatures) ? creaturesDoc.creatures : [];
    const items = Array.isArray(itemsDoc?.items) ? itemsDoc.items : [];
    const markers = Array.isArray(markersDoc)
      ? markersDoc
      : (markersDoc?.markers || markersDoc?.hunts || markersDoc?.data || []);

    const creaturesByName = new Map();
    const creaturesById = new Map();
    for (const creature of creatures) {
      if (!creature) continue;
      if (creature.name) creaturesByName.set(norm(creature.name), creature);
      const id = pick(creature, ['pokeId', 'speciesId', 'id'], null);
      if (id !== null) creaturesById.set(String(id), creature);
    }

    const itemsById = {};
    const itemsByName = new Map();
    for (const item of items) {
      if (!item) continue;
      if (item.id !== undefined) itemsById[item.id] = item;
      if (item.name) itemsByName.set(norm(item.name), item);
    }

    const hunts = [];
    const seen = new Set();
    for (const marker of Array.isArray(markers) ? markers : []) {
      const rawName = pick(marker, ['hunt', 'pokemonName', 'creatureName', 'name', 'title', 'slug'], '');
      if (!rawName) continue;
      const creature = resolveCreature(rawName, marker, creaturesByName, creaturesById);
      const displayName = String(rawName).replace(/[_-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()).trim();
      const key = `${norm(displayName)}|${finite(marker.level, marker.lvl, marker.minLevel, creature?.huntLevel)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hunts.push({ marker, creature, name: displayName, key: norm(displayName), slug: marker.slug || marker.hunt || rawName });
    }

    dataCache = { hunts, creatures, creaturesByName, creaturesById, items, itemsById, itemsByName };
    dataCacheAt = Date.now();
    return dataCache;
  }

  function resolveCreature(rawName, marker, byName, byId) {
    const directId = pick(marker, ['pokeId', 'pokemonId', 'speciesId', 'creatureId'], null);
    if (directId !== null && byId.has(String(directId))) return byId.get(String(directId));
    const key = norm(rawName);
    if (byName.has(key)) return byName.get(key);
    const words = key.split(' ');
    for (let i = 0; i < words.length; i++) {
      const suffix = words.slice(i).join(' ');
      if (byName.has(suffix)) return byName.get(suffix);
    }
    for (const [name, creature] of byName) {
      if (key.includes(name) || name.includes(key)) return creature;
    }
    return null;
  }

  function creatureTypes(creature) {
    const raw = pick(creature, ['types'], null);
    if (Array.isArray(raw)) return raw.map(x => typeof x === 'string' ? x : x?.name || x?.type).filter(Boolean).slice(0, 2);
    return [pick(creature, ['type1', 'type'], ''), pick(creature, ['type2'], '')].filter(Boolean);
  }

  function creatureStat(creature, stat, fallback = 1) {
    const aliases = {
      hp: ['hp', 'baseHp', 'stats.hp', 'baseStats.hp', 'attributes.hp'],
      atk: ['atk', 'attack', 'baseAtk', 'baseAttack', 'stats.atk', 'stats.attack', 'baseStats.atk', 'baseStats.attack'],
      def: ['def', 'defense', 'baseDef', 'baseDefense', 'stats.def', 'stats.defense', 'baseStats.def', 'baseStats.defense'],
      spa: ['spa', 'spAttack', 'specialAttack', 'baseSpa', 'stats.spa', 'stats.spAttack', 'stats.specialAttack', 'baseStats.spa'],
      spd: ['spd', 'spDefense', 'specialDefense', 'baseSpd', 'stats.spd', 'stats.spDefense', 'stats.specialDefense', 'baseStats.spd'],
      vel: ['vel', 'speed', 'baseSpeed', 'stats.vel', 'stats.speed', 'baseStats.speed']
    };
    return Math.max(1, finite(pick(creature, aliases[stat] || [stat], fallback), fallback));
  }

  function pokemonStat(pokemon, stat, fallback = 1) {
    const aliases = {
      hp: ['hpMax', 'maxHp', 'stats.hp', 'attributes.hp', 'hp'],
      atk: ['atk', 'attack', 'stats.atk', 'stats.attack', 'attributes.atk'],
      def: ['def', 'defense', 'stats.def', 'stats.defense', 'attributes.def'],
      spa: ['spa', 'spAttack', 'specialAttack', 'stats.spa', 'stats.spAttack', 'attributes.spa'],
      spd: ['spd', 'spDefense', 'specialDefense', 'stats.spd', 'stats.spDefense', 'attributes.spd'],
      vel: ['vel', 'speed', 'stats.vel', 'stats.speed', 'attributes.vel']
    };
    return Math.max(1, finite(pick(pokemon, aliases[stat] || [stat], fallback), fallback));
  }

  function extractMoves(lead, leadSpecies) {
    const candidates = [lead?.moves, lead?.attacks, lead?.skills, leadSpecies?.moves, leadSpecies?.attacks, leadSpecies?.skills];
    let rawMoves = candidates.find(Array.isArray) || [];
    const level = finite(lead?.level, 1);
    const moves = rawMoves.map(raw => {
      if (typeof raw === 'string') return { name: raw, power: 50, type: '', category: '' };
      if (!raw || typeof raw !== 'object') return null;
      const required = finite(raw.level, raw.requiredLevel, raw.learnLevel, raw.unlockLevel, 0);
      if (required && required > level) return null;
      return {
        name: pick(raw, ['name', 'moveName', 'move', 'id'], 'Golpe'),
        power: Math.max(1, finite(raw.power, raw.basePower, raw.damage, raw.dmg, 50)),
        type: pick(raw, ['type', 'element'], ''),
        category: norm(pick(raw, ['category', 'damageClass', 'class'], ''))
      };
    }).filter(Boolean);
    return moves;
  }

  function offenseProfile(lead, leadSpecies, targetTypes) {
    const leadTypes = [lead?.type1, lead?.type2, ...(Array.isArray(lead?.types) ? lead.types : [])].filter(Boolean);
    const atk = pokemonStat(lead, 'atk', creatureStat(leadSpecies, 'atk', 50));
    const spa = pokemonStat(lead, 'spa', creatureStat(leadSpecies, 'spa', atk));
    const moves = extractMoves(lead, leadSpecies);
    const candidates = moves.length ? moves : leadTypes.map(type => ({ name: type, power: 50, type, category: '' }));
    let best = { index: Math.max(atk, spa) * 50, eff: 1, move: 'Ataque básico', type: leadTypes[0] || '' };
    for (const move of candidates) {
      const type = move.type || leadTypes[0] || '';
      const special = /special|especial|spa/.test(move.category);
      const offensiveStat = special ? spa : (/physical|fisic|atk/.test(move.category) ? atk : Math.max(atk, spa));
      const stab = leadTypes.some(t => norm(t) === norm(type)) ? 1.5 : 1;
      const eff = effectiveness(type, targetTypes);
      const index = offensiveStat * move.power * stab * eff;
      if (index > best.index) best = { index, eff, move: move.name, type };
    }
    return best;
  }

  function huntDifficulty(hunt, lead, leadSpecies) {
    const creature = hunt.creature || {};
    const targetTypes = creatureTypes(creature);
    const level = Math.max(1, finite(hunt.marker?.level, hunt.marker?.lvl, hunt.marker?.minLevel, creature.huntLevel, creature.level, 1));
    const hpBase = creatureStat(creature, 'hp', 50);
    const def = creatureStat(creature, 'def', 50);
    const spd = creatureStat(creature, 'spd', def);
    const durability = hpBase * (1 + level * 0.045) * Math.sqrt((def + spd) / 2);
    const offense = offenseProfile(lead, leadSpecies, targetTypes);
    return {
      level,
      targetTypes,
      offense,
      difficulty: Math.max(0.0001, durability / Math.max(1, offense.index)),
      hpBase,
      defense: (def + spd) / 2
    };
  }

  function findLeadSpecies(lead, data) {
    if (!lead) return null;
    const id = pick(lead, ['speciesId', 'pokeId', 'pokemonId'], null);
    if (id !== null && data.creaturesById.has(String(id))) return data.creaturesById.get(String(id));
    return data.creaturesByName.get(norm(lead.name)) || null;
  }

  function ingestMeasurements(data) {
    const p = getPokeState();
    if (!p) return;
    const sessions = [p.prev, p.sess].filter(Boolean);
    let changed = false;
    for (const session of sessions) {
      const end = finite(session.end, Date.now());
      const start = finite(session.start, 0);
      const seconds = (end - start) / 1000;
      const kills = finite(session.kills, 0);
      const slug = norm(session.slug || (session === p.sess ? getCurrentHuntSlug() : ''));
      if (!slug || seconds < 300 || kills < 20) continue;
      const signature = `${Math.round(start)}:${Math.round(end)}:${kills}`;
      if (history[slug]?.lastSignature === signature) continue;

      let lootGold = 0;
      let lootUnits = 0;
      for (const [id, drop] of Object.entries(session.drops || {})) {
        const qty = finite(drop?.qty, 0);
        lootUnits += qty;
        lootGold += qty * finite(data.itemsById[id]?.npcPrice, data.itemsById[id]?.sellValue, 0);
      }
      const hours = seconds / 3600;
      const sample = {
        kph: kills / hours,
        xph: finite(session.xp, 0) / hours,
        lootPh: lootGold / hours,
        lootUnitsPh: lootUnits / hours,
        capturePh: finite(session.captures, 0) / hours,
        captureRate: finite(session.captures, 0) / kills,
        captureGoldPh: finite(session.sellG, 0) / hours,
        supplyGoldPh: (finite(session.supGold, 0)) / hours,
        seconds,
        kills
      };
      const old = history[slug];
      const alpha = old ? 0.25 : 1;
      const blend = key => old ? old[key] * (1 - alpha) + sample[key] * alpha : sample[key];
      history[slug] = {
        kph: blend('kph'), xph: blend('xph'), lootPh: blend('lootPh'), lootUnitsPh: blend('lootUnitsPh'),
        capturePh: blend('capturePh'), captureRate: blend('captureRate'), captureGoldPh: blend('captureGoldPh'),
        supplyGoldPh: blend('supplyGoldPh'), samples: finite(old?.samples, 0) + 1,
        updatedAt: Date.now(), lastSignature: signature
      };
      changed = true;
    }
    if (changed) saveState();
  }

  function globalCaptureRate() {
    const values = Object.values(history).filter(x => Number.isFinite(x?.captureRate) && x.kills !== 0);
    if (!values.length) {
      const p = getPokeState();
      const s = p?.sess;
      return s?.kills > 20 ? clamp(finite(s.captures) / finite(s.kills, 1), 0, 1) : 0;
    }
    return clamp(values.reduce((sum, x) => sum + x.captureRate, 0) / values.length, 0, 1);
  }

  function expectedLootPerKill(creature, itemsById) {
    const loot = Array.isArray(creature?.loot) ? creature.loot : [];
    let gold = 0;
    let units = 0;
    let known = 0;
    for (const entry of loot) {
      if (typeof entry === 'string') continue;
      if (!entry || typeof entry !== 'object') continue;
      const id = pick(entry, ['itemId', 'id', 'item.id'], null);
      const item = id !== null ? itemsById[id] : null;
      const chance = normalizeChance(pick(entry, ['chance', 'dropRate', 'rate', 'probability', 'percent', 'pct'], null));
      if (chance === null) continue;
      const minQty = finite(entry.minQty, entry.min, entry.quantityMin, entry.qty, entry.quantity, 1);
      const maxQty = finite(entry.maxQty, entry.max, entry.quantityMax, entry.qty, entry.quantity, minQty);
      const avgQty = Math.max(0, (minQty + maxQty) / 2);
      const expected = chance * avgQty;
      units += expected;
      gold += expected * finite(item?.npcPrice, item?.sellValue, entry.npcPrice, 0);
      known++;
    }
    return { gold, units, known, total: loot.length };
  }

  function currentBaseline(data, lead, leadSpecies) {
    const p = getPokeState();
    const currentSlug = norm(getCurrentHuntSlug());
    const session = p?.sess;
    const seconds = session?.start ? (Date.now() - session.start) / 1000 : 0;
    const kills = finite(session?.kills, 0);
    const currentHunt = data.hunts.find(h => h.key === currentSlug || norm(h.slug) === currentSlug || currentSlug.includes(h.key) || h.key.includes(currentSlug));
    if (currentHunt && seconds >= 120 && kills >= 10) {
      return { kph: kills / seconds * 3600, difficulty: huntDifficulty(currentHunt, lead, leadSpecies).difficulty };
    }
    const measured = history[currentSlug];
    if (currentHunt && measured?.kph) return { kph: measured.kph, difficulty: huntDifficulty(currentHunt, lead, leadSpecies).difficulty };
    const allKph = Object.values(history).map(x => x?.kph).filter(Number.isFinite);
    return { kph: allKph.length ? allKph.reduce((a, b) => a + b, 0) / allKph.length : 320, difficulty: null };
  }

  function creatureXp(creature) {
    return Math.max(0, finite(pick(creature, ['experience', 'xp', 'exp', 'experienceYield', 'baseExperience'], 0), 0));
  }

  function creatureSellValue(creature) {
    return Math.max(0, finite(pick(creature, ['sellValue', 'priceNpc', 'npcPrice', 'value'], 0), 0));
  }

  function scoreCandidates(rows) {
    const max = key => Math.max(0, ...rows.map(row => finite(row[key], 0)));
    const maxXp = max('xph');
    const maxLoot = max('lootPh');
    const maxGold = max('netGoldPh');
    const totalWeight = Math.max(1, finite(config.xpWeight) + finite(config.lootWeight) + finite(config.goldWeight));
    for (const row of rows) {
      row.generalScore = 100 * (
        (maxXp ? row.xph / maxXp : 0) * finite(config.xpWeight) +
        (maxLoot ? row.lootPh / maxLoot : 0) * finite(config.lootWeight) +
        (maxGold ? Math.max(0, row.netGoldPh) / maxGold : 0) * finite(config.goldWeight)
      ) / totalWeight;
    }
  }

  async function calculateRecommendations(force = false) {
    const data = await loadData(force);
    ingestMeasurements(data);
    const lead = getLeadPokemon();
    if (!lead) throw new Error('No encuentro ningún Pokémon equipado en el primer slot.');
    const leadSpecies = findLeadSpecies(lead, data);
    const baseline = currentBaseline(data, lead, leadSpecies);
    const captureRate = globalCaptureRate();
    const catchInfo = getAutoCatchInfo(data.itemsById);

    const rows = data.hunts.map(hunt => {
      const diff = huntDifficulty(hunt, lead, leadSpecies);
      const measured = history[hunt.key] || history[norm(hunt.slug)];
      let kph;
      let source;
      if (measured?.kph) {
        kph = measured.kph;
        source = `medido (${measured.samples || 1})`;
      } else if (baseline.difficulty) {
        kph = clamp(baseline.kph * baseline.difficulty / diff.difficulty, 5, 5000);
        source = 'estimado desde tu hunt actual';
      } else {
        const relative = 0.006 / diff.difficulty;
        kph = clamp(320 * Math.sqrt(Math.max(0.05, relative)), 5, 2500);
        source = 'estimación teórica';
      }

      const xpPerKill = creatureXp(hunt.creature);
      const xph = measured?.xph || kph * xpPerKill;
      const expectedLoot = expectedLootPerKill(hunt.creature, data.itemsById);
      const lootPh = measured?.lootPh || kph * expectedLoot.gold;
      const capturePh = measured?.capturePh || (catchInfo.active ? kph * captureRate : 0);
      const captureGoldPh = measured?.captureGoldPh || capturePh * creatureSellValue(hunt.creature);
      const ballsCostPh = catchInfo.active ? capturePh * catchInfo.ballPrice : 0;
      const supplyGoldPh = measured?.supplyGoldPh || ballsCostPh;
      const netGoldPh = lootPh + captureGoldPh - supplyGoldPh;

      return {
        hunt, diff, measured, source, kph, xpPerKill, xph, lootPh, capturePh,
        captureGoldPh, supplyGoldPh, netGoldPh,
        lootDataKnown: expectedLoot.known,
        lootDataTotal: expectedLoot.total
      };
    }).filter(row => Number.isFinite(row.kph) && row.kph > 0);

    scoreCandidates(rows);
    rows.sort((a, b) => config.mode === 'general'
      ? b.generalScore - a.generalScore || b.xph - a.xph
      : b.xph - a.xph || b.netGoldPh - a.netGoldPh);

    return { rows, lead, leadSpecies, catchInfo, captureRate, data };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID}{position:fixed;right:14px;bottom:92px;z-index:99980;border:1px solid #394150;border-radius:999px;background:#131a24;color:#fff;padding:8px 12px;font:700 12px system-ui;box-shadow:0 6px 20px #0008;cursor:pointer}
      #${BUTTON_ID}:hover{background:#202b3a}
      #${PANEL_ID}{position:fixed;inset:0;z-index:99990;background:#0009;display:flex;align-items:center;justify-content:center;font-family:system-ui;color:#e8edf5}
      #${PANEL_ID} .pg-ha-card{width:min(760px,96vw);max-height:90vh;overflow:auto;background:#0d131c;border:1px solid #354052;border-radius:14px;box-shadow:0 18px 60px #000d}
      #${PANEL_ID} .pg-ha-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:12px 14px;background:#121a25;border-bottom:1px solid #273244}
      #${PANEL_ID} .pg-ha-title{font-weight:800;font-size:15px;margin-right:auto}
      #${PANEL_ID} button,#${PANEL_ID} select,#${PANEL_ID} input{background:#182232;color:#edf3fb;border:1px solid #35445a;border-radius:7px;padding:6px 8px;font:600 11px system-ui}
      #${PANEL_ID} button{cursor:pointer}
      #${PANEL_ID} .pg-ha-body{padding:12px}
      #${PANEL_ID} .pg-ha-note{font-size:11px;color:#91a0b5;line-height:1.45;margin-bottom:10px}
      #${PANEL_ID} .pg-ha-settings{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:9px;background:#111925;border:1px solid #253145;border-radius:9px;margin-bottom:11px}
      #${PANEL_ID} .pg-ha-settings label{font-size:10px;color:#9ba8ba;display:flex;align-items:center;gap:6px}
      #${PANEL_ID} .pg-ha-settings input{width:62px;margin-left:auto}
      #${PANEL_ID} .pg-ha-row{display:grid;grid-template-columns:34px minmax(160px,1fr) repeat(4,minmax(76px,auto));gap:8px;align-items:center;padding:9px 8px;border-bottom:1px solid #202b3b;font-size:11px}
      #${PANEL_ID} .pg-ha-row:first-of-type{border-top:1px solid #202b3b}
      #${PANEL_ID} .pg-ha-row.best{background:linear-gradient(90deg,#17321f88,#0d131c)}
      #${PANEL_ID} .pg-ha-rank{font-weight:900;color:#f3cf67;text-align:center;font-size:14px}
      #${PANEL_ID} .pg-ha-name{font-weight:750;font-size:12px;color:#f3f6fb}
      #${PANEL_ID} .pg-ha-sub{font-size:9.5px;color:#8290a5;margin-top:2px}
      #${PANEL_ID} .pg-ha-metric{text-align:right;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .xp{color:#72b7ff}.gold{color:#f2cc60}.loot{color:#8ce99a}.score{color:#d4a6ff}
      #${PANEL_ID} .pg-ha-empty{padding:30px;text-align:center;color:#9ba8ba}
      @media(max-width:700px){#${PANEL_ID} .pg-ha-row{grid-template-columns:30px 1fr 80px 80px}#${PANEL_ID} .pg-ha-row .hide-mobile{display:none}#${PANEL_ID} .pg-ha-settings{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function closePanel() {
    document.getElementById(PANEL_ID)?.remove();
  }

  function renderLoading() {
    closePanel();
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = PANEL_ID;
    overlay.innerHTML = `<div class="pg-ha-card"><div class="pg-ha-head"><span class="pg-ha-title">🗺️ Mejor Hunt</span><button data-close>✕</button></div><div class="pg-ha-empty">Cargando datos del juego y productividad de PIWTools…</div></div>`;
    overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('[data-close]')) closePanel(); });
    document.body.appendChild(overlay);
  }

  function renderResult(result) {
    closePanel();
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = PANEL_ID;
    const topRows = result.rows.slice(0, clamp(finite(config.topN, 8), 3, 20));
    const leadName = result.lead?.name || 'Pokémon';
    const leadLevel = finite(result.lead?.level, 0);

    overlay.innerHTML = `
      <div class="pg-ha-card">
        <div class="pg-ha-head">
          <span class="pg-ha-title">🗺️ Mejor Hunt · ${esc(leadName)} Nv. ${fmt(leadLevel)}</span>
          <select data-mode>
            <option value="xp" ${config.mode === 'xp' ? 'selected' : ''}>Solo XP/h</option>
            <option value="general" ${config.mode === 'general' ? 'selected' : ''}>Mejor general</option>
          </select>
          <button data-refresh title="Actualizar datos">↻</button>
          <button data-close>✕</button>
        </div>
        <div class="pg-ha-body">
          <div class="pg-ha-note">
            ${result.catchInfo.active ? `Auto Catch detectado. Coste estimado de ball: ${fmt(result.catchInfo.ballPrice)} gold.` : 'Auto Catch no detectado: la venta de capturas no se suma en las estimaciones teóricas.'}
            Las filas marcadas como <b>medido</b> usan tus propias sesiones; el resto son estimaciones relativas.
          </div>
          <div class="pg-ha-settings" ${config.mode === 'general' ? '' : 'style="display:none"'}>
            <label>Peso XP <input data-weight="xpWeight" type="number" min="0" max="100" value="${finite(config.xpWeight)}"></label>
            <label>Peso loot <input data-weight="lootWeight" type="number" min="0" max="100" value="${finite(config.lootWeight)}"></label>
            <label>Peso oro neto <input data-weight="goldWeight" type="number" min="0" max="100" value="${finite(config.goldWeight)}"></label>
          </div>
          <div>
            ${topRows.map((row, index) => `
              <div class="pg-ha-row ${index === 0 ? 'best' : ''}">
                <div class="pg-ha-rank">${index === 0 ? '★' : index + 1}</div>
                <div>
                  <div class="pg-ha-name">${esc(row.hunt.name)} ${row.diff.level ? `<span style="color:#8491a3;font-weight:500">Nv. ${fmt(row.diff.level)}</span>` : ''}</div>
                  <div class="pg-ha-sub">${esc(row.source)} · ${esc(row.diff.offense.move)}${row.diff.offense.isTM ? ' (MT)' : ''} ×${fmt(row.diff.offense.eff, 2)} · ${row.lootDataKnown}/${row.lootDataTotal} drops con rate visible</div>
                </div>
                <div class="pg-ha-metric xp"><b>${fmt(row.xph)}</b><br><small>XP/h</small></div>
                <div class="pg-ha-metric loot"><b>${fmt(row.lootPh)}</b><br><small>loot/h</small></div>
                <div class="pg-ha-metric gold hide-mobile"><b>${fmt(row.netGoldPh)}</b><br><small>oro neto/h</small></div>
                <div class="pg-ha-metric score hide-mobile"><b>${config.mode === 'general' ? fmt(row.generalScore, 1) : fmt(row.kph)}</b><br><small>${config.mode === 'general' ? 'score' : 'kills/h'}</small></div>
              </div>`).join('') || '<div class="pg-ha-empty">No se encontraron hunts disponibles.</div>'}
          </div>
        </div>
      </div>`;

    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-close]')) closePanel();
      if (event.target.closest('[data-refresh]')) openAdvisor(true);
    });
    overlay.querySelector('[data-mode]')?.addEventListener('change', event => {
      config.mode = event.target.value === 'general' ? 'general' : 'xp';
      saveState();
      openAdvisor(false);
    });
    overlay.querySelectorAll('[data-weight]').forEach(input => input.addEventListener('change', event => {
      config[event.target.dataset.weight] = clamp(finite(event.target.value, 0), 0, 100);
      saveState();
      openAdvisor(false);
    }));
    document.body.appendChild(overlay);
  }

  function renderError(error) {
    closePanel();
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = PANEL_ID;
    overlay.innerHTML = `<div class="pg-ha-card"><div class="pg-ha-head"><span class="pg-ha-title">🗺️ Mejor Hunt</span><button data-close>✕</button></div><div class="pg-ha-empty">${esc(error?.message || error || 'No se pudo calcular la recomendación.')}</div></div>`;
    overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('[data-close]')) closePanel(); });
    document.body.appendChild(overlay);
  }

  async function openAdvisor(force = false) {
    if (busy) return;
    busy = true;
    renderLoading();
    try {
      renderResult(await calculateRecommendations(force));
    } catch (error) {
      console.error('[Mejor Hunt]', error);
      renderError(error);
    } finally {
      busy = false;
    }
  }

  function looksLikeMapButton(element) {
    const button = element?.closest?.('button,a,[role="button"],.dock-btn');
    if (!button) return false;
    const image = button.querySelector('img');
    const haystack = [button.textContent, button.title, button.getAttribute('aria-label'), image?.alt, image?.src]
      .filter(Boolean).join(' ');
    return /(^|\W)(map|mapa)(\W|$)/i.test(haystack);
  }

  function installTrigger() {
    ensureStyles();
    if (!document.getElementById(BUTTON_ID)) {
      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.textContent = '🗺️ Mejor Hunt';
      button.title = 'Abrir recomendador de hunts';
      button.addEventListener('click', () => openAdvisor(false));
      document.body.appendChild(button);
    }
    document.addEventListener('click', event => {
      if (config.autoOpen && looksLikeMapButton(event.target)) setTimeout(() => openAdvisor(false), 250);
    }, true);
  }

  window.__PGUnifiedHuntCore = {
    calculateRecommendations,
    looksLikeMapButton,
    getConfig: () => Object.assign({}, config),
    setMode: value => { config.mode = value === 'general' ? 'general' : 'xp'; saveState(); },
    setWeight: (key, value) => {
      if (!['xpWeight','lootWeight','rareWeight','goldWeight'].includes(key)) return;
      config[key] = clamp(finite(value, 0), 0, 100); saveState();
    },
    setTopN: value => { config.topN = clamp(finite(value, 8), 3, 20); saveState(); },
    helpers: { norm, finite, fmt, esc, clamp }
  };
})();


(() => {
  'use strict';
  if (window.__pgHuntIntelligenceItemCoreV1118) return;
  window.__pgHuntIntelligenceItemCoreV1118 = true;

  const NS = 'pg-item-finder-v1';
  const PANEL_ID = `${NS}-panel`;
  const BUTTON_ID = `${NS}-button`;
  const STYLE_ID = `${NS}-style`;
  const HISTORY_KEY = `${NS}:history`;
  const LAST_ITEM_KEY = `${NS}:last-item`;

  const TYPE_CHART = {
    normal: { rock: 0.5, ghost: 0, steel: 0.5 }, fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 }, electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 }, ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
    fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 }, poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
    ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 }, flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 }, bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 }, ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 }, dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 }, steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 }, fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
  };

  let cache = null;
  let cacheAt = 0;
  let history = loadJson(HISTORY_KEY, {});

  function loadJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch { return fallback; }
  }

  function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
  }

  function norm(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[_-]+/g, ' ').replace(/\[[^\]]*]/g, '').replace(/\([^)]*\)/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function finite(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  function pick(obj, paths, fallback = null) {
    for (const path of paths) {
      let value = obj;
      for (const part of path.split('.')) value = value?.[part];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function fmt(value, decimals = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-ES', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function chanceValue(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return n > 1 ? n / 100 : n;
  }

  function effectiveness(moveType, defenderTypes) {
    const attack = norm(moveType).replace(/ /g, '');
    if (!TYPE_CHART[attack]) return 1;
    return defenderTypes.filter(Boolean).reduce((total, type) => total * (TYPE_CHART[attack][norm(type).replace(/ /g, '')] ?? 1), 1);
  }

  function getLead() {
    const list = window.__poke?.ws?.pokes?.list;
    if (!Array.isArray(list)) return null;
    return list.filter(p => p?.team).sort((a, b) => finite(a.slot, 99) - finite(b.slot, 99))[0] || null;
  }

  async function loadData(force = false) {
    if (!force && cache && Date.now() - cacheAt < 5 * 60_000) return cache;
    const [markersDoc, creaturesDoc, itemsDoc] = await Promise.all([
      fetch('/api/game/map-markers').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/game/creatures.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/game/items.json').then(r => r.ok ? r.json() : null).catch(() => null)
    ]);
    const creatures = Array.isArray(creaturesDoc?.creatures) ? creaturesDoc.creatures : [];
    const items = Array.isArray(itemsDoc?.items) ? itemsDoc.items : [];
    const markers = Array.isArray(markersDoc) ? markersDoc : (markersDoc?.markers || markersDoc?.hunts || markersDoc?.data || []);

    const creaturesByName = new Map();
    const creaturesById = new Map();
    creatures.forEach(c => {
      if (c?.name) creaturesByName.set(norm(c.name), c);
      const id = pick(c, ['pokeId', 'speciesId', 'id'], null);
      if (id !== null) creaturesById.set(String(id), c);
    });
    const itemsById = new Map();
    const itemsByName = new Map();
    items.forEach(item => {
      if (item?.id !== undefined) itemsById.set(String(item.id), item);
      if (item?.name) itemsByName.set(norm(item.name), item);
    });

    const hunts = [];
    const seen = new Set();
    for (const marker of Array.isArray(markers) ? markers : []) {
      const rawName = pick(marker, ['hunt', 'pokemonName', 'creatureName', 'name', 'title', 'slug'], '');
      if (!rawName) continue;
      const creature = resolveCreature(rawName, marker, creaturesByName, creaturesById);
      if (!creature) continue;
      const key = norm(rawName);
      if (seen.has(key)) continue;
      seen.add(key);
      hunts.push({
        marker, creature, key,
        name: String(rawName).replace(/[_-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()).trim(),
        slug: marker.slug || marker.hunt || rawName
      });
    }

    cache = { creatures, items, markers, hunts, creaturesByName, creaturesById, itemsById, itemsByName };
    cacheAt = Date.now();
    return cache;
  }

  function resolveCreature(rawName, marker, byName, byId) {
    const id = pick(marker, ['pokeId', 'pokemonId', 'speciesId', 'creatureId'], null);
    if (id !== null && byId.has(String(id))) return byId.get(String(id));
    const key = norm(rawName);
    if (byName.has(key)) return byName.get(key);
    const words = key.split(' ');
    for (let i = 0; i < words.length; i++) {
      const suffix = words.slice(i).join(' ');
      if (byName.has(suffix)) return byName.get(suffix);
    }
    for (const [name, creature] of byName) if (key.includes(name) || name.includes(key)) return creature;
    return null;
  }

  function findLeadSpecies(lead, data) {
    const id = pick(lead, ['speciesId', 'pokeId', 'pokemonId'], null);
    if (id !== null && data.creaturesById.has(String(id))) return data.creaturesById.get(String(id));
    return data.creaturesByName.get(norm(lead?.name)) || null;
  }

  function typesOf(creature) {
    if (Array.isArray(creature?.types)) return creature.types.map(t => typeof t === 'string' ? t : t?.name || t?.type).filter(Boolean).slice(0, 2);
    return [creature?.type1, creature?.type2 || creature?.type].filter(Boolean);
  }

  function stat(obj, statName, fallback = 50) {
    const paths = {
      hp: ['hpMax', 'maxHp', 'hp', 'baseHp', 'stats.hp', 'baseStats.hp'],
      atk: ['atk', 'attack', 'baseAtk', 'baseAttack', 'stats.atk', 'stats.attack', 'baseStats.atk'],
      def: ['def', 'defense', 'baseDef', 'baseDefense', 'stats.def', 'stats.defense', 'baseStats.def'],
      spa: ['spa', 'spAttack', 'specialAttack', 'baseSpa', 'stats.spa', 'stats.spAttack', 'baseStats.spa'],
      spd: ['spd', 'spDefense', 'specialDefense', 'baseSpd', 'stats.spd', 'stats.spDefense', 'baseStats.spd']
    };
    return Math.max(1, finite(pick(obj, paths[statName] || [statName], fallback), fallback));
  }

  function getMoves(lead, species) {
    const source = [lead?.moves, lead?.attacks, lead?.skills, species?.moves, species?.attacks, species?.skills].find(Array.isArray) || [];
    const level = finite(lead?.level, 1);
    return source.map(raw => {
      if (typeof raw === 'string') return { name: raw, power: 50, type: '', category: '' };
      if (!raw || typeof raw !== 'object') return null;
      const required = finite(raw.level, raw.requiredLevel, raw.learnLevel, raw.unlockLevel, 0);
      if (required && required > level) return null;
      return {
        name: pick(raw, ['name', 'moveName', 'move', 'id'], 'Golpe'),
        power: Math.max(1, finite(raw.power, raw.basePower, raw.damage, raw.dmg, 50)),
        type: pick(raw, ['type', 'element'], ''),
        category: norm(pick(raw, ['category', 'damageClass', 'class'], ''))
      };
    }).filter(Boolean);
  }

  function combatIndex(lead, leadSpecies, creature, marker) {
    const defenderTypes = typesOf(creature);
    const leadTypes = [lead?.type1, lead?.type2, ...(Array.isArray(lead?.types) ? lead.types : [])].filter(Boolean);
    const atk = stat(lead, 'atk', stat(leadSpecies, 'atk'));
    const spa = stat(lead, 'spa', stat(leadSpecies, 'spa', atk));
    const moves = getMoves(lead, leadSpecies);
    const pool = moves.length ? moves : leadTypes.map(type => ({ name: type, power: 50, type, category: '' }));
    let best = { damage: Math.max(atk, spa) * 50, move: 'Ataque básico', eff: 1 };
    for (const move of pool) {
      const type = move.type || leadTypes[0] || '';
      const special = /special|especial|spa/.test(move.category);
      const attackStat = special ? spa : (/physical|fisic|atk/.test(move.category) ? atk : Math.max(atk, spa));
      const stab = leadTypes.some(t => norm(t) === norm(type)) ? 1.5 : 1;
      const eff = effectiveness(type, defenderTypes);
      const damage = attackStat * move.power * stab * eff;
      if (damage > best.damage) best = { damage, move: move.name, eff };
    }
    const level = Math.max(1, finite(marker?.level, marker?.lvl, marker?.minLevel, creature?.huntLevel, 1));
    const durability = stat(creature, 'hp') * (1 + level * 0.045) * Math.sqrt((stat(creature, 'def') + stat(creature, 'spd')) / 2);
    const difficulty = durability / Math.max(1, best.damage);
    return { difficulty, best, level };
  }

  function getCurrentBaseline(data, lead, species) {
    const p = window.__poke;
    const session = p?.sess;
    const seconds = session?.start ? (Date.now() - session.start) / 1000 : 0;
    const kills = finite(session?.kills, 0);
    const slug = norm(p?.ws?.['field-init']?.slug || p?.lastSlug || session?.slug || '');
    const hunt = data.hunts.find(h => h.key === slug || norm(h.slug) === slug || slug.includes(h.key) || h.key.includes(slug));
    if (hunt && seconds >= 120 && kills >= 10) {
      return { kph: kills / seconds * 3600, difficulty: combatIndex(lead, species, hunt.creature, hunt.marker).difficulty };
    }
    const all = Object.values(history).map(h => h?.kph).filter(Number.isFinite);
    return { kph: all.length ? all.reduce((a, b) => a + b, 0) / all.length : 320, difficulty: null };
  }

  function parseLootEntry(entry, data) {
    if (typeof entry === 'string') {
      return { name: entry, item: data.itemsByName.get(norm(entry)) || null, chance: null, avgQty: 1 };
    }
    if (!entry || typeof entry !== 'object') return null;
    const id = pick(entry, ['itemId', 'id', 'item.id'], null);
    const item = id !== null ? data.itemsById.get(String(id)) : null;
    const name = pick(entry, ['name', 'itemName', 'item.name'], item?.name || '');
    if (!name && !item) return null;
    const chance = chanceValue(pick(entry, ['chance', 'dropRate', 'rate', 'probability', 'percent', 'pct'], null));
    const minQty = finite(entry.minQty, entry.min, entry.quantityMin, entry.qty, entry.quantity, 1);
    const maxQty = finite(entry.maxQty, entry.max, entry.quantityMax, entry.qty, entry.quantity, minQty);
    return { id: id !== null ? String(id) : null, item, name: name || item?.name, chance, avgQty: Math.max(0, (minQty + maxQty) / 2) };
  }

  function itemMatches(parsed, item) {
    if (!parsed || !item) return false;
    if (parsed.id !== null && String(parsed.id) === String(item.id)) return true;
    return norm(parsed.name) === norm(item.name);
  }

  function ingestObservedDrops(data) {
    const p = window.__poke;
    if (!p) return;
    let changed = false;
    for (const session of [p.prev, p.sess].filter(Boolean)) {
      const start = finite(session.start, 0);
      const end = finite(session.end, Date.now());
      const seconds = (end - start) / 1000;
      const kills = finite(session.kills, 0);
      const slug = norm(session.slug || (session === p.sess ? p?.ws?.['field-init']?.slug : ''));
      if (!slug || seconds < 300 || kills < 20) continue;
      const signature = `${Math.round(start)}:${Math.round(end)}:${kills}`;
      const record = history[slug] || { items: {}, samples: 0 };
      if (record.lastSignature === signature) continue;
      const alpha = record.samples ? 0.25 : 1;
      record.kph = record.kph ? record.kph * (1 - alpha) + (kills / seconds * 3600) * alpha : kills / seconds * 3600;
      for (const [id, drop] of Object.entries(session.drops || {})) {
        const qtyPerKill = finite(drop?.qty, 0) / kills;
        const old = record.items[id];
        record.items[id] = old === undefined ? qtyPerKill : old * (1 - alpha) + qtyPerKill * alpha;
      }
      record.samples = finite(record.samples, 0) + 1;
      record.lastSignature = signature;
      record.updatedAt = Date.now();
      history[slug] = record;
      changed = true;
    }
    if (changed) saveHistory();
  }

  function findItem(query, data) {
    const key = norm(query);
    if (!key) return null;
    if (data.itemsByName.has(key)) return data.itemsByName.get(key);
    const starts = data.items.filter(item => norm(item.name).startsWith(key));
    if (starts.length) return starts.sort((a, b) => a.name.length - b.name.length)[0];
    const includes = data.items.filter(item => norm(item.name).includes(key));
    return includes.sort((a, b) => a.name.length - b.name.length)[0] || null;
  }

  function observedRateFor(hunt, item) {
    const record = history[hunt.key] || history[norm(hunt.slug)];
    if (!record) return null;
    const byId = record.items?.[String(item.id)];
    if (Number.isFinite(byId)) return { perKill: byId, kph: record.kph, samples: record.samples };
    return null;
  }

  async function searchItem(query, force = false) {
    const data = await loadData(force);
    ingestObservedDrops(data);
    const item = findItem(query, data);
    if (!item) throw new Error(`No encuentro un item llamado “${query}”.`);
    const lead = getLead();
    if (!lead) throw new Error('No encuentro el Pokémon equipado en el primer slot.');
    const species = findLeadSpecies(lead, data);
    const baseline = getCurrentBaseline(data, lead, species);

    const rows = [];
    for (const hunt of data.hunts) {
      const parsedLoot = (Array.isArray(hunt.creature?.loot) ? hunt.creature.loot : [])
        .map(entry => parseLootEntry(entry, data)).filter(Boolean);
      const matching = parsedLoot.filter(entry => itemMatches(entry, item));
      if (!matching.length) continue;

      const combat = combatIndex(lead, species, hunt.creature, hunt.marker);
      const observed = observedRateFor(hunt, item);
      let kph;
      if (observed?.kph) kph = observed.kph;
      else if (baseline.difficulty) kph = clamp(baseline.kph * baseline.difficulty / combat.difficulty, 5, 5000);
      else kph = clamp(320 * Math.sqrt(Math.max(0.05, 0.006 / combat.difficulty)), 5, 2500);

      const knownExpected = matching.filter(x => x.chance !== null).reduce((sum, x) => sum + x.chance * x.avgQty, 0);
      const theoreticalKnown = matching.some(x => x.chance !== null);
      const perKill = observed?.perKill ?? (theoreticalKnown ? knownExpected : null);
      const itemsPh = perKill !== null ? perKill * kph : null;
      const bestChance = Math.max(0, ...matching.map(x => x.chance ?? 0));

      rows.push({
        hunt, combat, observed, kph, perKill, itemsPh, bestChance,
        theoreticalKnown,
        source: observed ? `observado (${observed.samples || 1})` : theoreticalKnown ? 'rate del cliente' : 'rate no expuesto'
      });
    }

    rows.sort((a, b) => {
      const aKnown = a.itemsPh !== null ? 1 : 0;
      const bKnown = b.itemsPh !== null ? 1 : 0;
      if (aKnown !== bKnown) return bKnown - aKnown;
      if (a.itemsPh !== null && b.itemsPh !== null && Math.abs(b.itemsPh - a.itemsPh) > 0.0001) return b.itemsPh - a.itemsPh;
      if (Math.abs(b.bestChance - a.bestChance) > 0.000001) return b.bestChance - a.bestChance;
      return b.kph - a.kph; // desempate pedido: el Pokémon actual mata antes.
    });

    return { item, lead, rows, data };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID}{position:fixed;right:14px;bottom:48px;z-index:99980;border:1px solid #394150;border-radius:999px;background:#231728;color:#fff;padding:8px 12px;font:700 12px system-ui;box-shadow:0 6px 20px #0008;cursor:pointer}
      #${BUTTON_ID}:hover{background:#33213b}
      #${PANEL_ID}{position:fixed;inset:0;z-index:99990;background:#0009;display:flex;align-items:center;justify-content:center;font-family:system-ui;color:#e8edf5}
      #${PANEL_ID} .pg-if-card{width:min(720px,96vw);max-height:90vh;overflow:auto;background:#0d131c;border:1px solid #354052;border-radius:14px;box-shadow:0 18px 60px #000d}
      #${PANEL_ID} .pg-if-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:12px 14px;background:#17111d;border-bottom:1px solid #382b40}
      #${PANEL_ID} .pg-if-title{font-weight:800;font-size:15px;margin-right:auto}
      #${PANEL_ID} button,#${PANEL_ID} input{background:#201727;color:#edf3fb;border:1px solid #493653;border-radius:7px;padding:7px 9px;font:600 11px system-ui}
      #${PANEL_ID} button{cursor:pointer}
      #${PANEL_ID} .pg-if-search{display:flex;gap:7px;padding:12px;background:#100d14;border-bottom:1px solid #271f2d}
      #${PANEL_ID} .pg-if-search input{flex:1;font-size:12px}
      #${PANEL_ID} .pg-if-body{padding:12px}
      #${PANEL_ID} .pg-if-note{font-size:11px;color:#98a5b6;line-height:1.45;margin-bottom:10px}
      #${PANEL_ID} .pg-if-hero{padding:12px;border:1px solid #38593f;background:linear-gradient(90deg,#142c1a,#111720);border-radius:10px;margin-bottom:10px}
      #${PANEL_ID} .pg-if-hero strong{font-size:15px;color:#9aefa8}
      #${PANEL_ID} .pg-if-row{display:grid;grid-template-columns:34px minmax(170px,1fr) repeat(4,minmax(72px,auto));gap:8px;align-items:center;padding:9px 8px;border-bottom:1px solid #202b3b;font-size:11px}
      #${PANEL_ID} .pg-if-rank{text-align:center;font-weight:900;color:#f0c467;font-size:14px}
      #${PANEL_ID} .pg-if-name{font-weight:750;font-size:12px}.pg-if-sub{font-size:9.5px;color:#8290a5;margin-top:2px}
      #${PANEL_ID} .pg-if-metric{text-align:right;font-variant-numeric:tabular-nums}.rate{color:#d5a6ff}.speed{color:#72b7ff}.items{color:#8ce99a}.eff{color:#ffd36c}
      #${PANEL_ID} .pg-if-empty{padding:28px;text-align:center;color:#9ba8ba;line-height:1.6}
      @media(max-width:680px){#${PANEL_ID} .pg-if-row{grid-template-columns:28px 1fr 80px 80px}#${PANEL_ID} .hide-mobile{display:none}}
    `;
    document.head.appendChild(style);
  }

  function closePanel() { document.getElementById(PANEL_ID)?.remove(); }

  function panelShell(content) {
    closePanel();
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = PANEL_ID;
    const last = localStorage.getItem(LAST_ITEM_KEY) || '';
    overlay.innerHTML = `
      <div class="pg-if-card">
        <div class="pg-if-head"><span class="pg-if-title">🎯 Buscador de Items</span><button data-refresh title="Actualizar datos">↻</button><button data-close>✕</button></div>
        <form class="pg-if-search" data-form><input data-query list="${NS}-items" placeholder="Nombre del item" value="${esc(last)}"><datalist id="${NS}-items"></datalist><button type="submit" data-item-search>Buscar</button></form>
        <div class="pg-if-body">${content}</div>
      </div>`;
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-close]')) closePanel();
      if (event.target.closest('[data-refresh]')) runSearch(overlay.querySelector('[data-query]')?.value || '', true);
    });
    overlay.querySelector('[data-form]')?.addEventListener('submit', event => {
      event.preventDefault();
      runSearch(overlay.querySelector('[data-query]')?.value || '', false);
    });
    document.body.appendChild(overlay);
    populateDatalist(overlay).catch(() => {});
    return overlay;
  }

  async function populateDatalist(overlay) {
    const data = await loadData(false);
    const list = overlay.querySelector(`#${CSS.escape(`${NS}-items`)}`);
    if (!list) return;
    list.innerHTML = data.items.slice(0, 1500).map(item => `<option value="${esc(item.name)}"></option>`).join('');
  }

  function renderInitial() {
    panelShell('<div class="pg-if-empty">Escribe el item que quieres conseguir. El desempate favorece siempre al objetivo que tu Pokémon del primer slot pueda derrotar más rápido.</div>');
    setTimeout(() => document.querySelector(`#${PANEL_ID} [data-query]`)?.focus(), 30);
  }

  function renderLoading(query) {
    panelShell(`<div class="pg-if-empty">Buscando “${esc(query)}” con productividad de PIWTools…</div>`);
  }

  function renderError(message) {
    panelShell(`<div class="pg-if-empty">${esc(message)}</div>`);
  }

  function renderResults(result) {
    const knownRows = result.rows.filter(row => row.itemsPh !== null);
    const best = result.rows[0];
    const itemName = result.item.name;
    const rateWarning = result.rows.some(row => !row.theoreticalKnown && !row.observed);
    const content = `
      <div class="pg-if-note">
        Pokémon usado para el desempate: <b>${esc(result.lead.name || 'Primer slot')}</b> Nv. ${fmt(finite(result.lead.level))}.
        ${rateWarning ? 'Algunos drops aparecen en el cliente sin porcentaje; esos objetivos solo se ordenan correctamente después de observar sesiones reales.' : 'Los porcentajes visibles se han combinado con la velocidad estimada de combate.'}
      </div>
      ${best ? `<div class="pg-if-hero"><div>Mejor objetivo para <b>${esc(itemName)}</b></div><strong>${esc(best.hunt.name)}</strong><div style="margin-top:4px;font-size:11px;color:#a9b7c8">${best.itemsPh !== null ? `${fmt(best.itemsPh, 2)} items/h estimados` : 'Drop confirmado, rate aún no visible'} · ${fmt(best.kph)} kills/h · ${esc(best.source)}</div></div>` : ''}
      <div>
        ${result.rows.slice(0, 12).map((row, index) => `
          <div class="pg-if-row">
            <div class="pg-if-rank">${index === 0 ? '★' : index + 1}</div>
            <div><div class="pg-if-name">${esc(row.hunt.name)} ${row.combat.level ? `<span style="color:#8491a3;font-weight:500">Nv. ${fmt(row.combat.level)}</span>` : ''}</div><div class="pg-if-sub">${esc(row.source)} · ${esc(row.combat.best.move)} ×${fmt(row.combat.best.eff, 2)}</div></div>
            <div class="pg-if-metric rate"><b>${row.perKill !== null ? fmt(row.perKill * 100, 3) + '%' : '—'}</b><br><small>items/kill</small></div>
            <div class="pg-if-metric speed"><b>${fmt(row.kph)}</b><br><small>kills/h</small></div>
            <div class="pg-if-metric items hide-mobile"><b>${row.itemsPh !== null ? fmt(row.itemsPh, 2) : '—'}</b><br><small>items/h</small></div>
            <div class="pg-if-metric eff hide-mobile"><b>×${fmt(row.combat.best.eff, 2)}</b><br><small>efectividad</small></div>
          </div>`).join('') || `<div class="pg-if-empty">No encuentro ninguna hunt cuyo Pokémon pueda soltar <b>${esc(itemName)}</b>.</div>`}
      </div>
      ${knownRows.length === 0 && result.rows.length ? '<div class="pg-if-note" style="margin-top:12px">El archivo de criaturas confirma qué Pokémon lo sueltan, pero no expone el porcentaje. Deja cada hunt al menos cinco minutos para que el script aprenda unidades por kill y pueda compararlas.</div>' : ''}`;
    panelShell(content);
  }

  async function runSearch(query, force = false) {
    query = String(query || '').trim();
    if (!query) { renderInitial(); return; }
    localStorage.setItem(LAST_ITEM_KEY, query);
    renderLoading(query);
    try {
      renderResults(await searchItem(query, force));
    } catch (error) {
      console.error('[Buscador de Items]', error);
      renderError(error?.message || 'No se pudo completar la búsqueda.');
    }
  }

  function installButton() {
    ensureStyles();
    if (document.getElementById(BUTTON_ID)) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.textContent = '🎯 Buscar Item';
    button.title = 'Buscar qué Pokémon farmear para conseguir un item';
    button.addEventListener('click', renderInitial);
    document.body.appendChild(button);
  }

  window.__PGUnifiedItemCore = {
    searchItem,
    loadData,
    getLastItem: () => localStorage.getItem(LAST_ITEM_KEY) || '',
    setLastItem: value => localStorage.setItem(LAST_ITEM_KEY, String(value || '')),
    helpers: { norm, finite, fmt, esc, clamp }
  };
})();


/* ========================================================================== */
/* PIWTOOLS ENGINE v3.1 — PIWTools + opción para incluir/excluir MT.          */
/* ========================================================================== */
(() => {
  'use strict';
  if (window.__pgHuntIntelligenceEngineV1118) return;
  window.__pgHuntIntelligenceEngineV1118 = true;

  const HuntCore = window.__PGUnifiedHuntCore;
  const ItemCore = window.__PGUnifiedItemCore;
  if (!HuntCore || !ItemCore) {
    console.error('[Hunt Advisor · PIWTools] No se encontraron los núcleos del script.');
    return;
  }

  const NS = 'pg-piwtools-engine-v3';
  const CACHE_KEY = `${NS}:productivity-cache`;
  const DAILY_KEY = `${NS}:daily-type`;
  const DAILY_DAY_KEY = `${NS}:daily-cycle-day`;
  const DAILY_DETECTED_KEY = `${NS}:daily-detected`;
  const TM_KEY = `${NS}:use-tm`;
  const LEGACY_CALIBRATION_KEY = 'pg-performance-supervisor-v2:calibration';
  const INTELLIGENCE_NS = 'pg-hunt-intelligence-v1';
  const CALIBRATION_KEY = `${INTELLIGENCE_NS}:calibration`;
  const VIP_PREFIX = `${INTELLIGENCE_NS}:vip:`;
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const DAILY_MULT = 1.20;
  const VIP_MULT = 1.50;
  const DAILY_CHECK_MS = 10000;

  const DIRECT_PIW_PAGES = [
    'https://piwtools.com.br/calculator',
    'https://piwtools.vercel.app/calculator'
  ];
  const MIRROR_SPEEDS = [
    'https://cdn.jsdelivr.net/gh/dbx0/poke-hunt@main/data/speeds.json',
    'https://raw.githubusercontent.com/dbx0/poke-hunt/main/data/speeds.json'
  ];
  const MIRROR_META = 'https://cdn.jsdelivr.net/gh/dbx0/poke-hunt@main/data/meta.json';

  const TYPE_CHART = {
    normal: { rock: 0.5, ghost: 0, steel: 0.5 },
    fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
    electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
    ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
    fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
    poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
    ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
    flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
    bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
    ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
    dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
    steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
    fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
  };

  const TYPE_LABELS = {
    normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta',
    ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador',
    psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón',
    dark: 'Siniestro', steel: 'Acero', fairy: 'Hada'
  };

  const TYPE_ALIASES = {
    normal: ['normal'], fire: ['fire', 'fuego', 'fogo'], water: ['water', 'agua'],
    electric: ['electric', 'electrico', 'eletrico'], grass: ['grass', 'planta', 'grama'],
    ice: ['ice', 'hielo', 'gelo'], fighting: ['fighting', 'lucha', 'lutador'],
    poison: ['poison', 'veneno'], ground: ['ground', 'tierra', 'terra'],
    flying: ['flying', 'volador', 'voador'], psychic: ['psychic', 'psiquico', 'psiquica'],
    bug: ['bug', 'bicho', 'inseto'], rock: ['rock', 'roca', 'pedra'],
    ghost: ['ghost', 'fantasma'], dragon: ['dragon', 'dragao'],
    dark: ['dark', 'siniestro', 'sombrio'], steel: ['steel', 'acero', 'aco'],
    fairy: ['fairy', 'hada', 'fada']
  };

  const FALLBACK_SPEEDS = {
    hit1: 600, hit2: 480, hit3: 400, hit4: 340,
    hit5: 300, hit6: 270, hit7: 240, hit8: 220
  };

  const IV_WILD = 18;
  const QUALITY_ENEMY = 1;
  const QUALITY_PLAYER = 1.8;
  const IV_PLAYER = [21, 18, 21, 18, 21, 18];
  const QUALITY_EXP = [0.95, 0.8, 0.8, 0.8, 0.8, 0.8];
  const HP_TOTAL_MULT = 12;
  const HP_HUNT_MULT = 5;
  const DAMAGE_DENOMINATOR = 60;
  const DAMAGE_MULTIPLIER = 2;
  const FIRST_HIT_MS = 500;
  const ATTACK_INTERVAL_MS = 1600;
  const SPAWN_FLOOR_MS = 5000;

  let memoryProductivity = null;
  let loadPromise = null;
  let dailyWatcherTimer = null;
  let lastDetectedDailySignature = '';
  let dailySocket = null;
  let dailySocketListener = null;
  let liveDailyCandidates = [];
  let lastDailyDiagnostics = { cycle: '', checkedAt: 0, detected: false, types: [], source: '', path: '', score: 0, candidates: [] };

  function norm(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[_-]+/g, ' ').replace(/\[[^\]]*]/g, '').replace(/\([^)]*\)/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function compact(value) { return norm(value).replace(/\s+/g, ''); }

  function finite(...values) {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return 0;
  }

  function pick(object, paths, fallback = null) {
    for (const path of paths) {
      let value = object;
      for (const part of path.split('.')) value = value?.[part];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function readJson(key, fallback = null) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed ?? fallback;
    } catch { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function madridCycleParts(timestamp = Date.now()) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date(timestamp));
      const data = Object.fromEntries(parts.map(part => [part.type, part.value]));
      return { year: Number(data.year), month: Number(data.month), day: Number(data.day), hour: Number(data.hour) };
    } catch {
      const date = new Date(timestamp);
      return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours() };
    }
  }

  function madridDailyCycleKey(timestamp = Date.now()) {
    const parts = madridCycleParts(timestamp);
    let utcDay = Date.UTC(parts.year, parts.month - 1, parts.day);
    if (parts.hour < 5) utcDay -= 86400000;
    const date = new Date(utcDay);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function ensureDailyCycle() {
    const cycle = madridDailyCycleKey();
    let stored = '';
    try { stored = localStorage.getItem(DAILY_DAY_KEY) || ''; } catch {}
    if (stored === cycle) return false;
    try {
      localStorage.setItem(DAILY_DAY_KEY, cycle);
      localStorage.setItem(DAILY_KEY, 'auto');
      localStorage.removeItem(DAILY_DETECTED_KEY);
    } catch {}
    liveDailyCandidates = [];
    lastDailyDiagnostics = { cycle, checkedAt: Date.now(), detected: false, types: [], source: '', path: '', score: 0, candidates: [] };
    return true;
  }

  function readDetectedDaily() {
    const value = readJson(DAILY_DETECTED_KEY, null);
    if (!value || value.cycle !== madridDailyCycleKey() || !Array.isArray(value.types)) return null;
    const types = value.types.filter(type => TYPE_LABELS[type]);
    return types.length ? { ...value, types } : null;
  }

  function saveDetectedDaily(types, score = 0) {
    const clean = [...new Set((types || []).filter(type => TYPE_LABELS[type]))];
    if (!clean.length) return;
    writeJson(DAILY_DETECTED_KEY, { cycle: madridDailyCycleKey(), types: clean, score: Number(score) || 0 });
  }

  function accountIdentity() {
    const character = window.__poke?.api?.['/api/characters/me']?.character || {};
    const value = character.id || character.characterId || character.name || window.__poke?.accountId || 'cuenta-local';
    return compact(value) || 'cuenta-local';
  }

  function vipStorageKey() { return `${VIP_PREFIX}${accountIdentity()}`; }

  function getVip() {
    try {
      const direct = localStorage.getItem(vipStorageKey());
      if (direct !== null) return direct === '1' || direct === 'true';
      const pending = localStorage.getItem(`${VIP_PREFIX}cuenta-local`);
      if (pending !== null) return pending === '1' || pending === 'true';
    } catch {}
    return false;
  }

  function setVip(value) {
    const enabled = Boolean(value);
    try { localStorage.setItem(vipStorageKey(), enabled ? '1' : '0'); } catch {}
    try { window.dispatchEvent(new CustomEvent('pokegrid-vip-updated', { detail: { enabled, accountId: accountIdentity() } })); } catch {}
    return enabled;
  }

  function personalIntelligence(lead, hunt, diff, dailyBoosted, vipActive) {
    try {
      return window.__PGHuntIntelligenceSupervisor?.getPersonalEstimate?.({
        lead, hunt, diff, dailyBoosted: Boolean(dailyBoosted), vipActive: Boolean(vipActive)
      }) || null;
    } catch { return null; }
  }

  function calibrationKey(lead, hunt, diff) {
    const leadKey = compact(pick(lead || {}, ['speciesId', 'pokeId', 'species.id', 'name'], 'unknown'));
    const huntKey = compact(pick(hunt || {}, ['slug', 'marker.slug', 'marker.hunt', 'name', 'creature.slug', 'creature.name'], 'unknown'));
    const moveKey = compact(pick(diff || {}, ['offense.move', 'offense.name'], 'unknown'));
    const tmKey = diff?.offense?.isTM ? 'tm' : 'base';
    return `${leadKey}|${huntKey}|${moveKey}|${tmKey}`;
  }

  function personalCalibration(lead, hunt, diff) {
    const registry = readJson(CALIBRATION_KEY, {});
    const legacy = readJson(LEGACY_CALIBRATION_KEY, {});
    const key = calibrationKey(lead, hunt, diff);
    const row = registry?.[key] || legacy?.[key];
    if (!row || !Number.isFinite(Number(row.factor))) return null;
    const factor = clamp(Number(row.factor), 0.65, 1.45);
    const seconds = Math.max(0, Number(row.totalSeconds) || 0);
    const kills = Math.max(0, Number(row.totalKills) || 0);
    if (seconds < 600 || kills < 80) return null;
    return {
      factor,
      samples: Math.max(1, Number(row.samples) || 1),
      totalSeconds: seconds,
      totalKills: kills,
      updatedAt: Number(row.updatedAt) || 0,
      confidence: seconds >= 7200 && kills >= 1000 ? 'alta' : seconds >= 2400 && kills >= 300 ? 'media' : 'baja'
    };
  }

  async function fetchText(url, timeout = 9000, force = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method: 'GET', mode: 'cors', credentials: 'omit',
        cache: force ? 'reload' : 'default', signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } finally { clearTimeout(timer); }
  }

  async function fetchJson(url, timeout = 9000, force = false) {
    return JSON.parse(await fetchText(url, timeout, force));
  }

  function balancedLiteral(source, openIndex) {
    const open = source[openIndex];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let index = openIndex; index < source.length; index++) {
      const char = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
      if (char === open) depth++;
      else if (char === close && --depth === 0) return source.slice(openIndex, index + 1);
    }
    throw new Error('Literal incompleto');
  }

  function extractPiwSpeeds(bundle) {
    const marker = bundle.indexOf('hit1:');
    if (marker < 0) throw new Error('PIWTools no contiene hit1');
    const inner = bundle.lastIndexOf('{', marker);
    let index = inner - 1;
    while (/\s/.test(bundle[index])) index--;
    if (bundle[index] !== ':') throw new Error('Formato PIWTools inesperado');
    index--;
    while (index >= 0 && /[\w"']/.test(bundle[index])) index--;
    while (/\s/.test(bundle[index])) index--;
    if (bundle[index] !== '{') throw new Error('No se encontró la tabla exterior');
    const literal = balancedLiteral(bundle, index);
    if (!/^[\s\dA-Za-z_{}:,.+\-"']+$/.test(literal)) throw new Error('Tabla PIWTools con contenido no permitido');
    const result = Function(`"use strict"; return (${literal});`)();
    return normalizeSpeedTable(result);
  }

  function normalizeSpeedTable(raw) {
    const output = {};
    if (!raw || typeof raw !== 'object') return output;
    for (const [id, row] of Object.entries(raw)) {
      if (!row || typeof row !== 'object') continue;
      const clean = {};
      for (let hit = 1; hit <= 8; hit++) {
        const value = Number(row[`hit${hit}`]);
        if (Number.isFinite(value) && value > 0) clean[`hit${hit}`] = value;
      }
      if (clean.hit1 && clean.hit8) output[String(id)] = clean;
    }
    return output;
  }

  function validateSpeeds(speeds) {
    return speeds && typeof speeds === 'object' && Object.keys(speeds).length >= 80;
  }

  async function loadDirectPiw(force) {
    let lastError = null;
    for (const pageUrl of DIRECT_PIW_PAGES) {
      try {
        const page = await fetchText(pageUrl, 9000, force);
        const asset = (page.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/) || [])[0];
        if (!asset) throw new Error('No se encontró el bundle');
        const origin = new URL(pageUrl).origin;
        const bundle = await fetchText(`${origin}${asset}`, 14000, force);
        const speeds = extractPiwSpeeds(bundle);
        if (!validateSpeeds(speeds)) throw new Error('Tabla PIWTools demasiado pequeña');
        return {
          speeds, source: 'PIWTools directo', sourceUrl: `${origin}${asset}`,
          version: asset.split('/').pop(), updatedAt: new Date().toISOString(), fallback: false
        };
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('PIWTools directo no disponible');
  }

  async function loadPiwMirror(force) {
    let lastError = null;
    for (const url of MIRROR_SPEEDS) {
      try {
        const speeds = normalizeSpeedTable(await fetchJson(url, 12000, force));
        if (!validateSpeeds(speeds)) throw new Error('Espejo PIWTools incompleto');
        let meta = {};
        try { meta = await fetchJson(MIRROR_META, 5000, force); } catch {}
        return {
          speeds, source: 'PIWTools (espejo verificado)', sourceUrl: url,
          version: meta.version || 'mirror-main', updatedAt: meta.updatedAt || new Date().toISOString(), fallback: false
        };
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Espejo PIWTools no disponible');
  }

  async function loadProductivity(force = false) {
    const cached = readJson(CACHE_KEY, null);
    if (!force && memoryProductivity && Date.now() - memoryProductivity.fetchedAt < CACHE_TTL) return memoryProductivity;
    if (!force && cached?.speeds && validateSpeeds(cached.speeds) && Date.now() - finite(cached.fetchedAt) < CACHE_TTL) {
      memoryProductivity = cached;
      return cached;
    }
    if (loadPromise && !force) return loadPromise;
    loadPromise = (async () => {
      const errors = [];
      for (const loader of [loadDirectPiw, loadPiwMirror]) {
        try {
          const result = await loader(force);
          const record = { ...result, fetchedAt: Date.now() };
          memoryProductivity = record;
          writeJson(CACHE_KEY, record);
          return record;
        } catch (error) { errors.push(error?.message || String(error)); }
      }
      if (cached?.speeds && validateSpeeds(cached.speeds)) {
        memoryProductivity = { ...cached, source: `${cached.source || 'PIWTools'} · caché`, stale: true };
        return memoryProductivity;
      }
      throw new Error(`No se pudo cargar una tabla válida de productividad de PIWTools${errors.length ? `: ${errors.join(' · ')}` : '.'}`);
    })();
    try { return await loadPromise; } finally { loadPromise = null; }
  }

  function getLeadPokemon() {
    const list = window.__poke?.ws?.pokes?.list;
    if (!Array.isArray(list)) return null;
    return list.filter(pokemon => pokemon?.team)
      .sort((a, b) => finite(a.slot, 99) - finite(b.slot, 99))[0] || null;
  }

  function findLeadSpecies(lead, data) {
    const id = pick(lead, ['speciesId', 'pokeId', 'pokemonId'], null);
    if (id !== null && data.creaturesById?.has(String(id))) return data.creaturesById.get(String(id));
    return data.creaturesByName?.get(norm(lead?.name)) || null;
  }

  function creatureTypes(creature) {
    if (Array.isArray(creature?.types)) {
      return creature.types.map(type => typeof type === 'string' ? type : type?.name || type?.type)
        .filter(Boolean).map(compact).slice(0, 2);
    }
    return [creature?.type1, creature?.type2 || creature?.type].filter(Boolean).map(compact);
  }

  function baseStat(creature, stat, fallback = 50) {
    const paths = {
      hp: ['baseHp', 'hp', 'stats.hp', 'baseStats.hp'],
      atk: ['baseAtk', 'baseAttack', 'atk', 'attack', 'stats.atk', 'stats.attack'],
      def: ['baseDef', 'baseDefense', 'def', 'defense', 'stats.def', 'stats.defense'],
      spa: ['baseSpAtk', 'baseSpa', 'spAtk', 'spa', 'specialAttack', 'stats.spAtk', 'stats.spa'],
      spd: ['baseSpDef', 'baseSpd', 'spDef', 'spd', 'specialDefense', 'stats.spDef', 'stats.spd'],
      speed: ['baseSpeed', 'speed', 'vel', 'stats.speed', 'stats.vel']
    };
    return Math.max(1, finite(pick(creature, paths[stat] || [stat], fallback), fallback));
  }

  function liveStat(pokemon, stat, fallback = 0) {
    const paths = {
      hp: ['stats.hp', 'hpMax', 'maxHp', 'hp', 'attributes.hp'],
      atk: ['stats.atk', 'stats.attack', 'atk', 'attack', 'attributes.atk'],
      def: ['stats.def', 'stats.defense', 'def', 'defense', 'attributes.def'],
      spa: ['stats.spAtk', 'stats.spa', 'stats.specialAttack', 'spAtk', 'spa', 'specialAttack', 'attributes.spa'],
      spd: ['stats.spDef', 'stats.spd', 'stats.specialDefense', 'spDef', 'spd', 'specialDefense', 'attributes.spd'],
      speed: ['stats.speed', 'stats.vel', 'speed', 'vel', 'attributes.speed']
    };
    return finite(pick(pokemon, paths[stat] || [stat], fallback), fallback);
  }

  function statAt(base, iv, level, quality, exponentIndex) {
    return Math.round((base + 2 * iv) * (level / 100) * Math.pow(quality, QUALITY_EXP[exponentIndex]));
  }

  function playerStats(lead, species) {
    const live = {
      hp: liveStat(lead, 'hp'), atk: liveStat(lead, 'atk'), def: liveStat(lead, 'def'),
      spAtk: liveStat(lead, 'spa'), spDef: liveStat(lead, 'spd'), speed: liveStat(lead, 'speed')
    };
    if (live.atk > 0 && live.spAtk > 0) return live;
    const level = Math.max(1, finite(lead?.level, 1));
    const bases = [baseStat(species, 'hp'), baseStat(species, 'atk'), baseStat(species, 'def'), baseStat(species, 'spa'), baseStat(species, 'spd'), baseStat(species, 'speed')];
    const values = bases.map((base, index) => statAt(base, IV_PLAYER[index], level, QUALITY_PLAYER, index));
    return { hp: values[0], atk: values[1], def: values[2], spAtk: values[3], spDef: values[4], speed: values[5] };
  }

  function enemyStats(creature) {
    const level = Math.max(1, finite(creature?.huntLevel, creature?.level, 1));
    const bases = [baseStat(creature, 'hp'), baseStat(creature, 'atk'), baseStat(creature, 'def'), baseStat(creature, 'spa'), baseStat(creature, 'spd'), baseStat(creature, 'speed')];
    const values = bases.map((base, index) => statAt(base, IV_WILD, level, QUALITY_ENEMY, index));
    return { hp: values[0], atk: values[1], def: values[2], spAtk: values[3], spDef: values[4], speed: values[5] };
  }

  function reinforcedEffectiveness(moveType, defenderTypes) {
    const attack = compact(moveType);
    const row = TYPE_CHART[attack] || {};
    let multiplier = defenderTypes.reduce((total, type) => total * (row[compact(type)] ?? 1), 1);
    if (multiplier !== 0 && multiplier !== 1) multiplier = multiplier > 1 ? multiplier + (multiplier - 1) * 0.5 : multiplier / 1.5;
    return multiplier;
  }

  function moveList(species, level, includeTM = false) {
    const source = [species?.attacks, species?.moves, species?.skills].find(Array.isArray) || [];
    return source.map(raw => {
      if (typeof raw === 'string') return { name: raw, power: 50, type: species?.type1 || '', category: '', isTM: false };
      if (!raw || typeof raw !== 'object') return null;
      const isTM = Boolean(raw.tm || raw.isTM || raw.machine || raw.technicalMachine);
      if (isTM && !includeTM) return null;
      const learnLevel = finite(raw.learnLevel, raw.level, raw.requiredLevel, raw.unlockLevel, 0);
      if (learnLevel > level) return null;
      return {
        name: pick(raw, ['name', 'moveName', 'move', 'id'], 'Ataque'),
        power: Math.max(0, finite(raw.power, raw.basePower, raw.damage, raw.dmg, 0)),
        type: pick(raw, ['type', 'element', 'tm'], species?.type1 || ''),
        category: norm(pick(raw, ['category', 'damageClass', 'class'], '')),
        isTM
      };
    }).filter(move => move && move.power > 0);
  }

  function bestMoveDamage(lead, species, target, includeTM = false) {
    const level = Math.max(1, finite(lead?.level, 1));
    const pStats = playerStats(lead, species);
    const eStats = enemyStats(target);
    const defenderTypes = creatureTypes(target);
    const moves = moveList(species, level, includeTM);
    let best = { damage: 0, move: 'Sin ataque válido', type: '', eff: 0, special: false, isTM: false };
    for (const move of moves) {
      const special = /special|especial|spa/.test(move.category);
      const attack = Math.max(1, special ? pStats.spAtk : pStats.atk);
      const defense = Math.max(1, special ? eStats.spDef : eStats.def);
      const eff = reinforcedEffectiveness(move.type, defenderTypes);
      const damage = Math.max(0, move.power * attack * eff * DAMAGE_MULTIPLIER / (DAMAGE_DENOMINATOR * (1 + defense / 100)));
      if (damage > best.damage) best = { damage, move: move.name, type: move.type, eff, special, isTM: move.isTM };
    }
    return { ...best, pStats, eStats };
  }

  function piwKillsPerHour(productivity, pokeId, hits) {
    const table = productivity?.speeds?.[String(pokeId)];
    const count = Math.max(1, hits);
    if (!table) {
      if (productivity?.fallback) {
        if (count >= 8) return FALLBACK_SPEEDS.hit8 * Math.pow(8 / count, 2);
        const lower = Math.floor(count);
        const upper = Math.ceil(count);
        const lowValue = FALLBACK_SPEEDS[`hit${lower}`] || FALLBACK_SPEEDS.hit8;
        const highValue = FALLBACK_SPEEDS[`hit${upper}`] || lowValue;
        return lower === upper ? lowValue : lowValue + (highValue - lowValue) * (count - lower);
      }
      const milliseconds = Math.max(SPAWN_FLOOR_MS, FIRST_HIT_MS + Math.max(0, Math.ceil(count) - 1) * ATTACK_INTERVAL_MS);
      return 3600 / (milliseconds / 1000);
    }
    if (count >= 8) return table.hit8 * Math.pow(8 / count, 2);
    const lower = Math.floor(count);
    const upper = Math.ceil(count);
    const lowValue = table[`hit${lower}`] ?? table.hit8;
    const highValue = table[`hit${upper}`] ?? lowValue;
    return lower === upper ? lowValue : lowValue + (highValue - lowValue) * (count - lower);
  }

  function modelHunt(hunt, lead, species, productivity, includeTM = false) {
    const creature = hunt.creature || {};
    const offense = bestMoveDamage(lead, species, creature, includeTM);
    const totalHp = Math.max(1, offense.eStats.hp * HP_TOTAL_MULT * HP_HUNT_MULT);
    const hits = offense.damage > 0 ? Math.max(1, totalHp / offense.damage) : Infinity;
    const pokeId = pick(creature, ['pokeId', 'speciesId', 'id'], null);
    const kph = Number.isFinite(hits) ? piwKillsPerHour(productivity, pokeId, hits) : 0;
    return {
      level: Math.max(1, finite(hunt.marker?.level, hunt.marker?.lvl, hunt.marker?.minLevel, creature?.huntLevel, 1)),
      offense: { move: offense.move, eff: offense.eff, type: offense.type, isTM: offense.isTM },
      best: { move: offense.move, eff: offense.eff, type: offense.type, isTM: offense.isTM },
      difficulty: hits,
      hits,
      kph,
      estimated: !productivity?.speeds?.[String(pokeId)]
    };
  }

  function lootEntries(creature) {
    return Array.isArray(creature?.loot) ? creature.loot : [];
  }

  function lootChance(entry) {
    const raw = Number(pick(entry, ['chance', 'dropRate', 'rate', 'probability', 'percent', 'pct'], NaN));
    if (!Number.isFinite(raw) || raw < 0) return null;
    if (raw <= 1) return raw;
    if (raw <= 100) return raw / 100;
    return raw / 100000;
  }

  function itemFromLoot(entry, data) {
    if (typeof entry === 'string') return data.itemsByName?.get(norm(entry)) || null;
    const id = pick(entry, ['itemId', 'id', 'item.id'], null);
    if (id !== null) return data.itemsById?.get(String(id)) || data.itemsById?.get(id) || null;
    const name = pick(entry, ['name', 'itemName', 'item.name'], '');
    return name ? data.itemsByName?.get(norm(name)) || null : null;
  }

  const RARE_CHANCE_LIMIT = 0.10;

  function rareDropWeight(chance) {
    const value = Number(chance);
    if (!Number.isFinite(value) || value <= 0 || value > RARE_CHANCE_LIMIT) return 0;
    return 1 + Math.max(0, Math.log10(RARE_CHANCE_LIMIT / value));
  }

  function expectedLoot(creature, data, multiplier = 1) {
    let units = 0;
    let rareUnits = 0;
    let gold = 0;
    let known = 0;
    let rareKnown = 0;
    const entries = lootEntries(creature);
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const chance = lootChance(entry);
      if (chance === null) continue;
      const minimum = finite(entry.minCount, entry.minQty, entry.min, entry.quantityMin, entry.qty, entry.quantity, 1);
      const maximum = finite(entry.maxCount, entry.maxQty, entry.max, entry.quantityMax, entry.qty, entry.quantity, minimum);
      const average = Math.max(0, (minimum + maximum) / 2);
      const expected = chance * average * multiplier;
      const rarityWeight = rareDropWeight(chance);
      const item = itemFromLoot(entry, data);
      const npc = finite(item?.npcPrice, item?.sellValue, item?.value, entry?.npcPrice, 0);
      units += expected;
      if (rarityWeight > 0) {
        rareUnits += expected * rarityWeight;
        rareKnown++;
      }
      gold += expected * npc;
      known++;
    }
    return { units, rareUnits, gold, known, rareKnown, total: entries.length };
  }

  function canonicalTypesFromText(value) {
    const text = ` ${norm(value)} `;
    const found = [];
    for (const [type, aliases] of Object.entries(TYPE_ALIASES)) {
      if (aliases.some(alias => text.includes(` ${norm(alias)} `))) found.push(type);
    }
    return found;
  }

  function flattenPrimitives(value, depth = 0, output = []) {
    if (depth > 4 || output.length > 80 || value == null) return output;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      output.push(String(value));
      return output;
    }
    if (Array.isArray(value)) {
      value.slice(0, 30).forEach(item => flattenPrimitives(item, depth + 1, output));
      return output;
    }
    if (typeof value === 'object') {
      Object.entries(value).slice(0, 60).forEach(([key, item]) => {
        output.push(key);
        flattenPrimitives(item, depth + 1, output);
      });
    }
    return output;
  }

  function dailyCandidateFromText(value, source = 'desconocido', path = '') {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const normalized = norm(raw);
    const types = canonicalTypesFromText(normalized);
    if (!types.length) return null;
    const hasDaily = /\b(daily|today|hoje|diario|diaria|bonus|boost|featured|tipo do dia|tipo del dia|type of the day|elemento do dia|elemento del dia)\b/.test(normalized);
    if (types.length > 3 && !hasDaily) return null;
    const hasTwenty = /(^|\D)\+?\s*20\s*%?($|\D)/.test(raw) || /(^|\D)20\s*por\s*ciento($|\D)/i.test(raw);
    const hasXp = /\b(xp|exp|experiencia|experience)\b/.test(normalized);
    const hasLoot = /\b(loot|drop|saque|botin|itens|items)\b/.test(normalized);
    const hasMultiplier = /\b(1[.,]2|x\s*1[.,]2|multiplier|multiplicador)\b/.test(normalized);
    const strong = (hasDaily && (hasTwenty || hasXp || hasLoot || hasMultiplier)) || (hasTwenty && (hasXp || hasLoot)) || (hasMultiplier && hasDaily);
    if (!strong) return null;
    const score = (hasDaily ? 7 : 0) + (hasTwenty ? 7 : 0) + (hasXp ? 2 : 0) + (hasLoot ? 2 : 0) + (hasMultiplier ? 3 : 0) + Math.min(2, types.length);
    return { score, types: [...new Set(types)], source, path, text: raw.slice(0, 1200) };
  }

  function rememberLiveDailyCandidate(candidate) {
    if (!candidate) return false;
    const cycle = madridDailyCycleKey();
    liveDailyCandidates = liveDailyCandidates.filter(row => row.cycle === cycle && Date.now() - row.at < 6 * 60 * 60 * 1000);
    const signature = `${candidate.source}|${candidate.path}|${candidate.types.slice().sort().join(',')}|${candidate.score}`;
    if (!liveDailyCandidates.some(row => row.signature === signature)) {
      liveDailyCandidates.push({ ...candidate, cycle, at: Date.now(), signature });
      liveDailyCandidates.sort((a, b) => b.score - a.score);
      liveDailyCandidates = liveDailyCandidates.slice(0, 12);
    }
    return true;
  }

  function inspectDailyPayload(payload, source = 'juego', path = '') {
    if (payload == null) return [];
    const candidates = [];
    let payloadSize = 0;
    try { payloadSize = JSON.stringify(payload).length; } catch {}
    const allowGeneric = !/^API/.test(source) || payloadSize <= 12000;
    if (allowGeneric) {
      const full = flattenPrimitives(payload, 0, []).join(' ');
      const generic = dailyCandidateFromText(`${path} ${full}`, source, path);
      if (generic) candidates.push(generic);
    }

    const relevantKey = /(daily|today|hoje|diari|bonus|bônus|boost|featured|type.*day|day.*type|hunt.*type|type.*hunt|element.*day|day.*element)/i;
    const seen = new WeakSet();
    function walk(value, currentPath = path, depth = 0) {
      if (depth > 7 || value == null || typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        const nextPath = currentPath ? `${currentPath}.${key}` : key;
        if (relevantKey.test(key) || relevantKey.test(nextPath)) {
          const text = flattenPrimitives(child, 0, []).join(' ');
          const candidate = dailyCandidateFromText(`${nextPath} ${text}`, source, nextPath);
          if (candidate) candidates.push(candidate);
        }
        if (child && typeof child === 'object') walk(child, nextPath, depth + 1);
      }
    }
    walk(payload, path, 0);
    candidates.forEach(rememberLiveDailyCandidate);
    return candidates;
  }

  function collectDailyContexts() {
    const contexts = [];
    const ws = window.__poke?.ws || {};
    const api = window.__poke?.api || {};

    for (const [eventType, payload] of Object.entries(ws)) {
      contexts.push(...inspectDailyPayload(payload, 'WebSocket del juego', `ws.${eventType}`));
    }
    for (const [endpoint, payload] of Object.entries(api)) {
      contexts.push(...inspectDailyPayload(payload, 'API del juego', `api.${endpoint}`));
    }

    for (const storage of [localStorage, sessionStorage]) {
      try {
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (!key || key.startsWith(NS) || /^(pg-|pokegrid|tampermonkey|userscript)/i.test(key)) continue;
          const value = storage.getItem(key) || '';
          const candidate = dailyCandidateFromText(`${key} ${value}`, 'almacenamiento del juego', key);
          if (candidate) contexts.push(candidate);
        }
      } catch {}
    }

    try {
      const elements = [...document.querySelectorAll('body *')].slice(0, 5000);
      for (const element of elements) {
        if (element.closest?.('[id^="pg-hunt-item-unified"],[id^="pg-best-hunt"],[id^="pg-item-finder"]')) continue;
        if (element.children.length > 5) continue;
        const attrs = [
          element.textContent,
          element.getAttribute?.('title'),
          element.getAttribute?.('aria-label'),
          element.getAttribute?.('data-tooltip'),
          element.getAttribute?.('alt'),
          element.getAttribute?.('src'),
          typeof element.className === 'string' ? element.className : '',
          element.id
        ].filter(Boolean).join(' ');
        if (!attrs || attrs.length > 1600) continue;
        const candidate = dailyCandidateFromText(attrs, 'interfaz del juego', element.id ? `#${element.id}` : element.tagName?.toLowerCase?.() || 'elemento');
        if (candidate) contexts.push(candidate);
      }
    } catch {}

    contexts.push(...liveDailyCandidates.filter(row => row.cycle === madridDailyCycleKey()));
    return contexts;
  }

  function attachDailySocketWatcher() {
    const socket = window.__poke?.sock;
    if (!socket || socket === dailySocket || typeof socket.addEventListener !== 'function') return false;
    if (dailySocket && dailySocketListener) {
      try { dailySocket.removeEventListener('message', dailySocketListener); } catch {}
    }
    dailySocket = socket;
    dailySocketListener = event => {
      try {
        if (typeof event.data !== 'string') return;
        const payload = JSON.parse(event.data);
        const eventType = payload?.type || 'mensaje';
        const candidates = inspectDailyPayload(payload, 'WebSocket en directo', `ws.live.${eventType}`);
        if (candidates.length) checkDailyCycleAndDetection();
      } catch {}
    };
    try { socket.addEventListener('message', dailySocketListener); return true; } catch { return false; }
  }

  function getDailySetting() {
    ensureDailyCycle();
    try { return localStorage.getItem(DAILY_KEY) || 'auto'; } catch { return 'auto'; }
  }

  function setDailySetting(value) {
    const allowed = ['auto', 'none', ...Object.keys(TYPE_LABELS)];
    const next = allowed.includes(value) ? value : 'auto';
    try {
      localStorage.setItem(DAILY_DAY_KEY, madridDailyCycleKey());
      localStorage.setItem(DAILY_KEY, next);
      if (next !== 'auto') localStorage.removeItem(DAILY_DETECTED_KEY);
    } catch {}
    return next;
  }

  function getUseTM() {
    try {
      const stored = localStorage.getItem(TM_KEY);
      return stored === '1' || stored === 'true';
    } catch { return false; }
  }

  function setUseTM(value) {
    const enabled = Boolean(value);
    try { localStorage.setItem(TM_KEY, enabled ? '1' : '0'); } catch {}
    return enabled;
  }

  function detectDailyBonus() {
    ensureDailyCycle();
    attachDailySocketWatcher();
    const setting = getDailySetting();
    if (setting === 'none') {
      lastDailyDiagnostics = { cycle: madridDailyCycleKey(), checkedAt: Date.now(), detected: true, types: [], source: 'manual', path: '', score: 0, candidates: [] };
      return { setting, types: [], source: 'desactivado manualmente', detected: true, multiplier: 1 };
    }
    if (TYPE_LABELS[setting]) {
      lastDailyDiagnostics = { cycle: madridDailyCycleKey(), checkedAt: Date.now(), detected: true, types: [setting], source: 'manual', path: '', score: 999, candidates: [] };
      return { setting, types: [setting], source: 'selección manual', detected: true, multiplier: DAILY_MULT };
    }

    const candidates = collectDailyContexts().filter(Boolean).sort((a, b) => b.score - a.score);
    const best = candidates[0] || null;
    if (best) {
      saveDetectedDaily(best.types, best.score);
      lastDailyDiagnostics = {
        cycle: madridDailyCycleKey(), checkedAt: Date.now(), detected: true,
        types: [...best.types], source: best.source || '', path: best.path || '', score: best.score || 0,
        candidates: candidates.slice(0, 5).map(row => ({ types: row.types, source: row.source, path: row.path, score: row.score }))
      };
      return { setting, types: best.types, source: `detectado en ${best.source}`, detected: true, multiplier: DAILY_MULT };
    }
    const cached = readDetectedDaily();
    if (cached) {
      lastDailyDiagnostics = { cycle: madridDailyCycleKey(), checkedAt: Date.now(), detected: true, types: cached.types, source: 'caché diaria', path: '', score: cached.score || 0, candidates: [] };
      return { setting, types: cached.types, source: 'detección automática guardada del día', detected: true, multiplier: DAILY_MULT };
    }
    lastDailyDiagnostics = { cycle: madridDailyCycleKey(), checkedAt: Date.now(), detected: false, types: [], source: '', path: '', score: 0, candidates: [] };
    return { setting, types: [], source: 'no detectado', detected: false, multiplier: 1 };
  }

  function dailyDetectionSignature(daily) {
    return `${madridDailyCycleKey()}|${daily?.setting || ''}|${(daily?.types || []).slice().sort().join(',')}`;
  }

  function checkDailyCycleAndDetection() {
    const reset = ensureDailyCycle();
    const daily = detectDailyBonus();
    const signature = dailyDetectionSignature(daily);
    const changed = signature !== lastDetectedDailySignature;
    lastDetectedDailySignature = signature;
    if (reset || changed) {
      try { window.dispatchEvent(new CustomEvent('pokegrid-daily-bonus-updated', { detail: { reset, types: daily.types || [] } })); } catch {}
    }
    return daily;
  }

  function startDailyWatcher() {
    ensureDailyCycle();
    attachDailySocketWatcher();
    checkDailyCycleAndDetection();
    clearInterval(dailyWatcherTimer);
    dailyWatcherTimer = setInterval(() => {
      attachDailySocketWatcher();
      checkDailyCycleAndDetection();
    }, DAILY_CHECK_MS);
  }

  function dailyApplies(creature, daily) {
    if (!daily?.types?.length) return false;
    const targetTypes = creatureTypes(creature);
    return daily.types.some(type => targetTypes.includes(type));
  }

  function creatureExperience(creature) {
    return Math.max(0, finite(pick(creature, ['experience', 'xp', 'exp', 'experienceYield', 'baseExperience'], 0), 0));
  }

  function autoCatchInfo(data) {
    const character = window.__poke?.api?.['/api/characters/me']?.character || {};
    const id = character.autoCatchBallId || window.__poke?.ws?.['catch-result']?.ballId || null;
    const item = id !== null ? data.itemsById?.get(String(id)) || data.itemsById?.get(id) : null;
    return { active: Boolean(character.autoCatchBallId), ballId: id, ballPrice: finite(item?.npcPrice, item?.priceGold, item?.price, 0) };
  }

  function isUnlocked(hunt, lead) {
    const required = Math.max(1, finite(hunt.marker?.level, hunt.marker?.lvl, hunt.marker?.minLevel, hunt.creature?.huntLevel, 1));
    return required <= Math.max(1, finite(lead?.level, 1));
  }

  function scoreRows(rows, cfg) {
    const maximum = key => Math.max(0, ...rows.map(row => finite(row[key], 0)));
    const maxXp = maximum('xph');
    const maxLoot = maximum('lootPh');
    const maxRare = maximum('rarePh');
    const maxGold = maximum('netGoldPh');
    const totalWeight = Math.max(1,
      finite(cfg.xpWeight) + finite(cfg.lootWeight) + finite(cfg.rareWeight) + finite(cfg.goldWeight)
    );
    rows.forEach(row => {
      row.generalScore = 100 * (
        (maxXp ? row.xph / maxXp : 0) * finite(cfg.xpWeight) +
        (maxLoot ? row.lootPh / maxLoot : 0) * finite(cfg.lootWeight) +
        (maxRare ? row.rarePh / maxRare : 0) * finite(cfg.rareWeight) +
        (maxGold ? row.netGoldPh / maxGold : 0) * finite(cfg.goldWeight)
      ) / totalWeight;
    });
  }

  async function calculatePiwRecommendations(force = false) {
    const [data, productivity] = await Promise.all([ItemCore.loadData(force), loadProductivity(force)]);
    const lead = getLeadPokemon();
    if (!lead) throw new Error('No encuentro ningún Pokémon equipado en el primer slot.');
    const leadSpecies = findLeadSpecies(lead, data);
    if (!leadSpecies) throw new Error(`No encuentro los datos de ${lead.name || 'tu Pokémon'} en creatures.json.`);
    const daily = detectDailyBonus();
    const cfg = HuntCore.getConfig();
    const useTM = Boolean(cfg.useTM);
    const vipActive = getVip();
    const vipMultiplier = vipActive ? VIP_MULT : 1;
    const catchInfo = autoCatchInfo(data);

    const rows = data.hunts.filter(hunt => isUnlocked(hunt, lead)).map(hunt => {
      const diff = modelHunt(hunt, lead, leadSpecies, productivity, useTM);
      const boosted = dailyApplies(hunt.creature, daily);
      const dailyMultiplier = boosted ? DAILY_MULT : 1;
      const xpMultiplier = vipMultiplier * dailyMultiplier;
      const loot = expectedLoot(hunt.creature, data, dailyMultiplier);
      const theoreticalKph = diff.kph;
      const theoreticalXph = theoreticalKph * creatureExperience(hunt.creature) * xpMultiplier;
      const exact = personalIntelligence(lead, hunt, diff, boosted, vipActive);
      const personalKph = Math.max(0, finite(exact?.kph, 0));
      const personalXph = Math.max(0, finite(exact?.currentXph, 0));
      const usePersonal = Boolean(exact && personalKph > 0 && personalXph > 0);
      const effectiveKph = usePersonal ? personalKph : theoreticalKph;
      const effectiveXph = usePersonal ? personalXph : theoreticalXph;
      const lootPh = effectiveKph * loot.units;
      const rarePh = effectiveKph * loot.rareUnits;
      const netGoldPh = effectiveKph * loot.gold;
      const sourceParts = [productivity.source, `${diff.hits.toFixed(2)} golpes`];
      if (diff.estimated) sourceParts.push('velocidad aproximada');
      if (vipActive) sourceParts.push('VIP ×1,50');
      if (boosted) sourceParts.push('+20% diario');
      if (diff.offense.isTM) sourceParts.push('mejor ataque: MT');
      sourceParts.push(usePersonal ? `ranking: tu histórico (${exact.confidence})` : 'ranking: PIWTools');
      return {
        hunt, diff, measured: exact || null, source: sourceParts.join(' · '),
        kph: effectiveKph, theoreticalKph,
        xpPerKill: creatureExperience(hunt.creature), xph: effectiveXph,
        theoreticalXph, effectiveXph,
        lootPh, rarePh, capturePh: 0, captureGoldPh: 0, supplyGoldPh: 0, netGoldPh,
        lootDataKnown: loot.known, rareLootKnown: loot.rareKnown, lootDataTotal: loot.total,
        dailyBoosted: boosted, vipActive, vipMultiplier,
        calibration: null, personal: usePersonal ? exact : null, personalKph, personalXph,
        rankingSource: usePersonal ? 'historico-real' : 'piwtools'
      };
    }).filter(row => Number.isFinite(row.kph) && row.kph > 0 && Number.isFinite(row.xph));

    scoreRows(rows, cfg);
    rows.sort((a, b) => cfg.mode === 'general'
      ? b.generalScore - a.generalScore || b.xph - a.xph
      : b.xph - a.xph || b.netGoldPh - a.netGoldPh);

    return {
      rows, lead, leadSpecies, catchInfo, captureRate: 0, data, dailyBonus: daily, useTM,
      vipActive, vipMultiplier,
      productivity: {
        source: productivity.source, version: productivity.version,
        updatedAt: productivity.updatedAt, count: Object.keys(productivity.speeds || {}).length,
        fallback: Boolean(productivity.fallback), stale: Boolean(productivity.stale)
      }
    };
  }

  function findItem(query, data) {
    const key = norm(query);
    if (!key) return null;
    if (data.itemsByName?.has(key)) return data.itemsByName.get(key);
    const starts = data.items.filter(item => norm(item.name).startsWith(key));
    if (starts.length) return starts.sort((a, b) => a.name.length - b.name.length)[0];
    return data.items.filter(item => norm(item.name).includes(key)).sort((a, b) => a.name.length - b.name.length)[0] || null;
  }

  function lootMatches(entry, item, data) {
    const found = itemFromLoot(entry, data);
    if (found && String(found.id) === String(item.id)) return true;
    const name = typeof entry === 'string' ? entry : pick(entry, ['name', 'itemName', 'item.name'], found?.name || '');
    return norm(name) === norm(item.name);
  }

  async function searchItemWithPiw(query, force = false) {
    const [data, productivity] = await Promise.all([ItemCore.loadData(force), loadProductivity(force)]);
    const item = findItem(query, data);
    if (!item) throw new Error(`No encuentro un item llamado “${query}”.`);
    const lead = getLeadPokemon();
    if (!lead) throw new Error('No encuentro el Pokémon equipado en el primer slot.');
    const species = findLeadSpecies(lead, data);
    if (!species) throw new Error(`No encuentro los datos de ${lead.name || 'tu Pokémon'}.`);
    const daily = detectDailyBonus();
    const cfg = HuntCore.getConfig();
    const useTM = Boolean(cfg.useTM);
    const vipActive = getVip();

    const rows = [];
    for (const hunt of data.hunts.filter(candidate => isUnlocked(candidate, lead))) {
      const matching = lootEntries(hunt.creature).filter(entry => lootMatches(entry, item, data));
      if (!matching.length) continue;
      const combat = modelHunt(hunt, lead, species, productivity, useTM);
      const boosted = dailyApplies(hunt.creature, daily);
      const multiplier = boosted ? DAILY_MULT : 1;
      const calibration = personalCalibration(lead, hunt, combat);
      const exact = personalIntelligence(lead, hunt, combat, boosted, vipActive);
      const effectiveKph = Math.max(0, finite(exact?.kph, calibration ? combat.kph * calibration.factor : 0, combat.kph));
      let expected = 0;
      let known = false;
      let bestChance = 0;
      for (const entry of matching) {
        if (!entry || typeof entry !== 'object') continue;
        const chance = lootChance(entry);
        if (chance === null) continue;
        const minimum = finite(entry.minCount, entry.minQty, entry.min, entry.quantityMin, entry.qty, entry.quantity, 1);
        const maximum = finite(entry.maxCount, entry.maxQty, entry.max, entry.quantityMax, entry.qty, entry.quantity, minimum);
        expected += chance * Math.max(0, (minimum + maximum) / 2) * multiplier;
        bestChance = Math.max(bestChance, chance * multiplier);
        known = true;
      }
      const perKill = known ? expected : null;
      const itemsPh = perKill === null ? null : perKill * effectiveKph;
      rows.push({
        hunt, combat, observed: exact || null, kph: effectiveKph, theoreticalKph: combat.kph, perKill, itemsPh,
        bestChance, theoreticalKnown: known, dailyBoosted: boosted,
        source: `${productivity.source}${boosted ? ' · +20% diario' : ''}`
      });
    }

    rows.sort((a, b) => {
      const aKnown = a.itemsPh !== null ? 1 : 0;
      const bKnown = b.itemsPh !== null ? 1 : 0;
      if (aKnown !== bKnown) return bKnown - aKnown;
      if (a.itemsPh !== null && b.itemsPh !== null && Math.abs(b.itemsPh - a.itemsPh) > 0.0001) return b.itemsPh - a.itemsPh;
      if (Math.abs(b.bestChance - a.bestChance) > 0.000001) return b.bestChance - a.bestChance;
      return b.kph - a.kph;
    });

    return {
      item, lead, rows, data, dailyBonus: daily, useTM, vipActive,
      productivity: {
        source: productivity.source, version: productivity.version,
        updatedAt: productivity.updatedAt, count: Object.keys(productivity.speeds || {}).length,
        fallback: Boolean(productivity.fallback), stale: Boolean(productivity.stale)
      }
    };
  }

  const originalGetConfig = HuntCore.getConfig.bind(HuntCore);
  HuntCore.getConfig = () => ({ ...originalGetConfig(), dailyType: getDailySetting(), useTM: getUseTM(), vipActive: getVip() });
  HuntCore.setDailyType = setDailySetting;
  HuntCore.getDailyType = getDailySetting;
  HuntCore.setUseTM = setUseTM;
  HuntCore.getUseTM = getUseTM;
  HuntCore.setVip = setVip;
  HuntCore.getVip = getVip;
  HuntCore.getDailyLabels = () => ({ ...TYPE_LABELS });
  HuntCore.calculateRecommendations = calculatePiwRecommendations;
  ItemCore.searchItem = searchItemWithPiw;

  window.__PGPiwToolsEngine = {
    loadProductivity,
    detectDailyBonus,
    setDailyType: setDailySetting,
    getDailyType: getDailySetting,
    setUseTM,
    getUseTM,
    setVip,
    getVip,
    accountIdentity,
    typeLabels: { ...TYPE_LABELS },
    dailyCycleKey: madridDailyCycleKey,
    getCalibrationCount: () => Object.keys(readJson(CALIBRATION_KEY, {})).length,
    vipMultiplier: VIP_MULT,
    isDailySettingValid: () => {
      const setting = getDailySetting();
      return setting === 'auto' || setting === 'none' || Boolean(TYPE_LABELS[setting]);
    },
    startDailyWatcher,
    getDailyDiagnostics: () => ({ ...lastDailyDiagnostics, types: [...(lastDailyDiagnostics.types || [])], candidates: [...(lastDailyDiagnostics.candidates || [])] })
  };

  // El observador pertenece al motor, donde existen todas sus dependencias internas.
  // Arrancarlo aquí evita depender del ámbito de la interfaz y garantiza el reinicio
  // de ciclo aunque el botón todavía no se haya instalado.
  startDailyWatcher();

  console.info('[Hunt Intelligence] Motor v1.1.18 cargado: Hunts usan histórico real o PIWTools, con peso de drops raros.');
})();


(() => {
  'use strict';
  if (window.__pgHuntIntelligenceSupervisorV1118) return;
  window.__pgHuntIntelligenceSupervisorV1118 = true;

  const NS = 'pg-hunt-intelligence-v1';
  const SEGMENTS_KEY = `${NS}:segments`;
  const CALIBRATION_KEY = `${NS}:calibration`;
  const CONFIG_KEY = `${NS}:supervisor-config`;
  const ACTIVE_SAMPLE_KEY = `${NS}:active-sample`;
  const MIGRATION_KEY = `${NS}:migration-v1`;
  const OLD_SEGMENTS_KEY = 'pg-performance-supervisor-v2:segments';
  const OLD_CALIBRATION_KEY = 'pg-performance-supervisor-v2:calibration';
  const DAILY_MULT = 1.20;
  const VIP_MULT = 1.50;
  const INACTIVITY_MS = 3 * 60 * 1000;
  const FIXED_MIN_MINUTES = 30;
  const SAMPLE_WINDOW_SECONDS = FIXED_MIN_MINUTES * 60;
  const SAMPLE_WINDOW_MS = SAMPLE_WINDOW_SECONDS * 1000;
  const SAMPLE_CHECKPOINT_MS = 2000;
  const WINDOW_MIGRATION_KEY = `${NS}:fixed-window-v1`;
  const DEFAULT_CONFIG = { threshold: 80, minMinutes: FIXED_MIN_MINUTES, minKills: 30, refreshSeconds: 15 };

  const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[_-]+/g, ' ').replace(/\[[^\]]*]/g, '').replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const compact = value => norm(value).replace(/\s+/g, '');
  const finite = (...values) => { for (const value of values) { const n = Number(value); if (Number.isFinite(n)) return n; } return 0; };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const fmt = (value, decimals = 0) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => { try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); } };
  function loadJson(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? clone(fallback); } catch { return clone(fallback); } }
  function saveJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

  let config = { ...DEFAULT_CONFIG, ...(loadJson(CONFIG_KEY, {}) || {}) };
  config.minMinutes = FIXED_MIN_MINUTES;
  let segments = Array.isArray(loadJson(SEGMENTS_KEY, [])) ? loadJson(SEGMENTS_KEY, []) : [];
  let calibrationRegistry = loadJson(CALIBRATION_KEY, {}) || {};
  let activeSample = loadJson(ACTIVE_SAMPLE_KEY, null);
  if (!activeSample || typeof activeSample !== 'object' || Array.isArray(activeSample)) activeSample = null;
  let restoredActiveSample = Boolean(activeSample);
  let lastReport = null;
  let lastResetReason = '';
  let lastHistoryPokemonKey = '';
  let busy = false;
  let timer = null;
  let sampleCheckpointTimer = null;
  let historyPokemonTimer = null;
  let contextRefreshPending = false;

  function accountId() {
    const character = window.__poke?.api?.['/api/characters/me']?.character || {};
    return compact(character.id || character.characterId || character.name || 'cuenta-local') || 'cuenta-local';
  }

  function migrateLegacy() {
    if (localStorage.getItem(MIGRATION_KEY) === '1') return;
    if (!segments.length) {
      const legacy = loadJson(OLD_SEGMENTS_KEY, []);
      if (Array.isArray(legacy)) {
        segments = legacy.map(row => ({
          ...row,
          accountId: row.accountId || accountId(),
          vipKnown: false,
          vipActive: null,
          cleanBaseXph: null,
          legacyBaseXph: Math.max(0, finite(row.baseXph)),
          importedLegacy: true
        })).slice(-800);
      }
    }
    if (!Object.keys(calibrationRegistry).length) {
      const legacyCal = loadJson(OLD_CALIBRATION_KEY, {});
      if (legacyCal && typeof legacyCal === 'object') {
        for (const [key, row] of Object.entries(legacyCal)) {
          calibrationRegistry[key] = {
            factor: finite(row.factor, 1), weightedFactor: finite(row.weightedFactor),
            totalSeconds: finite(row.totalSeconds), totalKills: finite(row.totalKills),
            totalCleanXp: 0, cleanXpKnown: false, samples: finite(row.samples), updatedAt: finite(row.updatedAt),
            leadName: row.leadName || '', huntName: row.huntName || '', move: row.move || '', tm: Boolean(row.tm), importedLegacy: true
          };
        }
      }
    }
    persist();
    try { localStorage.setItem(MIGRATION_KEY, '1'); } catch {}
  }

  function persistActiveSample() {
    try {
      if (activeSample) {
        activeSample.savedAt = Date.now();
        localStorage.setItem(ACTIVE_SAMPLE_KEY, JSON.stringify(activeSample));
      } else {
        localStorage.removeItem(ACTIVE_SAMPLE_KEY);
      }
    } catch {}
  }

  function persist() {
    config.minMinutes = FIXED_MIN_MINUTES;
    segments = segments.slice(-800);
    saveJson(SEGMENTS_KEY, segments);
    saveJson(CALIBRATION_KEY, calibrationRegistry);
    saveJson(CONFIG_KEY, config);
    persistActiveSample();
  }

  function addCalibrationRow(row, registry = calibrationRegistry) {
    if (!row?.calibrationValid || !(finite(row.expectedKph) > 0) || !Number.isFinite(Number(row.kph))) return false;
    const key = calibrationKey(row);
    const old = registry[key] || { totalSeconds:0,totalKills:0,weightedFactor:0,totalCleanXp:0,samples:0 };
    const elapsedSeconds = SAMPLE_WINDOW_SECONDS;
    const oldSeconds = Math.max(0, finite(old.totalSeconds));
    const oldWeighted = Math.max(0, finite(old.weightedFactor, finite(old.factor) * oldSeconds));
    const factor = clamp(finite(row.kph) / finite(row.expectedKph), 0.60, 1.60);
    const totalSeconds = oldSeconds + elapsedSeconds;
    registry[key] = {
      factor: totalSeconds ? (oldWeighted + factor * elapsedSeconds) / totalSeconds : factor,
      weightedFactor: oldWeighted + factor * elapsedSeconds,
      totalSeconds,
      totalKills: Math.max(0, finite(old.totalKills)) + Math.max(0, finite(row.kills)),
      totalCleanXp: Math.max(0, finite(old.totalCleanXp)) + Math.max(0, finite(row.cleanBaseXph)) * (elapsedSeconds / 3600),
      cleanXpKnown: Boolean(old.cleanXpKnown || (row.vipKnown === true && Number.isFinite(Number(row.cleanBaseXph)))),
      samples: Math.max(0, finite(old.samples)) + 1,
      updatedAt: Math.max(finite(old.updatedAt), finite(row.end, Date.now())),
      leadName: row.leadName || '', huntName: row.huntName || '', move: row.move || '', tm: Boolean(row.tm)
    };
    return true;
  }

  function rebuildCalibrationRegistry() {
    const rebuilt = {};
    segments.forEach(row => addCalibrationRow(row, rebuilt));
    calibrationRegistry = rebuilt;
  }

  function migrateToFixedWindows() {
    config.minMinutes = FIXED_MIN_MINUTES;
    try {
      if (localStorage.getItem(WINDOW_MIGRATION_KEY) === '1') { persist(); return; }
    } catch {}

    const converted = [];
    for (const sourceRow of segments) {
      const elapsed = Math.max(0, finite(sourceRow.elapsedSeconds));
      const windows = Math.floor((elapsed + 0.0001) / SAMPLE_WINDOW_SECONDS);
      if (windows < 1) continue;
      const sourceEnd = finite(sourceRow.end);
      const sourceStart = finite(sourceRow.start) || (sourceEnd > 0 ? sourceEnd - elapsed * 1000 : Date.now() - elapsed * 1000);
      const totalKills = Math.max(0, finite(sourceRow.kills));
      const totalXp = Math.max(0, finite(sourceRow.xp, finite(sourceRow.rawXph) * elapsed / 3600));
      const killsPerSecond = elapsed ? totalKills / elapsed : 0;
      const xpPerSecond = elapsed ? totalXp / elapsed : 0;
      for (let index = 0; index < windows; index++) {
        const start = sourceStart + index * SAMPLE_WINDOW_MS;
        const end = start + SAMPLE_WINDOW_MS;
        const kills = killsPerSecond * SAMPLE_WINDOW_SECONDS;
        const xp = xpPerSecond * SAMPLE_WINDOW_SECONDS;
        const kph = kills * 2;
        const rawXph = xp * 2;
        const cleanBaseXph = Number.isFinite(Number(sourceRow.cleanBaseXph))
          ? Number(sourceRow.cleanBaseXph)
          : sourceRow.vipKnown === true
            ? rawXph / (sourceRow.vipActive ? VIP_MULT : 1) / (sourceRow.dailyBoosted ? DAILY_MULT : 1)
            : null;
        converted.push({
          ...sourceRow,
          id: `${Math.round(start)}-${Math.round(end)}-30m`,
          start, end,
          elapsedSeconds: SAMPLE_WINDOW_SECONDS,
          kills, xp, kph, rawXph, cleanBaseXph,
          sampleWindowMinutes: FIXED_MIN_MINUTES,
          calibrationValid: kills >= config.minKills,
          reason: sourceRow.reason || 'migración a muestras fijas de 30 min'
        });
      }
    }
    segments = converted.slice(-800);
    rebuildCalibrationRegistry();
    persist();
    try { localStorage.setItem(WINDOW_MIGRATION_KEY, '1'); } catch {}
  }

  function currentHistoryPokemon() {
    const list = window.__poke?.ws?.pokes?.list;
    if (!Array.isArray(list)) return null;

    const lead = list.filter(pokemon => pokemon?.team)
      .sort((a, b) => finite(a.slot, 99) - finite(b.slot, 99))[0] || null;
    if (!lead) return null;

    const key = compact(
      lead.speciesId
      || lead.pokeId
      || lead.species?.id
      || lead.name
      || ''
    );

    if (!key) return null;
    return {
      key,
      name: String(lead.name || 'Pokémon'),
      level: finite(lead.level)
    };
  }

  function rowMatchesHistoryPokemon(row, pokemon = currentHistoryPokemon()) {
    if (!row || !pokemon?.key) return false;
    const rowKey = compact(row.leadId || row.leadName || '');
    if (rowKey && rowKey === pokemon.key) return true;
    return norm(row.leadName || '') === norm(pokemon.name || '');
  }

  function currentPokemonHistoryRows() {
    const acct = accountId();
    const pokemon = currentHistoryPokemon();
    if (!pokemon) return [];
    return segments.filter(row =>
      row.accountId === acct
      && finite(row.elapsedSeconds) === SAMPLE_WINDOW_SECONDS
      && rowMatchesHistoryPokemon(row, pokemon)
    );
  }

  function currentSlug() { return norm(window.__poke?.ws?.['field-init']?.slug || window.__poke?.lastSlug || window.__poke?.sess?.slug || ''); }
  function rawSession() {
    const session = window.__poke?.sess;
    if (!session?.start) return null;
    return { slug: norm(session.slug || currentSlug()), start: finite(session.start), kills: Math.max(0, finite(session.kills)), xp: Math.max(0, finite(session.xp)) };
  }
  function huntKeys(row) {
    const hunt = row?.hunt || {}, marker = hunt.marker || {}, creature = hunt.creature || {};
    return [...new Set([hunt.slug,hunt.name,hunt.key,marker.slug,marker.hunt,marker.name,marker.pokemonName,creature.slug,creature.name].filter(Boolean).map(norm).filter(Boolean))];
  }
  function findCurrentRow(rows, slug) {
    if (!slug) return null;
    return rows.find(row => huntKeys(row).includes(slug)) || rows.find(row => huntKeys(row).some(key => key && (slug.includes(key) || key.includes(slug)))) || null;
  }
  function contextKey(lead, hunt, diff) {
    const leadKey = compact(lead?.speciesId || lead?.pokeId || lead?.species?.id || lead?.name || 'unknown');
    const huntKey = compact(hunt?.slug || hunt?.marker?.slug || hunt?.marker?.hunt || hunt?.name || hunt?.creature?.slug || hunt?.creature?.name || 'unknown');
    const offense = diff?.offense || diff?.best || {};
    const moveKey = compact(offense.move || offense.name || 'unknown');
    return `${leadKey}|${huntKey}|${moveKey}|${offense.isTM ? 'tm' : 'base'}`;
  }
  function sampleSignature(result, current) {
    const lead = result?.lead || {}, offense = current?.diff?.offense || {};
    const dailyTypes = Array.isArray(result?.dailyBonus?.types) ? result.dailyBonus.types.join(',') : '';
    return [accountId(), compact(currentSlug()), compact(lead.speciesId || lead.pokeId || lead.name || ''), finite(lead.level), compact(offense.move || offense.name || ''), offense.isTM?'tm':'base', current?.dailyBoosted?'daily':'normal', compact(dailyTypes), result?.useTM?'allowtm':'notm', result?.vipActive?'vip':'novip'].join('|');
  }

  function beginSample(raw, result, current, now = Date.now()) {
    const lead = result?.lead || {}, offense = current?.diff?.offense || {};
    activeSample = {
      signature: sampleSignature(result, current), rawStart: raw.start, startedAt: now,
      baseKills: raw.kills, baseXp: raw.xp, lastKills: raw.kills, lastXp: raw.xp, lastProgressAt: now,
      meta: {
        accountId: accountId(), slug: raw.slug || currentSlug(),
        huntKey: current?.hunt?.slug || current?.hunt?.marker?.slug || current?.hunt?.marker?.hunt || current?.hunt?.name || current?.hunt?.creature?.slug || current?.hunt?.creature?.name || raw.slug,
        huntName: current?.hunt?.name || current?.hunt?.creature?.name || raw.slug || 'Hunt',
        leadId: lead.speciesId || lead.pokeId || lead.species?.id || lead.name || '', leadName: lead.name || 'Pokémon', leadLevel: finite(lead.level),
        move: offense.move || offense.name || 'Ataque', tm: Boolean(offense.isTM), useTM: Boolean(result?.useTM),
        dailyBoosted: Boolean(current?.dailyBoosted), dailyTypes: Array.isArray(result?.dailyBonus?.types) ? result.dailyBonus.types.slice() : [],
        vipActive: Boolean(result?.vipActive), vipKnown: true,
        expectedKph: Math.max(0, finite(current?.theoreticalKph, current?.kph)), expectedXph: Math.max(0, finite(current?.theoreticalXph, current?.xph))
      }
    };
    restoredActiveSample = false;
    persistActiveSample();
  }

  function calibrationKey(meta) { return `${compact(meta.leadId || meta.leadName || 'unknown')}|${compact(meta.huntKey || meta.slug || meta.huntName || 'unknown')}|${compact(meta.move || 'unknown')}|${meta.tm?'tm':'base'}`; }

  function createCompletedWindowRow(sample, startAt, endAt, startKills, endKills, startXp, endXp, reason) {
    const kills = Math.max(0, endKills - startKills);
    const xp = Math.max(0, endXp - startXp);
    const kph = kills * 2;
    const rawXph = xp * 2;
    const cleanBaseXph = rawXph / (sample.meta.vipActive ? VIP_MULT : 1) / (sample.meta.dailyBoosted ? DAILY_MULT : 1);
    return {
      id: `${Math.round(startAt)}-${Math.round(endAt)}-30m`,
      start: startAt,
      end: endAt,
      elapsedSeconds: SAMPLE_WINDOW_SECONDS,
      kills,
      xp,
      kph,
      rawXph,
      cleanBaseXph,
      reason,
      sampleWindowMinutes: FIXED_MIN_MINUTES,
      ...sample.meta,
      calibrationValid: kills >= config.minKills
    };
  }

  function collectCompletedWindows(sample, endAt, reason = 'muestra automática de 30 min') {
    if (!sample) return [];
    const safeEnd = Math.max(sample.startedAt, Math.min(endAt, Date.now()));
    const completed = [];
    while (safeEnd - sample.startedAt >= SAMPLE_WINDOW_MS) {
      const span = Math.max(1, safeEnd - sample.startedAt);
      const ratio = Math.min(1, SAMPLE_WINDOW_MS / span);
      const boundary = sample.startedAt + SAMPLE_WINDOW_MS;
      const boundaryKills = sample.baseKills + (sample.lastKills - sample.baseKills) * ratio;
      const boundaryXp = sample.baseXp + (sample.lastXp - sample.baseXp) * ratio;
      const row = createCompletedWindowRow(
        sample, sample.startedAt, boundary,
        sample.baseKills, boundaryKills,
        sample.baseXp, boundaryXp,
        reason
      );
      segments.push(row);
      addCalibrationRow(row);
      completed.push(row);
      sample.startedAt = boundary;
      sample.baseKills = boundaryKills;
      sample.baseXp = boundaryXp;
      lastResetReason = 'muestra de 30 min completada';
    }
    if (completed.length) {
      persist();
      try { window.dispatchEvent(new CustomEvent('pokegrid-intelligence-updated')); } catch {}
    } else {
      persistActiveSample();
    }
    return completed;
  }

  function activeSampleSafeEnd(now = Date.now()) {
    if (!activeSample) return now;
    const lastProgress = Math.max(0, finite(activeSample.lastProgressAt));
    return lastProgress && now - lastProgress > INACTIVITY_MS ? lastProgress : now;
  }

  function finalizeActiveSample(reason = 'cambio detectado', endAt = activeSampleSafeEnd(Date.now())) {
    const sample = activeSample;
    if (!sample) return null;
    const completed = collectCompletedWindows(sample, endAt, reason);
    activeSample = null;
    restoredActiveSample = false;
    persistActiveSample();
    lastResetReason = reason;
    return completed.at(-1) || null;
  }

  function updateActiveSample(result, current) {
    const raw = rawSession();
    if (!raw || !current) return null;
    const now = Date.now(), signature = sampleSignature(result,current);

    if (activeSample && restoredActiveSample) {
      const restoredInvalid = activeSample.meta?.accountId !== accountId()
        || activeSample.rawStart !== raw.start
        || raw.kills < finite(activeSample.lastKills)
        || raw.xp < finite(activeSample.lastXp);
      if (restoredInvalid) {
        activeSample = null;
        restoredActiveSample = false;
        persistActiveSample();
      }
    }

    if (!activeSample) beginSample(raw,result,current,now);
    else if (activeSample.rawStart !== raw.start || raw.kills < activeSample.lastKills || raw.xp < activeSample.lastXp) {
      finalizeActiveSample('reinicio de sesión', activeSampleSafeEnd(now)); beginSample(raw,result,current,now);
    } else if (activeSample.signature !== signature) {
      finalizeActiveSample('cambio de hunt, Pokémon, nivel, ataque, MT, VIP o bonus', activeSampleSafeEnd(now)); beginSample(raw,result,current,now);
    }

    if (!activeSample) return null;
    if (raw.kills > activeSample.lastKills || raw.xp > activeSample.lastXp) activeSample.lastProgressAt = now;
    activeSample.lastKills = raw.kills;
    activeSample.lastXp = raw.xp;
    restoredActiveSample = false;

    const end = activeSampleSafeEnd(now);
    const completedRows = collectCompletedWindows(activeSample, end);
    const elapsedSeconds = Math.max(0,(end-activeSample.startedAt)/1000);
    const kills=Math.max(0,raw.kills-activeSample.baseKills), xp=Math.max(0,raw.xp-activeSample.baseXp), hours=elapsedSeconds/3600;
    persistActiveSample();
    return {
      slug:raw.slug,start:activeSample.startedAt,elapsedSeconds,kills,xp,
      kph:hours?kills/hours:0,xph:hours?xp/hours:0,
      paused:now-activeSample.lastProgressAt>INACTIVITY_MS,
      completedRows:clone(completedRows),
      meta:{...activeSample.meta}
    };
  }

  function confidence(seconds, kills) { return seconds>=7200&&kills>=1000?'alta':seconds>=2400&&kills>=300?'media':'baja'; }

  function getPersonalEstimate({ lead, hunt, diff, dailyBoosted=false, vipActive=false } = {}) {
    const key = contextKey(lead,hunt,diff), level = finite(lead?.level), levelBand = Math.max(25, level*0.10), acct=accountId();
    const rows = segments.filter(row => row.accountId===acct
      && finite(row.elapsedSeconds)===SAMPLE_WINDOW_SECONDS
      && row.vipKnown===true
      && Number.isFinite(Number(row.cleanBaseXph))
      && calibrationKey(row)===key
      && Math.abs(finite(row.leadLevel)-level)<=levelBand);
    if (!rows.length) return null;
    const totalSeconds=rows.length*SAMPLE_WINDOW_SECONDS;
    const totalKills=rows.reduce((sum,row)=>sum+Math.max(0,finite(row.kills)),0);
    if (totalKills<=0) return null;
    const baseXph=rows.reduce((sum,row)=>sum+finite(row.cleanBaseXph),0)/rows.length;
    const kph=rows.reduce((sum,row)=>sum+finite(row.kph),0)/rows.length;
    return { source:'historico-real', baseXph, currentXph:baseXph*(vipActive?VIP_MULT:1)*(dailyBoosted?DAILY_MULT:1), kph, samples:rows.length,totalSeconds,totalKills,confidence:confidence(totalSeconds,totalKills),levelBand };
  }

  function getCalibration({ lead, hunt, diff } = {}) {
    const row=calibrationRegistry[contextKey(lead,hunt,diff)];
    if (!row || !Number.isFinite(Number(row.factor))) return null;
    const seconds=Math.max(0,finite(row.totalSeconds)),kills=Math.max(0,finite(row.totalKills)),samples=Math.max(0,finite(row.samples));
    if (seconds<SAMPLE_WINDOW_SECONDS||samples<1||kills<=0) return null;
    return { factor:clamp(finite(row.factor),0.60,1.60),samples,totalSeconds:seconds,totalKills:kills,confidence:confidence(seconds,kills) };
  }

  function latestEvaluationSample(result, current) {
    const acct=accountId(), key=contextKey(result?.lead,current?.hunt,current?.diff), level=finite(result?.lead?.level);
    const vip=Boolean(result?.vipActive), daily=Boolean(current?.dailyBoosted);
    return segments.filter(row=>row.accountId===acct
      && finite(row.elapsedSeconds)===SAMPLE_WINDOW_SECONDS
      && calibrationKey(row)===key
      && finite(row.leadLevel)===level
      && Boolean(row.vipActive)===vip
      && Boolean(row.dailyBoosted)===daily)
      .sort((a,b)=>finite(b.end)-finite(a.end))[0] || null;
  }

  async function createReport(force=false) {
    const core=window.__PGUnifiedHuntCore;
    if (!core?.calculateRecommendations) return { error:'El motor Hunt Intelligence todavía no está listo.' };
    const result=await core.calculateRecommendations(force), raw=rawSession(), slug=currentSlug()||raw?.slug||'', current=findCurrentRow(result.rows||[],slug);
    if (!current) return { result,session:null,slug,error:slug?`No puedo relacionar la hunt actual “${slug}” con el ranking.`:'Todavía no detecto una hunt activa.' };
    const session=updateActiveSample(result,current);
    const evaluation=session?.completedRows?.at(-1)||latestEvaluationSample(result,current);
    const expectedKph=Math.max(0,finite(current.theoreticalKph,current.kph));
    const actualKph=Math.max(0,finite(evaluation?.kph,session?.kph));
    const efficiency=expectedKph?actualKph/expectedKph:0;
    const ready=Boolean(evaluation&&finite(evaluation.elapsedSeconds)===SAMPLE_WINDOW_SECONDS&&finite(evaluation.kills)>=config.minKills);
    const percent=efficiency*100;
    const level=ready?(percent<config.threshold*.8?'critical':percent<config.threshold?'warning':'good'):'measuring';
    return { result,session,evaluation,slug,current,expectedKph,actualKph,efficiency,percent,ready,level,createdAt:Date.now() };
  }

  async function refresh(force=false) {
    if (busy) return lastReport;
    busy=true;
    try { lastReport=await createReport(force); return lastReport; }
    catch(error){ lastReport={error:error?.message||String(error),level:'critical'}; return lastReport; }
    finally { busy=false; }
  }

  function aggregateHistory() {
    const map=new Map();
    for (const row of currentPokemonHistoryRows()) {
      const key=historyGroupKey(row);
      const agg=map.get(key)||{key,huntName:row.huntName,leadName:row.leadName,move:row.move,tm:row.tm,samples:0,seconds:0,kills:0,cleanXp:0,legacy:0,vipYes:0,vipNo:0};
      agg.samples++; agg.seconds+=SAMPLE_WINDOW_SECONDS; agg.kills+=finite(row.kills);
      if (row.vipKnown===true&&Number.isFinite(Number(row.cleanBaseXph))) { agg.cleanXp+=finite(row.cleanBaseXph); if(row.vipActive)agg.vipYes++;else agg.vipNo++; }
      else agg.legacy++;
      map.set(key,agg);
    }
    return [...map.values()].map(row=>{
      const hours=row.samples*0.5;
      const knownSamples=Math.max(0,row.samples-row.legacy);
      const baseXph=knownSamples?row.cleanXp/knownSamples:0;
      return {...row,hours,kph:row.samples?row.kills/hours:0,baseXph,vipXph:baseXph*VIP_MULT,vipDailyXph:baseXph*VIP_MULT*DAILY_MULT};
    }).sort((a,b)=>b.baseXph-a.baseXph||b.samples-a.samples);
  }

  function historyGroupKey(row) {
    return `${compact(row.huntKey||row.slug||row.huntName)}|${compact(row.leadId||row.leadName)}|${compact(row.move)}|${row.tm?'tm':'base'}`;
  }

  function legacyCount(){ return segments.filter(row=>row.accountId===accountId()&&row.vipKnown!==true).length; }
  function currentPokemonLegacyCount(){ return currentPokemonHistoryRows().filter(row=>row.vipKnown!==true).length; }

  function adoptLegacyVip() {
    const vip=Boolean(window.__PGPiwToolsEngine?.getVip?.()),pokemon=currentHistoryPokemon();
    let changed=0;
    if(!pokemon)return{changed,vip};
    segments=segments.map(row=>{
      if(row.accountId!==accountId()||row.vipKnown===true||!rowMatchesHistoryPokemon(row,pokemon))return row;
      const baseWithVip=Math.max(0,finite(row.legacyBaseXph,row.baseXph,row.rawXph/(row.dailyBoosted?DAILY_MULT:1)));
      changed++; return {...row,vipKnown:true,vipActive:vip,cleanBaseXph:baseWithVip/(vip?VIP_MULT:1),importedLegacy:true};
    });
    persist(); try{window.dispatchEvent(new CustomEvent('pokegrid-intelligence-updated'));}catch{} return {changed,vip};
  }
  function clearHistoryEntry(key) {
    const target=String(key||'');
    if(!target)return{cleared:false,removedSegments:0,removedCalibrations:0};
    const acct=accountId(),removed=segments.filter(row=>row.accountId===acct&&historyGroupKey(row)===target);
    if(!removed.length)return{cleared:false,removedSegments:0,removedCalibrations:0};
    const calibrationKeys=new Set(removed.map(row=>calibrationKey(row)));
    segments=segments.filter(row=>row.accountId!==acct||historyGroupKey(row)!==target);
    let removedCalibrations=0;
    for(const calibrationEntryKey of calibrationKeys){
      if(Object.prototype.hasOwnProperty.call(calibrationRegistry,calibrationEntryKey)){
        delete calibrationRegistry[calibrationEntryKey];
        removedCalibrations++;
      }
    }
    if(activeSample?.meta?.accountId===acct&&historyGroupKey(activeSample.meta)===target)activeSample=null;
    persist();
    try{window.dispatchEvent(new CustomEvent('pokegrid-intelligence-updated'));}catch{}
    return{cleared:true,removedSegments:removed.length,removedCalibrations};
  }
  function clearCurrentPokemonHistory(){
    const acct=accountId(),pokemon=currentHistoryPokemon();
    if(!pokemon)return{cleared:false,removedSegments:0,removedCalibrations:0};

    const removed=segments.filter(row=>row.accountId===acct&&rowMatchesHistoryPokemon(row,pokemon));
    if(!removed.length)return{cleared:false,removedSegments:0,removedCalibrations:0};

    const calibrationKeys=new Set(removed.map(row=>calibrationKey(row)));
    segments=segments.filter(row=>row.accountId!==acct||!rowMatchesHistoryPokemon(row,pokemon));

    let removedCalibrations=0;
    for(const key of calibrationKeys){
      if(Object.prototype.hasOwnProperty.call(calibrationRegistry,key)){
        delete calibrationRegistry[key];
        removedCalibrations++;
      }
    }

    if(activeSample?.meta?.accountId===acct&&rowMatchesHistoryPokemon(activeSample.meta,pokemon))activeSample=null;
    persist();
    try{window.dispatchEvent(new CustomEvent('pokegrid-intelligence-updated'));}catch{}
    return{cleared:true,removedSegments:removed.length,removedCalibrations};
  }

  function clearHistory(){ segments=[];calibrationRegistry={};activeSample=null;persist();try{window.dispatchEvent(new CustomEvent('pokegrid-intelligence-updated'));}catch{}return{cleared:true}; }
  function adjustConfig(key,delta){
    config.minMinutes=FIXED_MIN_MINUTES;
    if(key==='minMinutes')return{...config};
    if(!['threshold','minKills','refreshSeconds'].includes(key))return{...config};
    const ranges={threshold:[50,120],minKills:[5,1000],refreshSeconds:[8,120]},[min,max]=ranges[key];
    config[key]=clamp(finite(config[key])+finite(delta),min,max);persist();restartTimer();return{...config};
  }

  function renderCurrentHtml() {
    const r=lastReport;
    if(!r)return '<div class="pg-u-empty">Esperando la primera medición del supervisor…</div>';
    if(r.error&&!r.current)return `<div class="pg-u-empty">${esc(r.error)}</div>`;
    const current=r.current||{},session=r.session||{},evaluation=r.evaluation||null;
    const vip=Boolean(r.result?.vipActive),daily=Boolean(current.dailyBoosted);
    const actualRaw=finite(evaluation?.rawXph,session.xph);
    const clean=Number.isFinite(Number(evaluation?.cleanBaseXph))?finite(evaluation.cleanBaseXph):actualRaw/(vip?VIP_MULT:1)/(daily?DAILY_MULT:1);
    const tone=r.ready?(r.level==='good'?'ok':r.level==='warning'?'warn':'bad'):'warn';
    const alternatives=(r.result?.rows||[]).filter(row=>row!==current).slice(0,5);
    const progress=Math.min(FIXED_MIN_MINUTES,finite(session.elapsedSeconds)/60);
    const banner=r.ready
      ? (r.level==='good'?`Última muestra de 30 min: rendimiento correcto, ${fmt(r.percent,1)} % de la velocidad PIWTools.`:`Última muestra de 30 min: rendimiento bajo, ${fmt(r.percent,1)} % de PIWTools.`)
      : `Recopilando muestra: ${fmt(progress,1)} / ${FIXED_MIN_MINUTES} min · ${fmt(session.kills)} derrotas.`;
    return `<div class="pg-hi-banner ${tone}">${banner}</div>
      <div class="pg-hi-hero"><div><b>${esc(current.hunt?.name||r.slug||'Hunt actual')}</b><small>${esc(r.result?.lead?.name||'Pokémon')} Nv. ${fmt(r.result?.lead?.level)} · ${vip?'VIP Sí':'VIP No'}${daily?' · +20 % diario':''}${lastResetReason?` · ${esc(lastResetReason)}`:''}</small></div><div><b>${fmt(r.expectedKph)}</b><small>kills/h PIWTools</small></div><div><b>${fmt(r.actualKph)}</b><small>${evaluation?'última muestra':'muestra actual'} kills/h</small></div><div><b>${fmt(actualRaw)}</b><small>EXP/h observada</small></div><div><b>${fmt(clean)}</b><small>EXP/h base limpia</small></div></div>
      <div class="pg-hi-grid"><div class="pg-hi-card"><h3>Condiciones y muestra</h3><div class="pg-hi-lines"><span>PIWTools actual</span><b>${fmt(finite(current.theoreticalXph,current.xph))}</b><span>Ranking utilizado</span><b>${fmt(current.xph)}</b><span>Muestra actual</span><b>${fmt(progress,1)} / ${FIXED_MIN_MINUTES} min</b><span>Derrotas actuales</span><b>${fmt(session.kills)}</b><span>Muestras completas</span><b>${fmt(segments.filter(row=>row.accountId===accountId()&&finite(row.elapsedSeconds)===SAMPLE_WINDOW_SECONDS).length)}</b></div></div>
      <div class="pg-hi-card"><h3>Alternativas calculadas</h3>${alternatives.map(row=>`<div class="pg-hi-alt"><span>${esc(row.hunt?.name||'Hunt')}${row.dailyBoosted?' · +20 %':''}</span><b>${fmt(row.xph)} XP/h</b></div>`).join('')||'<div class="pg-u-empty">Sin alternativas.</div>'}</div></div>
      <div class="pg-hi-settings"><div>Umbral <span><button data-supervisor-delta="-5" data-supervisor-key="threshold">−</button><b>${fmt(config.threshold)}%</b><button data-supervisor-delta="5" data-supervisor-key="threshold">+</button></span></div><div>Muestra histórica <span><b>${FIXED_MIN_MINUTES} min (fijo)</b></span></div><div>Mín. kills <span><button data-supervisor-delta="-5" data-supervisor-key="minKills">−</button><b>${fmt(config.minKills)}</b><button data-supervisor-delta="5" data-supervisor-key="minKills">+</button></span></div></div>`;
  }

  function renderHistoryHtml() {
    const pokemon=currentHistoryPokemon();
    if(!pokemon)return'<div class="pg-u-empty">No detecto ningún Pokémon activo en el primer slot. Equipa uno para ver su histórico.</div>';

    const rows=aggregateHistory(),legacy=currentPokemonLegacyCount(),vip=Boolean(window.__PGPiwToolsEngine?.getVip?.());
    return `<div class="pg-u-note"><b>Histórico de ${esc(pokemon.name)}</b>${pokemon.level?` Nv. ${fmt(pokemon.level)}`:''}. Solo se muestran las muestras guardadas de este Pokémon. Al cambiar el Pokémon activo, esta pestaña cambia automáticamente a su histórico.<br>Cada muestra representa exactamente 30 minutos útiles. «Base limpia» es la media de las muestras de esa hunt y elimina VIP ×1,50 y bonus diario ×1,20.</div>${legacy?`<div class="pg-hi-banner warn">Hay ${fmt(legacy)} muestras antiguas de ${esc(pokemon.name)} sin estado VIP. Sus kills/h siguen siendo útiles, pero su EXP no se usa hasta clasificarlas. <button data-adopt-legacy-vip>Asignarles VIP actual: ${vip?'Sí':'No'}</button></div>`:''}
      <div class="pg-hi-history-head"><span>Hunt · Pokémon</span><span>Muestras</span><span>Horas</span><span>Kills/h</span><span>Base limpia media</span><span>VIP + diario</span><span></span></div>
      <div class="pg-hi-history">${rows.map(row=>`<div class="pg-hi-history-row"><span class="pg-hi-history-name"><b>${esc(row.huntName||'Hunt')}</b><small>${esc(row.leadName||pokemon.name||'Pokémon')} · ${esc(row.move||'Ataque')}${row.tm?' (MT)':''}${row.legacy?` · ${row.legacy} legado`:''}</small></span><span>${fmt(row.samples)}</span><span>${fmt(row.hours,1)}</span><span>${fmt(row.kph)}</span><span>${row.baseXph?fmt(row.baseXph):'—'}</span><span>${row.baseXph?fmt(row.vipDailyXph):'—'}</span><button class="pg-hi-delete" data-delete-intelligence-history="${esc(row.key)}" data-history-label="${esc(`${row.huntName||'Hunt'} · ${row.leadName||pokemon.name||'Pokémon'}`)}" title="Borrar todas las muestras de esta línea" aria-label="Borrar histórico de ${esc(row.huntName||'esta hunt')}">🗑️</button></div>`).join('')||`<div class="pg-u-empty">${esc(pokemon.name)} todavía no tiene muestras completas. La primera aparecerá al completar 30 minutos útiles en la misma hunt y condiciones.</div>`}</div>
      <div class="pg-hi-actions"><button data-clear-intelligence-history>🗑️ Borrar histórico de ${esc(pokemon.name)}</button></div>`;
  }

  function state() {
    const r=lastReport; let status='waiting',statusText='Esperando una muestra de rendimiento.';
    if(r?.error&&!r?.current){status='error';statusText=r.error;}else if(r?.ready){status=r.level==='good'?'ok':'warning';statusText=r.level==='good'?`Rendimiento correcto: ${fmt(r.percent,1)} % de PIWTools.`:`Rendimiento por debajo de PIWTools: ${fmt(r.percent,1)} %.`;}else if(r?.current){status='waiting';statusText=`Midiendo ${r.current?.hunt?.name||r.slug||'hunt'}: ${fmt(r.session?.kills||0)} derrotas.`;}
    return {status,statusText,dependencies:{huntAdvisor:{ok:Boolean(window.__PGUnifiedHuntCore?.calculateRecommendations),checkedAt:Date.now()},session:{ok:Boolean(window.__poke?.sess?.start),checkedAt:Date.now()},activeHunt:{ok:Boolean(currentSlug()),checkedAt:Date.now()}},metrics:{busy,ready:Boolean(r?.ready),level:r?.level||'waiting',hunt:r?.current?.hunt?.name||r?.slug||'',expectedKph:finite(r?.expectedKph),actualKph:finite(r?.actualKph),efficiencyPercent:finite(r?.percent),elapsedMinutes:finite(r?.session?.elapsedSeconds)/60,kills:finite(r?.session?.kills),vipActive:Boolean(r?.result?.vipActive),dailyBoosted:Boolean(r?.current?.dailyBoosted),storedSegments:segments.length,validPersonalRows:segments.filter(x=>x.vipKnown===true).length,legacyRows:legacyCount(),activeSamplePersisted:Boolean(activeSample),sampleCheckpointMs:SAMPLE_CHECKPOINT_MS,config:{...config}}};
  }

  function restartTimer(){clearInterval(timer);timer=setInterval(()=>refresh(false),Math.max(8,finite(config.refreshSeconds,15))*1000);}

  function requestContextRefresh(){
    if(contextRefreshPending)return;
    contextRefreshPending=true;
    Promise.resolve(refresh(false)).finally(()=>{contextRefreshPending=false;});
  }

  function checkpointActiveSample(){
    if(!activeSample)return false;
    const raw=rawSession();
    if(!raw)return false;

    const now=Date.now();
    const slugChanged=Boolean(raw.slug&&activeSample.meta?.slug&&norm(raw.slug)!==norm(activeSample.meta.slug));
    const sessionChanged=activeSample.rawStart!==raw.start||raw.kills<finite(activeSample.lastKills)||raw.xp<finite(activeSample.lastXp);
    if(slugChanged||sessionChanged){
      requestContextRefresh();
      return false;
    }

    if(raw.kills>finite(activeSample.lastKills)||raw.xp>finite(activeSample.lastXp))activeSample.lastProgressAt=now;
    activeSample.lastKills=raw.kills;
    activeSample.lastXp=raw.xp;

    collectCompletedWindows(activeSample,activeSampleSafeEnd(now));
    persistActiveSample();
    return true;
  }

  function restartSampleCheckpoint(){
    clearInterval(sampleCheckpointTimer);
    sampleCheckpointTimer=setInterval(checkpointActiveSample,SAMPLE_CHECKPOINT_MS);
  }

  function checkHistoryPokemonChange(){
    const nextKey=currentHistoryPokemon()?.key||'';
    if(!nextKey)return false;
    if(!lastHistoryPokemonKey){lastHistoryPokemonKey=nextKey;return false;}
    if(nextKey===lastHistoryPokemonKey)return false;
    lastHistoryPokemonKey=nextKey;
    try{window.dispatchEvent(new CustomEvent('pokegrid-intelligence-updated',{detail:{reason:'pokemon-changed',pokemonKey:nextKey}}));}catch{}
    requestContextRefresh();
    return true;
  }

  function startHistoryPokemonWatcher(){
    clearInterval(historyPokemonTimer);
    lastHistoryPokemonKey=currentHistoryPokemon()?.key||'';
    historyPokemonTimer=setInterval(checkHistoryPokemonChange,1000);
  }

  const finalizeOnExit=()=>{try{checkpointActiveSample();finalizeActiveSample('cierre o recarga',activeSampleSafeEnd(Date.now()));}catch{}};
  window.addEventListener('pagehide',finalizeOnExit);window.addEventListener('beforeunload',finalizeOnExit);
  window.addEventListener('pokegrid-vip-updated',()=>refresh(false));window.addEventListener('pokegrid-daily-bonus-updated',()=>refresh(false));

  window.__PGHuntIntelligenceSupervisor = {
    version:'1.1.18',refresh,getState:state,getReport:()=>clone(lastReport),getHistory:()=>clone(segments),getCurrentHistoryPokemon:()=>clone(currentHistoryPokemon()),getPersonalEstimate,getCalibration,
    renderCurrentHtml,renderHistoryHtml,adjustConfig,adoptLegacyVip,clearHistoryEntry,clearCurrentPokemonHistory,clearHistory,finalizeActiveSample
  };
  window.__PGPerformanceSupervisor = Object.freeze({ version:'1.1.18',getState:state,refresh:()=>refresh(true),getHistory:()=>clone(segments),clearHistoryEntry,clearHistory });

  let healthClient=null;
  function connectHealth(){const bridge=window.__pokeGridScripts;if(!bridge?.register||healthClient)return Boolean(healthClient);healthClient=bridge.register({id:'performance-supervisor',name:'Supervisor de rendimiento Hunt Intelligence',version:'1.1.18',description:'Mide rendimiento real y normaliza VIP y bonus diario dentro del motor unificado.',icon:'📈',category:'gameplay-analysis',status:'waiting',statusText:'Esperando una muestra.',staleAfterMs:50000,capabilities:['real-kph','piwtools-comparison','history','segmentation','vip-normalization','daily-normalization','personal-ranking']});healthClient.registerCommand('open',()=>{try{window.__PGHuntIntelligence?.openPerformance?.();}catch{}return{opened:true};},{label:'Abrir rendimiento'});healthClient.registerCommand('refresh',()=>refresh(true),{label:'Actualizar medición'});healthClient.registerCommand('get-history',()=>clone(segments),{label:'Obtener histórico'});healthClient.registerCommand('clear-history',clearHistory,{label:'Borrar histórico',dangerous:true});setInterval(()=>{try{healthClient.heartbeat(state());}catch{}},10000);try{healthClient.heartbeat(state());}catch{}return true;}
  window.addEventListener('pokegrid-health-bridge-ready',connectHealth);const bridgeTimer=setInterval(()=>{if(connectHealth())clearInterval(bridgeTimer);},1000);

  migrateLegacy();
  migrateToFixedWindows();
  restartTimer();
  restartSampleCheckpoint();
  startHistoryPokemonWatcher();
  setTimeout(()=>refresh(false),1200);
  console.info('[Hunt Intelligence] Supervisor unificado v1.1.18 cargado: muestras de 30 min con checkpoint persistente cada 2 s.');
})();

(() => {
  'use strict';
  if (window.__pgHuntIntelligenceUiV1118) return;
  window.__pgHuntIntelligenceUiV1118 = true;

  const NS = 'pg-hunt-item-unified-v2';
  const PANEL_ID = `${NS}-panel`;
  const BUTTON_ID = `${NS}-button`;
  const STYLE_ID = `${NS}-style`;
  const TOAST_ID = `${NS}-toast`;
  const LEGACY_ACTIVE_TAB_KEY = `${NS}:tab`;
  const BUTTON_POS_KEY = `${NS}:button-position`;
  const PANEL_LAYOUT_KEY = `${NS}:panel-layout`;
  let activeTab = 'hunt';
  let panelCollapsed = false;
  let lastHuntResult = null;
  let lastItemResult = null;
  let lastNotCaughtResult = null;
  let pokedexCache = null;
  let pokedexCacheAt = 0;
  let busy = false;
  let suppressMapAutoOpenUntil = 0;

  const H = () => window.__PGUnifiedHuntCore;
  const I = () => window.__PGUnifiedItemCore;
  const S = () => window.__PGHuntIntelligenceSupervisor;
  const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[_-]+/g, ' ').replace(/\[[^\]]*]/g, '').replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite = (...values) => { for (const value of values) { const n = Number(value); if (Number.isFinite(n)) return n; } return 0; };
  const fmt = (value, decimals = 0) => Number.isFinite(Number(value))
    ? Number(value).toLocaleString('es-ES', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) : '—';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID}{position:fixed;right:14px;bottom:48px;z-index:99980;border:1px solid #3a4556;border-radius:999px;background:#111a27;color:#fff;width:44px;height:44px;display:grid;place-items:center;padding:0;font:900 20px/1 system-ui;box-shadow:0 7px 22px #0009;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
      #${BUTTON_ID}:hover{background:#1c293b}
      #${BUTTON_ID}[data-dragging="1"]{cursor:grabbing;background:#263a55;box-shadow:0 11px 30px #000c}
      #${PANEL_ID}{position:fixed;inset:0;z-index:99990;background:transparent;pointer-events:none;font-family:system-ui;color:#e8edf5}
      #${PANEL_ID} .pg-u-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(790px,96vw);height:min(720px,91vh);min-width:360px;min-height:220px;max-width:98vw;max-height:96vh;overflow:auto;resize:both;pointer-events:auto;background:#0d131c;border:1px solid #354052;border-radius:14px;box-shadow:0 18px 60px #000d}
      #${PANEL_ID} .pg-u-card.collapsed{width:min(390px,94vw)!important;height:auto!important;min-width:280px!important;min-height:0!important;resize:none!important;overflow:hidden!important}
      #${PANEL_ID} .pg-u-card.collapsed .pg-u-tabs,#${PANEL_ID} .pg-u-card.collapsed .pg-u-body,#${PANEL_ID} .pg-u-card.collapsed .pg-u-mode-group,#${PANEL_ID} .pg-u-card.collapsed [data-refresh]{display:none!important}
      #${PANEL_ID} .pg-u-head{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;padding:10px 12px;background:#111925;border-bottom:1px solid #29364a;cursor:grab;user-select:none;touch-action:none}
      #${PANEL_ID} .pg-u-head:active{cursor:grabbing}
      #${PANEL_ID} .pg-u-head button,#${PANEL_ID} .pg-u-head select{cursor:pointer;touch-action:manipulation}
      #${PANEL_ID} .pg-u-title{font-weight:850;font-size:15px;margin-right:auto;white-space:nowrap}
      #${PANEL_ID} button,#${PANEL_ID} select,#${PANEL_ID} input{background:#182232;color:#edf3fb;border:1px solid #35445a;border-radius:7px;padding:7px 9px;font:650 11px system-ui}
      #${PANEL_ID} button{cursor:pointer}
      #${PANEL_ID} .pg-u-tabs{position:sticky;top:48px;z-index:4;display:flex;background:#0f1722;border-bottom:1px solid #283548;padding:7px 10px 0;gap:5px}
      #${PANEL_ID} .pg-u-tab{border-radius:8px 8px 0 0;padding:8px 16px;background:#151f2d;color:#8d9bae;border-bottom-color:#283548}
      #${PANEL_ID} .pg-u-tab.on{background:#23324a;color:#fff;border-color:#48617f;border-bottom-color:#23324a}
      #${PANEL_ID} .pg-u-tabs{overflow-x:auto;scrollbar-width:thin}
      #${PANEL_ID} .pg-u-body{padding:12px}
      #${PANEL_ID} .pg-u-note{font-size:11px;color:#91a0b5;line-height:1.5;margin-bottom:10px}
      #${PANEL_ID} .pg-u-sourcebox{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 10px;margin-bottom:10px;background:#101925;border:1px solid #28364a;border-radius:9px;font-size:10.5px;color:#aab7c8;line-height:1.45}
      #${PANEL_ID} .pg-u-sourcebox.warn{border-color:#845f2f;background:#211a10}
      #${PANEL_ID} .pg-u-sourcebox.bad{border-color:#883f3f;background:#241313}
      #${PANEL_ID} .pg-u-sourcebox b{color:#eef4fc}
      #${PANEL_ID} .pg-u-daily{position:relative;display:flex;gap:7px;align-items:center;white-space:nowrap;pointer-events:auto!important}
      #${PANEL_ID} .pg-u-daily-label{color:#f3ce70;font-weight:750}
      #${PANEL_ID} .pg-u-control{position:relative;z-index:8;pointer-events:auto!important;opacity:1!important;touch-action:manipulation!important;user-select:none!important;-webkit-user-select:none!important}
      #${PANEL_ID} .pg-u-mode-group{display:flex;align-items:center;gap:4px;padding:2px;border:1px solid #35445a;border-radius:9px;background:#101925}
      #${PANEL_ID} .pg-u-mode-btn{border:0!important;background:transparent!important;color:#91a0b5!important;padding:6px 9px!important}
      #${PANEL_ID} .pg-u-mode-btn.on{background:#2a3c58!important;color:#fff!important;box-shadow:inset 0 0 0 1px #4b6688}
      #${PANEL_ID} .pg-u-daily-wrap{position:relative;z-index:20}
      #${PANEL_ID} .pg-u-daily-toggle{min-width:112px;text-align:left}
      #${PANEL_ID} .pg-u-daily-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:100;display:grid;grid-template-columns:repeat(2,minmax(110px,1fr));gap:5px;width:min(300px,78vw);max-height:280px;overflow:auto;padding:8px;background:#0c131d;border:1px solid #42536c;border-radius:10px;box-shadow:0 16px 42px #000e}
      #${PANEL_ID} .pg-u-daily-menu[hidden]{display:none!important}
      #${PANEL_ID} .pg-u-daily-option{text-align:left;background:#151f2d!important;color:#b9c5d4!important}
      #${PANEL_ID} .pg-u-daily-option.on{background:#304767!important;color:#fff!important;border-color:#5f82aa!important}
      #${PANEL_ID} .pg-u-tm-btn{color:#9fd0ff!important;min-width:104px}
      #${PANEL_ID} .pg-u-tm-btn.on{background:#17344b!important;border-color:#4f91c1!important;color:#d6efff!important}
      #${PANEL_ID} .pg-u-vip-btn{color:#ffd36c!important;min-width:86px}
      #${PANEL_ID} .pg-u-vip-btn.on{background:#493913!important;border-color:#b89230!important;color:#fff2ad!important}
      #${PANEL_ID} .pg-hi-banner{padding:10px 11px;border-radius:9px;margin-bottom:10px;font-size:11px;line-height:1.5;border:1px solid #305a3c;background:#12231a;color:#b9eec8}.pg-hi-banner.warn{border-color:#806126;background:#2a2110;color:#ffe19a}.pg-hi-banner.bad{border-color:#874343;background:#2a1515;color:#ffb1aa}
      #${PANEL_ID} .pg-hi-hero{display:grid;grid-template-columns:minmax(180px,1.5fr) repeat(4,minmax(95px,1fr));gap:8px;align-items:center;padding:11px;background:#111a23;border:1px solid #293848;border-radius:10px;margin-bottom:10px}.pg-hi-hero>div:not(:first-child){text-align:right}.pg-hi-hero b{display:block;font-size:13px}.pg-hi-hero small{display:block;color:#8795a6;font-size:9px;margin-top:3px}
      #${PANEL_ID} .pg-hi-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pg-hi-card{background:#101720;border:1px solid #273342;border-radius:10px;overflow:hidden}.pg-hi-card h3{font-size:10px;text-transform:uppercase;color:#93a1b2;margin:0;padding:9px;border-bottom:1px solid #25303c}.pg-hi-lines{display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px;font-size:10px}.pg-hi-alt{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid #202a35;font-size:10px}.pg-hi-alt:last-child{border-bottom:0}
      #${PANEL_ID} .pg-hi-settings{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.pg-hi-settings>div{display:flex;justify-content:space-between;align-items:center;padding:8px;background:#101720;border:1px solid #273342;border-radius:8px;font-size:10px}.pg-hi-settings span{display:flex;gap:5px;align-items:center}.pg-hi-settings button{padding:4px 7px}
      #${PANEL_ID} .pg-hi-history-head,#${PANEL_ID} .pg-hi-history-row{display:grid;grid-template-columns:minmax(160px,1.5fr) 70px 70px 88px 100px 105px 40px;gap:7px;align-items:center;padding:8px 9px;font-size:10px}.pg-hi-history-head{color:#8392a3;text-transform:uppercase}.pg-hi-history{display:grid;gap:7px}.pg-hi-history-row{background:#111923;border:1px solid #273443;border-radius:8px}.pg-hi-history-row small{display:block;color:#8795a6;margin-top:2px}.pg-hi-delete{width:34px;height:32px;padding:0!important;color:#ffaaa3!important;border-color:#6d3b3b!important;background:#291718!important}.pg-hi-delete:hover{background:#4a2020!important;border-color:#a85656!important}.pg-hi-actions{display:flex;justify-content:flex-end;margin-top:10px}
      #${PANEL_ID} .pg-u-badge{display:inline-block;margin-left:5px;padding:1px 5px;border:1px solid #8f7131;border-radius:999px;background:#2b2312;color:#ffd976;font-size:9px;font-weight:850;vertical-align:1px}
      #${PANEL_ID} .pg-u-settings{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:9px;background:#111925;border:1px solid #253145;border-radius:9px;margin-bottom:11px}
      #${PANEL_ID} .pg-u-weight{font-size:10px;color:#9ba8ba;display:flex;align-items:center;gap:6px;justify-content:space-between}
      #${PANEL_ID} .pg-u-step{display:inline-flex;align-items:center;gap:4px}
      #${PANEL_ID} .pg-u-step button{min-width:27px;padding:5px 7px!important}
      #${PANEL_ID} .pg-u-weight-value{min-width:38px;text-align:center;color:#eef5ff;font-weight:850;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .pg-u-table-head,#${PANEL_ID} .pg-u-row{display:grid;grid-template-columns:34px minmax(175px,1fr) repeat(6,minmax(70px,auto));gap:8px;align-items:center}
      #${PANEL_ID} .pg-u-table-head{padding:7px 8px 5px;border-bottom:1px solid #344155;color:#8392a6;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.02em}
      #${PANEL_ID} .pg-u-table-head .pg-u-col{text-align:right;white-space:nowrap}
      #${PANEL_ID} .pg-u-table-head .pg-u-col-name{text-align:left}
      #${PANEL_ID} .pg-u-row{padding:9px 8px;border-bottom:1px solid #202b3b;font-size:11px}
      #${PANEL_ID} .pg-u-row.best{background:linear-gradient(90deg,#17321f88,#0d131c)}
      #${PANEL_ID} .pg-u-rank{text-align:center;font-weight:900;color:#f0c467;font-size:14px}
      #${PANEL_ID} .pg-u-target{font-weight:800;font-size:12px;color:#f3f6fb;cursor:pointer;text-decoration:none;border-radius:5px;padding:3px 4px;margin-left:-4px;display:inline-block}
      #${PANEL_ID} .pg-u-target:hover{background:#2a3d57;color:#9fd0ff;text-decoration:underline}
      #${PANEL_ID} .pg-u-sub{font-size:9.5px;color:#8290a5;margin-top:2px}
      #${PANEL_ID} .pg-u-metric{text-align:right;font-variant-numeric:tabular-nums}.piw-xp{color:#72b7ff}.real-xp{color:#64d8c0}.xp{color:#72b7ff}.gold{color:#f2cc60}.loot{color:#8ce99a}.rare{color:#ff9fd5}.score{color:#d4a6ff}.rate{color:#d5a6ff}.speed{color:#72b7ff}.items{color:#8ce99a}.eff{color:#ffd36c}
      #${PANEL_ID} .pg-u-search{display:flex;gap:7px;margin-bottom:12px}.pg-u-search input{flex:1;font-size:12px}
      #${PANEL_ID} .pg-u-caught-summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 11px;margin-bottom:10px;background:#101925;border:1px solid #36506d;border-radius:9px;color:#b9c8d9;font-size:11px}
      #${PANEL_ID} .pg-u-caught-summary b{color:#9fd0ff;font-size:13px}
      #${PANEL_ID} .pg-u-hero{padding:12px;border:1px solid #38593f;background:linear-gradient(90deg,#142c1a,#111720);border-radius:10px;margin-bottom:10px}
      #${PANEL_ID} .pg-u-hero .pg-u-target{font-size:15px;color:#9aefa8}
      #${PANEL_ID} .pg-u-empty{padding:30px;text-align:center;color:#9ba8ba;line-height:1.6}
      #${TOAST_ID}{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:100050;max-width:min(620px,92vw);background:#101925;color:#eef5ff;border:1px solid #42536c;border-radius:10px;padding:10px 14px;font:650 12px system-ui;box-shadow:0 10px 35px #000c;opacity:0;pointer-events:none;transition:opacity .18s}
      #${TOAST_ID}.show{opacity:1}#${TOAST_ID}.ok{border-color:#368551}#${TOAST_ID}.bad{border-color:#a54343}
      @media(max-width:700px){#${PANEL_ID} .pg-u-sourcebox{grid-template-columns:1fr}.pg-u-daily{white-space:normal;flex-wrap:wrap}#${PANEL_ID} .pg-u-table-head,#${PANEL_ID} .pg-u-row{grid-template-columns:28px 1fr 78px 78px 78px}#${PANEL_ID} .hide-mobile{display:none}#${PANEL_ID} .pg-u-settings{grid-template-columns:1fr}#${PANEL_ID} .pg-u-tabs{top:47px}#${PANEL_ID} .pg-hi-grid{grid-template-columns:1fr}#${PANEL_ID} .pg-hi-hero{grid-template-columns:1fr 1fr}#${PANEL_ID} .pg-hi-history-head{display:none}#${PANEL_ID} .pg-hi-history-row{grid-template-columns:1fr 70px 44px}#${PANEL_ID} .pg-hi-history-name{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }

  function toast(message, type = '') {
    ensureStyles();
    let el = document.getElementById(TOAST_ID);
    if (!el) { el = document.createElement('div'); el.id = TOAST_ID; document.body.appendChild(el); }
    el.textContent = message;
    el.className = `show ${type}`;
    clearTimeout(el.__timer);
    el.__timer = setTimeout(() => { el.className = ''; }, 4500);
  }

  function readPanelLayout() {
    try {
      const value=JSON.parse(localStorage.getItem(PANEL_LAYOUT_KEY)||'null');
      return value&&['left','top','width','height'].every(key=>Number.isFinite(Number(value[key])))?value:null;
    } catch { return null; }
  }

  function savePanelLayout(card) {
    if (!card?.isConnected || card.classList.contains('collapsed')) return;
    const rect=card.getBoundingClientRect();
    try { localStorage.setItem(PANEL_LAYOUT_KEY,JSON.stringify({left:rect.left,top:rect.top,width:rect.width,height:rect.height})); } catch {}
  }

  function clampPanel(card) {
    if (!card?.isConnected) return;
    const rect=card.getBoundingClientRect(),margin=4;
    const left=clamp(rect.left,margin,Math.max(margin,innerWidth-Math.min(rect.width,innerWidth-margin*2)-margin));
    const top=clamp(rect.top,margin,Math.max(margin,innerHeight-Math.min(rect.height,innerHeight-margin*2)-margin));
    card.style.left=`${left}px`;card.style.top=`${top}px`;card.style.transform='none';
  }

  function setPanelCollapsed(card, collapsed) {
    panelCollapsed=Boolean(collapsed);
    if (!card) return;
    card.classList.toggle('collapsed',panelCollapsed);
    const toggle=card.querySelector('[data-panel-collapse]');
    if(toggle){toggle.textContent=panelCollapsed?'▾':'▴';toggle.title=panelCollapsed?'Desplegar Hunt Intelligence':'Plegar Hunt Intelligence';}
    requestAnimationFrame(()=>clampPanel(card));
  }

  function installPanelInteractions(overlay) {
    const card=overlay.querySelector('.pg-u-card'),head=overlay.querySelector('.pg-u-head');
    if(!card||!head)return;
    const saved=readPanelLayout();
    if(saved){
      card.style.left=`${saved.left}px`;card.style.top=`${saved.top}px`;card.style.width=`${saved.width}px`;card.style.height=`${saved.height}px`;card.style.transform='none';
    }
    setPanelCollapsed(card,panelCollapsed);
    let drag=null;
    head.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.target.closest('button,select,input'))return;
      const rect=card.getBoundingClientRect();
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
      try{head.setPointerCapture?.(event.pointerId);}catch{}
    });
    head.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.id)return;
      card.style.left=`${clamp(drag.left+event.clientX-drag.x,4,Math.max(4,innerWidth-card.offsetWidth-4))}px`;
      card.style.top=`${clamp(drag.top+event.clientY-drag.y,4,Math.max(4,innerHeight-card.offsetHeight-4))}px`;
      card.style.transform='none';event.preventDefault();
    });
    const finish=event=>{if(!drag||(event?.pointerId!==undefined&&event.pointerId!==drag.id))return;drag=null;savePanelLayout(card);};
    head.addEventListener('pointerup',finish);head.addEventListener('pointercancel',finish);
    if(typeof ResizeObserver==='function'){
      const observer=new ResizeObserver(()=>{if(!card.classList.contains('collapsed'))savePanelLayout(card);});
      observer.observe(card);card.__pgResizeObserver=observer;
    }
    window.addEventListener('resize',()=>{clampPanel(card);savePanelLayout(card);},{once:true});
  }

  function closePanel() {
    const panel=document.getElementById(PANEL_ID),card=panel?.querySelector('.pg-u-card');
    if(card){savePanelLayout(card);try{card.__pgResizeObserver?.disconnect?.();}catch{}}
    panel?.remove();
  }

  function shell(bodyHtml, options = {}) {
    closePanel();
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = PANEL_ID;
    overlay.innerHTML = `
      <div class="pg-u-card ${panelCollapsed?'collapsed':''}">
        <div class="pg-u-head">
          <span class="pg-u-title">🧠 Hunt Intelligence</span>
          ${activeTab === 'hunt' ? modeControlHtml(H()?.getConfig?.()?.mode || 'xp') : ''}
          <button data-refresh title="Actualizar datos">↻</button><button data-panel-collapse title="${panelCollapsed?'Desplegar':'Plegar'} Hunt Intelligence">${panelCollapsed?'▾':'▴'}</button><button data-close>✕</button>
        </div>
        <div class="pg-u-tabs"><button class="pg-u-tab ${activeTab === 'hunt' ? 'on' : ''}" data-tab="hunt">Hunts</button><button class="pg-u-tab ${activeTab === 'notcaught' ? 'on' : ''}" data-tab="notcaught">No capturados</button><button class="pg-u-tab ${activeTab === 'item' ? 'on' : ''}" data-tab="item">Items</button><button class="pg-u-tab ${activeTab === 'performance' ? 'on' : ''}" data-tab="performance">Rendimiento</button><button class="pg-u-tab ${activeTab === 'history' ? 'on' : ''}" data-tab="history">Histórico</button></div>
        <div class="pg-u-body">${bodyHtml}</div>
      </div>`;
    document.body.appendChild(overlay);
    installPanelInteractions(overlay);

    // El juego y PokeGrid pueden tener manejadores globales de puntero. Estos controles
    // se aíslan en fase de burbuja sin cancelar su acción predeterminada.
    const protectedSelector = '[data-mode-value],[data-daily-toggle],[data-daily-value],[data-use-tm-button],[data-vip-button],[data-weight-delta],[data-supervisor-delta],[data-adopt-legacy-vip],[data-delete-intelligence-history],[data-clear-intelligence-history],[data-panel-collapse],[data-query],[data-item-search]';
    const protect = event => { if (event.target.closest?.(protectedSelector)) event.stopPropagation(); };
    overlay.querySelector('.pg-u-card')?.addEventListener('pointerdown', protect);
    overlay.querySelector('.pg-u-card')?.addEventListener('mousedown', protect);
    overlay.querySelector('.pg-u-card')?.addEventListener('touchstart', protect, { passive: true });

    overlay.addEventListener('click', event => {
      const collapseButton=event.target.closest('[data-panel-collapse]');
      if(collapseButton){event.preventDefault();event.stopPropagation();setPanelCollapsed(overlay.querySelector('.pg-u-card'),!panelCollapsed);return;}
      const modeButton = event.target.closest('[data-mode-value]');
      if (modeButton) {
        event.preventDefault();
        event.stopPropagation();
        const nextMode = modeButton.dataset.modeValue === 'general' ? 'general' : 'xp';
        if (H()?.getConfig?.()?.mode !== nextMode) H()?.setMode(nextMode);
        loadHunt(false);
        return;
      }

      const dailyToggle = event.target.closest('[data-daily-toggle]');
      if (dailyToggle) {
        event.preventDefault();
        event.stopPropagation();
        const menu = dailyToggle.closest('.pg-u-daily-wrap')?.querySelector('[data-daily-menu]');
        if (menu) menu.hidden = !menu.hidden;
        dailyToggle.setAttribute('aria-expanded', String(menu ? !menu.hidden : false));
        return;
      }

      const dailyOption = event.target.closest('[data-daily-value]');
      if (dailyOption) {
        event.preventDefault();
        event.stopPropagation();
        H()?.setDailyType(dailyOption.dataset.dailyValue || 'auto');
        rerunActivePanel(false);
        return;
      }

      const tmButton = event.target.closest('[data-use-tm-button]');
      if (tmButton) {
        event.preventDefault();
        event.stopPropagation();
        H()?.setUseTM(!Boolean(H()?.getConfig?.()?.useTM));
        rerunActivePanel(false);
        return;
      }

      const vipButton = event.target.closest('[data-vip-button]');
      if (vipButton) {
        event.preventDefault();
        event.stopPropagation();
        H()?.setVip(!Boolean(H()?.getConfig?.()?.vipActive));
        rerunActivePanel(false);
        return;
      }

      const supervisorDelta = event.target.closest('[data-supervisor-delta]');
      if (supervisorDelta) {
        event.preventDefault(); event.stopPropagation();
        S()?.adjustConfig?.(supervisorDelta.dataset.supervisorKey, finite(supervisorDelta.dataset.supervisorDelta));
        renderPerformance(false);
        return;
      }
      if (event.target.closest('[data-adopt-legacy-vip]')) {
        event.preventDefault(); event.stopPropagation();
        const result = S()?.adoptLegacyVip?.();
        toast(`Histórico actualizado: ${fmt(result?.changed || 0)} tramos clasificados.`, 'ok');
        renderHistory(false); return;
      }
      const deleteHistoryButton = event.target.closest('[data-delete-intelligence-history]');
      if (deleteHistoryButton) {
        event.preventDefault(); event.stopPropagation();
        const label=deleteHistoryButton.dataset.historyLabel||'esta hunt';
        if(confirm(`¿Borrar todas las muestras y la calibración de ${label}?`)){
          const result=S()?.clearHistoryEntry?.(deleteHistoryButton.dataset.deleteIntelligenceHistory);
          toast(result?.cleared?`Histórico eliminado: ${fmt(result.removedSegments)} muestras.`:'No se encontró historial para eliminar.',result?.cleared?'ok':'bad');
        }
        renderHistory(false); return;
      }
      if (event.target.closest('[data-clear-intelligence-history]')) {
        event.preventDefault(); event.stopPropagation();
        const pokemon=S()?.getCurrentHistoryPokemon?.();
        const label=pokemon?.name||'el Pokémon activo';
        if(confirm(`¿Borrar todo el histórico de ${label}? El histórico de los demás Pokémon se conservará.`)){
          const result=S()?.clearCurrentPokemonHistory?.();
          toast(
            result?.cleared
              ? `Histórico de ${label} eliminado: ${fmt(result.removedSegments)} muestras.`
              : `No se encontró histórico de ${label}.`,
            result?.cleared?'ok':'bad'
          );
        }
        renderHistory(false); return;
      }

      const weightButton = event.target.closest('[data-weight-delta]');
      if (weightButton) {
        event.preventDefault();
        event.stopPropagation();
        const key = weightButton.dataset.weightKey;
        const delta = finite(weightButton.dataset.weightDelta, 0);
        const cfg = H()?.getConfig?.() || {};
        if (['xpWeight', 'lootWeight', 'rareWeight', 'goldWeight'].includes(key)) {
          H()?.setWeight(key, clamp(finite(cfg[key], 0) + delta, 0, 100));
          loadHunt(false);
        }
        return;
      }

      overlay.querySelectorAll('[data-daily-menu]:not([hidden])').forEach(menu => { menu.hidden = true; });
      if (event.target === overlay || event.target.closest('[data-close]')) { closePanel(); return; }
      const tab = event.target.closest('[data-tab]')?.dataset.tab;
      if (tab) { switchTab(tab); return; }
      const target = event.target.closest('[data-hunt-index]');
      if (target) {
        const index = Number(target.dataset.huntIndex);
        const source = target.dataset.source === 'item'
          ? lastItemResult
          : target.dataset.source === 'notcaught'
            ? lastNotCaughtResult
            : lastHuntResult;
        const row = source?.rows?.[index];
        if (row?.hunt) startHunt(row.hunt);
      }
      const itemSearchButton = event.target.closest('[data-item-search]');
      if (itemSearchButton) {
        event.preventDefault();
        const form = itemSearchButton.closest('[data-form]');
        runItemSearch(form?.querySelector('[data-query]')?.value || '', false);
        return;
      }
      if (event.target.closest('[data-refresh]')) {
        if (activeTab === 'hunt') loadHunt(true);
        else if (activeTab === 'notcaught') loadNotCaught(true);
        else if (activeTab === 'item') runItemSearch(overlay.querySelector('[data-query]')?.value || '', true);
        else if (activeTab === 'performance') renderPerformance(true);
        else renderHistory(true);
      }
    });
    if (options.after) options.after(overlay);
    return overlay;
  }

  function switchTab(tab) {
    activeTab = ['hunt','notcaught','item','performance','history'].includes(tab) ? tab : 'hunt';
    if (activeTab === 'hunt') loadHunt(false);
    else if (activeTab === 'notcaught') loadNotCaught(false);
    else if (activeTab === 'item') renderItemInitial();
    else if (activeTab === 'performance') renderPerformance(false);
    else renderHistory(false);
  }

  function renderLoading(text) { shell(`<div class="pg-u-empty">${esc(text)}</div>`); }
  function renderError(message) { shell(`<div class="pg-u-empty">${esc(message || 'No se pudo completar la operación.')}</div>`); }

  function dailyChoices() {
    const labels = H()?.getDailyLabels?.() || {};
    return [['auto', 'Automático'], ['none', 'Sin bonus'], ...Object.entries(labels)];
  }

  function dailyLabel(selected, daily = null) {
    const base = dailyChoices().find(([value]) => value === selected)?.[1] || 'Automático';
    if (selected !== 'auto' || !daily?.types?.length) return base;
    const labels = H()?.getDailyLabels?.() || {};
    const detected = daily.types.map(type => labels[type] || type).join(' / ');
    return detected ? `Automático · ${detected}` : base;
  }

  function modeControlHtml(selected) {
    const mode = selected === 'general' ? 'general' : 'xp';
    return `<div class="pg-u-mode-group pg-u-control" role="group" aria-label="Modo de clasificación">
      <button type="button" class="pg-u-mode-btn ${mode === 'xp' ? 'on' : ''}" data-mode-value="xp" aria-pressed="${mode === 'xp'}">Solo XP/h</button>
      <button type="button" class="pg-u-mode-btn ${mode === 'general' ? 'on' : ''}" data-mode-value="general" aria-pressed="${mode === 'general'}">Mejor general</button>
    </div>`;
  }

  function dailyControlHtml(selected, daily = null) {
    const current = selected || 'auto';
    return `<span class="pg-u-daily-label">Tipo diario</span>
      <div class="pg-u-daily-wrap pg-u-control">
        <button type="button" class="pg-u-daily-toggle" data-daily-toggle aria-haspopup="true" aria-expanded="false">${esc(dailyLabel(current, daily))} ▾</button>
        <div class="pg-u-daily-menu" data-daily-menu hidden>${dailyChoices().map(([value, label]) =>
          `<button type="button" class="pg-u-daily-option ${current === value ? 'on' : ''}" data-daily-value="${esc(value)}">${esc(label)}</button>`
        ).join('')}</div>
      </div>`;
  }

  function tmControlHtml(enabled) {
    return `<button type="button" class="pg-u-tm-btn pg-u-control ${enabled ? 'on' : ''}" data-use-tm-button aria-pressed="${Boolean(enabled)}" title="Permite que el cálculo use movimientos aprendidos por Máquina Técnica">Contar MT: ${enabled ? 'Sí' : 'No'}</button>`;
  }

  function vipControlHtml(enabled) {
    return `<button type="button" class="pg-u-vip-btn pg-u-control ${enabled ? 'on' : ''}" data-vip-button aria-pressed="${Boolean(enabled)}" title="Aplica el multiplicador de experiencia VIP y separa las muestras del histórico">VIP: ${enabled ? 'Sí' : 'No'}</button>`;
  }

  function weightControlHtml(key, label, value) {
    const safe = clamp(finite(value, 0), 0, 100);
    return `<div class="pg-u-weight pg-u-control"><span>${esc(label)}</span><span class="pg-u-step">
      <button type="button" data-weight-key="${esc(key)}" data-weight-delta="-5" aria-label="Reducir ${esc(label)}">−</button>
      <span class="pg-u-weight-value">${fmt(safe)}%</span>
      <button type="button" data-weight-key="${esc(key)}" data-weight-delta="5" aria-label="Aumentar ${esc(label)}">+</button>
    </span></div>`;
  }

  function rerunActivePanel(force = false) {
    if (activeTab === 'notcaught') return loadNotCaught(force);
    if (activeTab === 'item') {
      const query = lastItemResult?.item?.name || I()?.getLastItem?.() || '';
      return query ? runItemSearch(query, force) : renderItemInitial();
    }
    if (activeTab === 'performance') return renderPerformance(force);
    if (activeTab === 'history') return renderHistory(force);
    return loadHunt(force);
  }

  function dailyDescription(daily) {
    if (!daily) return 'Sin información del bonus diario.';
    const labels = H()?.getDailyLabels?.() || {};
    const names = (daily.types || []).map(type => labels[type] || type);
    if (names.length) return `${daily.setting === 'auto' ? 'Bonus diario automático' : 'Bonus diario manual'}: <b>${esc(names.join(', '))}</b> (+20% EXP y loot)`;
    if (daily.setting === 'none') return 'Bonus diario desactivado manualmente.';
    return 'Tipo diario en automático; esperando que el juego publique el bonus de hoy.';
  }

  function productivityDescription(productivity) {
    if (!productivity) return { text: 'Productividad PIWTools no disponible.', tone: 'bad' };
    const count = finite(productivity.count, 0);
    const parts = [productivity.source || 'PIWTools'];
    if (productivity.version) parts.push(`versión ${productivity.version}`);
    if (count) parts.push(`${fmt(count)} Pokémon con tabla hit1–hit8`);
    if (productivity.updatedAt) parts.push(`datos ${String(productivity.updatedAt).slice(0, 10)}`);
    if (productivity.fallback) return { text: `${parts.join(' · ')}. Se está usando una curva de emergencia porque no fue posible cargar la tabla completa.`, tone: 'bad' };
    if (productivity.stale) return { text: `${parts.join(' · ')}. Se está usando la última caché válida.`, tone: 'warn' };
    return { text: parts.join(' · '), tone: '' };
  }

  async function renderPerformance(force = false) {
    activeTab = 'performance';
    shell('<div class="pg-u-empty">Actualizando rendimiento real…</div>');
    try { await S()?.refresh?.(force); shell(S()?.renderCurrentHtml?.() || '<div class="pg-u-empty">Supervisor no disponible.</div>'); }
    catch (error) { renderError(error?.message || String(error)); }
  }

  async function renderHistory(force = false) {
    activeTab = 'history';
    if (force) { try { await S()?.refresh?.(true); } catch {} }
    shell(S()?.renderHistoryHtml?.() || '<div class="pg-u-empty">Histórico no disponible.</div>');
  }

  async function loadHunt(force = false) {
    if (busy) return;
    busy = true; activeTab = 'hunt';
    renderLoading('Cargando datos del juego y productividad de PIWTools…');
    try {
      const result = await H().calculateRecommendations(force);
      lastHuntResult = result;
      renderHunt(result);
    } catch (error) {
      console.error('[Hunt Advisor]', error); renderError(error?.message || error);
    } finally { busy = false; }
  }

  function renderHunt(result) {
    const cfg = H().getConfig();
    const topRows = result.rows.slice(0, clamp(finite(cfg.topN, 8), 3, 20));
    const product = productivityDescription(result.productivity);
    const body = `
      <div class="pg-u-note"><b>Ranking inteligente:</b> cada hunt usa solo dos fuentes: <b>tu histórico real comparable</b>, cuando existe, o <b>PIWTools</b> cuando todavía no hay histórico. No se aplica una calibración intermedia a hunts no medidas. Loot y Oro NPC usan las probabilidades oficiales multiplicadas por las kills/h de esa misma fuente. El <b>Índice raro/h</b> cuenta solo drops con probabilidad ≤10% y da más peso cuanto menor es su porcentaje; es un índice comparativo, no un número literal de objetos.</div>
      <div class="pg-u-sourcebox ${product.tone}">
        <div><b>Fuente de productividad:</b> ${esc(product.text)}<br>${dailyDescription(result.dailyBonus)} · <b>MT:</b> ${cfg.useTM ? 'incluidas' : 'excluidas'} · <b>VIP:</b> ${cfg.vipActive ? 'activo' : 'inactivo'}</div>
        <div class="pg-u-daily">${dailyControlHtml(cfg.dailyType || 'auto', result.dailyBonus)}${tmControlHtml(cfg.useTM)}${vipControlHtml(cfg.vipActive)}</div>
      </div>
      <div class="pg-u-note">Pokémon activo: <b>${esc(result.lead?.name || 'Primer slot')}</b> Nv. ${fmt(finite(result.lead?.level))}. ${result.catchInfo.active ? `Auto Catch detectado; ball: ${fmt(result.catchInfo.ballPrice)} gold. La venta de capturas no interviene en este ranking.` : 'Auto Catch no interviene en este ranking.'}</div>
      <div class="pg-u-settings" ${cfg.mode === 'general' ? '' : 'style="display:none"'}>
        ${weightControlHtml('xpWeight', 'Peso XP', cfg.xpWeight)}
        ${weightControlHtml('lootWeight', 'Peso loot', cfg.lootWeight)}
        ${weightControlHtml('rareWeight', 'Peso drops raros', cfg.rareWeight)}
        ${weightControlHtml('goldWeight', 'Peso oro NPC', cfg.goldWeight)}
      </div>
      <div class="pg-u-table-head">
        <div></div>
        <div class="pg-u-col-name">Hunt</div>
        <div class="pg-u-col">PIWTools XP/h</div>
        <div class="pg-u-col">Tu XP/h</div>
        <div class="pg-u-col">Items/h</div>
        <div class="pg-u-col hide-mobile">Índice raro/h</div>
        <div class="pg-u-col hide-mobile">Oro NPC/h</div>
        <div class="pg-u-col hide-mobile">${cfg.mode === 'general' ? 'Score' : 'Kills/h'}</div>
      </div>
      <div>${topRows.map((row, index) => `
        <div class="pg-u-row ${index === 0 ? 'best' : ''}">
          <div class="pg-u-rank">${index === 0 ? '★' : index + 1}</div>
          <div><button class="pg-u-target" data-hunt-index="${index}" data-source="hunt" title="Ir directamente a cazar ${esc(row.hunt.name)}">${esc(row.hunt.name)} ${row.diff.level ? `<span style="color:#8491a3;font-weight:500">Nv. ${fmt(row.diff.level)}</span>` : ''}${row.dailyBoosted ? '<span class="pg-u-badge">+20% diario</span>' : ''}</button><div class="pg-u-sub">${esc(row.source)} · ${esc(row.diff.offense.move)}${row.diff.offense.isTM ? ' (MT)' : ''} ×${fmt(row.diff.offense.eff, 2)} · ${row.lootDataKnown}/${row.lootDataTotal} drops con rate visible · ${row.rareLootKnown || 0} raros ≤10%</div></div>
          <div class="pg-u-metric piw-xp"><b>${fmt(row.theoreticalXph)}</b></div>
          <div class="pg-u-metric real-xp"><b>${row.personal ? fmt(row.xph) : '—'}</b></div>
          <div class="pg-u-metric loot"><b>${fmt(row.lootPh, 2)}</b></div>
          <div class="pg-u-metric rare hide-mobile"><b>${fmt(row.rarePh, 2)}</b></div>
          <div class="pg-u-metric gold hide-mobile"><b>${fmt(row.netGoldPh)}</b></div>
          <div class="pg-u-metric score hide-mobile"><b>${cfg.mode === 'general' ? fmt(row.generalScore, 1) : fmt(row.kph)}</b></div>
        </div>`).join('') || '<div class="pg-u-empty">No se encontraron hunts desbloqueadas para el nivel actual de este Pokémon.</div>'}</div>`;
    shell(body);
  }

  function getGameTokens() {
    try { return JSON.parse(sessionStorage.getItem('pokeweb:tokens') || 'null'); }
    catch { return null; }
  }

  async function refreshGameAccessToken() {
    const tokens = getGameTokens();
    if (!tokens?.refreshToken) return null;
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken })
    });
    if (!response.ok) return null;
    const refreshed = await response.json().catch(() => null);
    if (!refreshed?.accessToken) return null;
    sessionStorage.setItem('pokeweb:tokens', JSON.stringify(refreshed));
    return refreshed.accessToken;
  }

  function pokedexCaughtState(value) {
    const caught = value?.caught;
    if (caught === true || caught === 1 || String(caught).toLowerCase() === 'true') return true;
    if (caught === false || caught === 0 || String(caught).toLowerCase() === 'false') return false;
    return null;
  }

  function dedupePokedexEntries(entries) {
    const seen = new Set();
    const output = [];

    for (const entry of entries || []) {
      const id = pokedexSpeciesId(entry);
      const name = pokedexSpeciesName(entry);
      const key = id ? `id:${id}` : name ? `name:${name}` : '';
      if (!key || seen.has(key)) continue;
      seen.add(key);
      output.push(entry);
    }

    return output;
  }

  function normalizePokedexPayload(payload, sourceMode = 'api-directa') {
    const species = Array.isArray(payload?.species)
      ? payload.species
      : Array.isArray(payload?.data?.species)
        ? payload.data.species
        : null;

    if (!species) {
      throw new Error('La API /api/game/pokedex devolvió un formato no reconocido: falta species[].');
    }

    const normalizedSpecies = species
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => ({ ...entry }));

    if (!normalizedSpecies.length) {
      throw new Error('La API /api/game/pokedex no devolvió especies.');
    }

    const withoutId = normalizedSpecies.filter(entry => !pokedexSpeciesId(entry));
    if (withoutId.length) {
      throw new Error(`La API /api/game/pokedex devolvió ${withoutId.length} especies sin ID.`);
    }

    const withoutCaughtState = normalizedSpecies.filter(entry => pokedexCaughtState(entry) === null);
    if (withoutCaughtState.length) {
      throw new Error(
        `La API /api/game/pokedex devolvió ${withoutCaughtState.length} especies sin un estado caught válido.`
      );
    }

    const caughtSpecies = dedupePokedexEntries(
      normalizedSpecies.filter(entry => pokedexCaughtState(entry) === true)
    );
    const notCaughtSpecies = dedupePokedexEntries(
      normalizedSpecies.filter(entry => pokedexCaughtState(entry) === false)
    );
    const allSpecies = dedupePokedexEntries(normalizedSpecies);

    return {
      payload,
      species: allSpecies,
      caughtSpecies,
      notCaughtSpecies,
      caughtCount: caughtSpecies.length,
      notCaughtCount: notCaughtSpecies.length,
      hasExplicitLists: true,
      sourceMode,
      debug: {
        endpoint: '/api/game/pokedex',
        unlockKills: Number.isFinite(Number(payload?.unlockKills))
          ? Number(payload.unlockKills)
          : null,
        totalSpecies: allSpecies.length,
        caught: caughtSpecies.length,
        notCaught: notCaughtSpecies.length
      }
    };
  }

  async function fetchPokedexPayload() {
    const send = accessToken => fetch('/api/game/pokedex', {
      method: 'GET',
      credentials: 'same-origin',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    });

    let response = await send(getGameTokens()?.accessToken);

    if (response.status === 401) {
      const refreshedToken = await refreshGameAccessToken();
      if (refreshedToken) response = await send(refreshedToken);
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload?.message || `No se pudo consultar /api/game/pokedex (HTTP ${response.status}).`
      );
    }

    return {
      payload,
      status: response.status
    };
  }

  async function loadPokedex(force = false) {
    if (!force && pokedexCache && Date.now() - pokedexCacheAt < 15_000) {
      return pokedexCache;
    }

    try {
      const { payload, status } = await fetchPokedexPayload();
      const nextPokedex = normalizePokedexPayload(payload, 'api-directa-/api/game/pokedex');
      nextPokedex.debug.httpStatus = status;
      nextPokedex.debug.usedWindowCache = false;

      pokedexCache = nextPokedex;
      pokedexCacheAt = Date.now();
      return pokedexCache;
    } catch (error) {
      /*
       * Fallback únicamente a la caché de la MISMA API que mantiene PokeGrid.
       * No se vuelve al DOM ni se deduce el estado por otros campos.
       */
      const gameCache = window.__poke?.api?.['/api/game/pokedex'];
      if (gameCache) {
        try {
          const nextPokedex = normalizePokedexPayload(
            gameCache,
            'cache-window.__poke.api-/api/game/pokedex'
          );
          nextPokedex.debug.httpStatus = null;
          nextPokedex.debug.usedWindowCache = true;
          nextPokedex.debug.directRequestError = String(error?.message || error);

          pokedexCache = nextPokedex;
          pokedexCacheAt = Date.now();
          return pokedexCache;
        } catch {}
      }

      throw error;
    }
  }

  function pokedexSpeciesId(value) {
    const id = value?.id ?? value?.pokeId ?? value?.speciesId ?? value?.pokemonId;
    return id === undefined || id === null || id === '' ? '' : String(id);
  }

  function pokedexSpeciesName(value) {
    return norm(value?.name ?? value?.pokemonName ?? value?.speciesName ?? value?.creatureName ?? '');
  }

  function isPokedexSpeciesCaught(value) {
    return pokedexCaughtState(value) === true;
  }

  function huntSpeciesId(value) {
    const hunt=value?.hunt||value||{};
    return pokedexSpeciesId(hunt?.creature) || pokedexSpeciesId(hunt?.marker);
  }

  function huntSpeciesNames(value) {
    const hunt=value?.hunt||value||{};
    return [...new Set([
      hunt?.creature?.name,hunt?.name,hunt?.marker?.pokemonName,hunt?.marker?.name,hunt?.slug
    ].filter(Boolean).map(norm).filter(Boolean))];
  }

  const OUTLAND_VARIANT_WORDS = new Set([
    'tribal','outland','outlands','ancient','ancestral','alpha','armored','armoured',
    'corrupted','cursed','dark','desert','forest','frozen','jungle','mountain',
    'primal','royal','savage','shadow','swamp','volcanic','wild',
    'alolan','galarian','hisuian','paldean'
  ]);

  function stripVariantWords(value) {
    const words=norm(value).split(' ').filter(Boolean);
    while(words.length>1&&OUTLAND_VARIANT_WORDS.has(words[0]))words.shift();
    while(words.length>1&&OUTLAND_VARIANT_WORDS.has(words[words.length-1]))words.pop();
    return words.join(' ');
  }

  function compactSpeciesName(value) {
    return norm(value).replace(/\s+/g,'');
  }

  // Distancia de Damerau-Levenshtein restringida: además de inserciones,
  // borrados y sustituciones, reconoce una transposición adyacente.
  // Esto cubre diferencias reales observadas como Feraligart/Feraligatr.
  function speciesNameDistance(left,right,limit=2) {
    const a=compactSpeciesName(left),b=compactSpeciesName(right);
    if(a===b)return 0;
    if(Math.abs(a.length-b.length)>limit)return limit+1;
    const matrix=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
    for(let i=0;i<=a.length;i++)matrix[i][0]=i;
    for(let j=0;j<=b.length;j++)matrix[0][j]=j;
    for(let i=1;i<=a.length;i++){
      let rowMin=Infinity;
      for(let j=1;j<=b.length;j++){
        const cost=a[i-1]===b[j-1]?0:1;
        let value=Math.min(
          matrix[i-1][j]+1,
          matrix[i][j-1]+1,
          matrix[i-1][j-1]+cost
        );
        if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]){
          value=Math.min(value,matrix[i-2][j-2]+1);
        }
        matrix[i][j]=value;
        rowMin=Math.min(rowMin,value);
      }
      if(rowMin>limit)return limit+1;
    }
    return matrix[a.length][b.length];
  }

  function fuzzySpeciesMatch(huntName,dexName) {
    const hunt=compactSpeciesName(huntName),dex=compactSpeciesName(dexName);
    if(hunt.length<6||dex.length<6||Math.abs(hunt.length-dex.length)>2)return false;
    if(hunt.slice(0,4)!==dex.slice(0,4))return false;
    const allowed=Math.max(hunt.length,dex.length)>=15?2:1;
    return speciesNameDistance(hunt,dex,allowed)<=allowed;
  }

  function resolveDexSpecies(value, byId, byName) {
    const names=huntSpeciesNames(value);

    // 1. Nombre exacto antes que ID: las variantes de Outlands pueden tener
    // un ID propio aunque la Pokédex las agrupe bajo la especie normal.
    for(const name of names)if(byName.has(name))return byName.get(name);

    // 2. Elimina prefijos/sufijos regionales conocidos, por ejemplo "Tribal".
    const stripped=[...new Set(names.map(stripVariantWords).filter(Boolean))];
    for(const name of stripped)if(byName.has(name))return byName.get(name);

    // 3. Busca la especie base dentro del nombre de la variante y tolera
    // una errata/transposición corta entre el nombre de la hunt y la Pokédex.
    let best=null,bestScore=-1;
    for(const huntName of [...names,...stripped]){
      const padded=` ${huntName} `;
      for(const [dexName,entry] of byName){
        let score=-1;
        if(padded.includes(` ${dexName} `))score=300+dexName.length;
        else if(huntName.endsWith(` ${dexName}`)||huntName.startsWith(`${dexName} `))score=250+dexName.length;
        else if(fuzzySpeciesMatch(huntName,dexName))score=200+dexName.length;
        if(score>bestScore){best=entry;bestScore=score;}
      }
    }
    if(best)return best;

    // 4. El ID queda como último recurso para especies sin variante nominal.
    const id=huntSpeciesId(value);
    return id&&byId.has(id)?byId.get(id):null;
  }

  function buildNotCaughtResult(huntResult, pokedex) {
    const canonicalKey = entry => {
      const id = pokedexSpeciesId(entry);
      const name = pokedexSpeciesName(entry);
      return id ? `id:${id}` : name ? `name:${name}` : '';
    };

    const requiredLevel = hunt => Math.max(1, finite(
      hunt?.marker?.level,
      hunt?.marker?.lvl,
      hunt?.marker?.minLevel,
      hunt?.creature?.huntLevel,
      1
    ));

    const isAccessible = hunt => requiredLevel(hunt) <= Math.max(1, finite(huntResult?.lead?.level, 1));

    /*
     * La Pokédex sigue siendo la única fuente que decide qué especies faltan.
     * Después se consulta el catálogo COMPLETO de hunts del mapa. Las filas
     * calculadas solo aportan XP/h y kills/h; ya no deciden si una especie
     * disponible debe aparecer o no.
     */
    const enrichDexEntry = entry => {
      const id = pokedexSpeciesId(entry);
      const creature = id
        ? huntResult?.data?.creaturesById?.get?.(String(id))
        : null;
      if (!creature?.name || pokedexSpeciesName(entry)) return entry;
      return { ...entry, name: creature.name };
    };

    const officialPending = dedupePokedexEntries(
      (pokedex.notCaughtSpecies || []).map(enrichDexEntry)
    );

    const officialCaught = dedupePokedexEntries(
      (pokedex.caughtSpecies || []).map(enrichDexEntry)
    );

    const pendingById = new Map();
    const pendingByName = new Map();
    const pendingOrder = new Map();

    officialPending.forEach((entry, index) => {
      const id = pokedexSpeciesId(entry);
      const name = pokedexSpeciesName(entry);
      const key = canonicalKey(entry);
      if (id) pendingById.set(id, entry);
      if (name) pendingByName.set(name, entry);
      if (key) pendingOrder.set(key, index);
    });

    // Mejor resultado calculado por especie. huntResult.rows ya está ordenado
    // de mejor a peor según el ranking de Hunt Intelligence.
    const bestCalculatedBySpecies = new Map();
    for (const row of huntResult.rows || []) {
      const pendingEntry = resolveDexSpecies(row, pendingById, pendingByName);
      if (!pendingEntry) continue;
      const key = canonicalKey(pendingEntry);
      if (!key || bestCalculatedBySpecies.has(key)) continue;
      bestCalculatedBySpecies.set(key, {
        ...row,
        dexEntry: pendingEntry,
        calculationAvailable: true
      });
    }

    // Hunts existentes y desbloqueadas, aunque el motor no haya podido generar
    // una estimación de rendimiento con el Pokémon equipado.
    const accessibleHuntsBySpecies = new Map();
    for (const hunt of huntResult?.data?.hunts || []) {
      if (!hunt || !isAccessible(hunt)) continue;

      const pendingEntry = resolveDexSpecies(hunt, pendingById, pendingByName);
      if (!pendingEntry) continue;

      const key = canonicalKey(pendingEntry);
      if (!key) continue;

      const candidates = accessibleHuntsBySpecies.get(key) || [];
      candidates.push(hunt);
      accessibleHuntsBySpecies.set(key, candidates);
    }

    const huntPreference = (hunt, pendingEntry) => {
      const speciesName = pokedexSpeciesName(pendingEntry);
      const names = huntSpeciesNames(hunt);
      const stripped = names.map(stripVariantWords);
      if (names.includes(speciesName)) return 0;
      if (stripped.includes(speciesName)) return 1;
      return 2;
    };

    for (const [key, candidates] of accessibleHuntsBySpecies) {
      const pendingEntry = officialPending.find(entry => canonicalKey(entry) === key);
      candidates.sort((left, right) =>
        huntPreference(left, pendingEntry) - huntPreference(right, pendingEntry)
        || requiredLevel(left) - requiredLevel(right)
        || String(left?.name || '').localeCompare(String(right?.name || ''), 'es')
      );
    }

    const calculatedRows = [];
    const availabilityOnlyRows = [];
    let totalNoAccessibleHunt = 0;

    for (const pendingEntry of officialPending) {
      const key = canonicalKey(pendingEntry);
      if (!key) continue;

      const calculated = bestCalculatedBySpecies.get(key);
      if (calculated) {
        calculatedRows.push(calculated);
        continue;
      }

      const fallbackHunt = accessibleHuntsBySpecies.get(key)?.[0];
      if (fallbackHunt) {
        availabilityOnlyRows.push({
          hunt: fallbackHunt,
          dexEntry: pendingEntry,
          calculationAvailable: false,
          xph: null,
          kph: null,
          diff: null,
          dailyBoosted: false,
          source: 'Hunt disponible · sin cálculo con el equipo actual'
        });
      } else {
        totalNoAccessibleHunt += 1;
      }
    }

    // Conserva el ranking por XP/h para las filas calculadas. Las especies
    // disponibles sin cálculo se añaden después siguiendo el orden de Not Caught.
    calculatedRows.sort((a, b) => finite(b.xph) - finite(a.xph));
    availabilityOnlyRows.sort((a, b) =>
      finite(pendingOrder.get(canonicalKey(a.dexEntry)), Number.MAX_SAFE_INTEGER)
      - finite(pendingOrder.get(canonicalKey(b.dexEntry)), Number.MAX_SAFE_INTEGER)
    );

    const rows = [...calculatedRows, ...availabilityOnlyRows];

    return {
      ...huntResult,
      rows,
      totalUncaught: officialPending.length,
      totalCaught: pokedex.caughtCount !== null
        && pokedex.caughtCount !== undefined
        && Number.isFinite(Number(pokedex.caughtCount))
          ? Number(pokedex.caughtCount)
          : (officialCaught.length || null),
      totalCalculated: calculatedRows.length,
      totalWithoutCalculation: availabilityOnlyRows.length,
      totalNoAccessibleHunt,
      pokedexSourceMode: pokedex.sourceMode,
      officialPending
    };
  }

  async function loadNotCaught(force = false) {
    if (busy) return;
    busy = true;
    activeTab = 'notcaught';
    renderLoading('Consultando /api/game/pokedex y calculando las hunts pendientes…');
    try {
      const [huntResult, pokedex] = await Promise.all([
        H().calculateRecommendations(force),
        loadPokedex(force)
      ]);
      lastHuntResult = huntResult;
      lastNotCaughtResult = buildNotCaughtResult(huntResult, pokedex);
      renderNotCaught(lastNotCaughtResult);
    } catch (error) {
      console.error('[Hunt Intelligence · No capturados]', error);
      renderError(error?.message || 'No se pudo consultar la Pokédex.');
    } finally { busy = false; }
  }

  function renderNotCaught(result) {
    const unavailable = Math.max(0, finite(result.totalNoAccessibleHunt, finite(result.totalUncaught) - result.rows.length));
    const withoutCalculation = Math.max(0, finite(result.totalWithoutCalculation));
    const hasCaughtCount = result.totalCaught !== null
      && result.totalCaught !== undefined
      && Number.isFinite(Number(result.totalCaught));
    const pokedexSummary = hasCaughtCount
      ? `${fmt(result.totalCaught)} capturadas`
      : `${fmt(result.totalUncaught)} pendientes en Not Caught`;
    const body = `
      <div class="pg-u-note"><b>No capturados:</b> consulta directamente <b>/api/game/pokedex</b> y usa únicamente las especies con <b>caught: false</b>. Ya no abre, pulsa ni recorre la Pokédex visual.</div>
      <div class="pg-u-caught-summary"><span><b>${fmt(result.rows.length)}</b> especies pendientes con hunt accesible${withoutCalculation ? ` · ${fmt(withoutCalculation)} sin cálculo` : ''}</span><span>${pokedexSummary}${unavailable ? ` · ${fmt(unavailable)} pendientes sin hunt accesible` : ''}</span></div>
      <div data-notcaught-list>${result.rows.map((row, index) => {
        const officialName = String(
          row.dexEntry?.name
          ?? row.dexEntry?.pokemonName
          ?? row.dexEntry?.speciesName
          ?? row.dexEntry?.creatureName
          ?? ''
        ).trim();
        const pokemonName = officialName || row.hunt?.creature?.name || row.hunt?.name || 'Pokémon';
        const huntName = row.hunt?.name || row.hunt?.creature?.name || pokemonName;
        const calculated = row.calculationAvailable !== false
          && Number.isFinite(Number(row.xph))
          && Number.isFinite(Number(row.kph));
        const requiredLevel = finite(
          row.diff?.level,
          row.hunt?.marker?.level,
          row.hunt?.marker?.lvl,
          row.hunt?.marker?.minLevel,
          row.hunt?.creature?.huntLevel,
          1
        );
        const subtitle = calculated
          ? `Hunt: ${esc(huntName)}${row.dailyBoosted ? ' · +20% diario' : ''}`
          : `Hunt: ${esc(huntName)} · disponible, sin cálculo con el equipo actual`;
        return `<div class="pg-u-row">
          <div class="pg-u-rank">${calculated ? '○' : '◇'}</div>
          <div><button class="pg-u-target" data-hunt-index="${index}" data-source="notcaught" title="Ir directamente a cazar ${esc(pokemonName)}">${esc(pokemonName)}</button><div class="pg-u-sub">${subtitle}</div></div>
          <div class="pg-u-metric xp"><b>${calculated ? fmt(row.xph) : '—'}</b><br><small>XP/h</small></div>
          <div class="pg-u-metric speed"><b>${calculated ? fmt(row.kph) : '—'}</b><br><small>kills/h</small></div>
          <div class="pg-u-metric hide-mobile"><b>${fmt(requiredLevel)}</b><br><small>nivel</small></div>
          <div class="pg-u-metric eff hide-mobile"><b>${calculated ? `×${fmt(row.diff?.offense?.eff, 2)}` : '—'}</b><br><small>efectividad</small></div>
        </div>`;
      }).join('') || '<div class="pg-u-empty">No quedan Pokémon sin capturar con una hunt accesible. ¡Pokédex al día!</div>'}</div>`;
    shell(body);
  }

  function renderItemInitial() {
    activeTab = 'item';
    const last = I()?.getLastItem?.() || '';
    shell(`
      <form class="pg-u-search" data-form><input data-query list="${NS}-items" placeholder="Nombre del item" value="${esc(last)}"><datalist id="${NS}-items"></datalist><button type="submit" data-item-search>Buscar</button></form>
      <div class="pg-u-empty">Escribe el objeto que quieres conseguir. El resultado usa la productividad de PIWTools, el drop rate del juego y el bonus diario por tipo.</div>`,
      { after: overlay => setupItemForm(overlay, true) });
  }

  function setupItemForm(overlay, focus = false) {
    const form = overlay.querySelector('[data-form]');
    const input = form?.querySelector('[data-query]');
    const submitSearch = event => {
      event?.preventDefault?.();
      runItemSearch(input?.value || '', false);
    };
    form?.addEventListener('submit', submitSearch);
    input?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) submitSearch(event);
    });
    populateDatalist(overlay).catch(() => {});
    if (focus) setTimeout(() => input?.focus(), 30);
  }

  async function populateDatalist(overlay) {
    const data = await I().loadData(false);
    const list = overlay.querySelector(`#${CSS.escape(`${NS}-items`)}`);
    if (list) list.innerHTML = data.items.slice(0, 1800).map(item => `<option value="${esc(item.name)}"></option>`).join('');
  }

  async function runItemSearch(query, force = false) {
    query = String(query || '').trim();
    if (!query) { renderItemInitial(); return; }
    if (busy) return;
    busy = true; activeTab = 'item'; I().setLastItem(query);
    shell(`<form class="pg-u-search" data-form><input data-query value="${esc(query)}"><button type="submit" data-item-search>Buscar</button></form><div class="pg-u-empty">Buscando “${esc(query)}” con productividad de PIWTools…</div>`, { after: setupItemForm });
    try { lastItemResult = await I().searchItem(query, force); renderItem(lastItemResult); }
    catch (error) { console.error('[Item Finder]', error); renderError(error?.message || 'No se pudo completar la búsqueda.'); }
    finally { busy = false; }
  }

  function renderItem(result) {
    const cfg = H().getConfig();
    const best = result.rows[0];
    const knownRows = result.rows.filter(row => row.itemsPh !== null);
    const rateWarning = result.rows.some(row => !row.theoreticalKnown);
    const product = productivityDescription(result.productivity);
    const body = `
      <form class="pg-u-search" data-form><input data-query list="${NS}-items" value="${esc(result.item.name)}"><datalist id="${NS}-items"></datalist><button type="submit" data-item-search>Buscar</button></form>
      <div class="pg-u-sourcebox ${product.tone}">
        <div><b>Fuente de productividad:</b> ${esc(product.text)}<br>${dailyDescription(result.dailyBonus)} · <b>MT:</b> ${cfg.useTM ? 'incluidas' : 'excluidas'} · <b>VIP:</b> ${cfg.vipActive ? 'activo' : 'inactivo'}</div>
        <div class="pg-u-daily">${dailyControlHtml(cfg.dailyType || 'auto', result.dailyBonus)}${tmControlHtml(cfg.useTM)}${vipControlHtml(cfg.vipActive)}</div>
      </div>
      <div class="pg-u-note">Pokémon utilizado para calcular la velocidad: <b>${esc(result.lead.name || 'Primer slot')}</b> Nv. ${fmt(finite(result.lead.level))}. Pulsa directamente sobre un Pokémon para iniciar esa hunt. ${rateWarning ? 'Algunos drops aparecen sin porcentaje; en esos casos se confirma el drop, pero no se inventa un valor de items/h.' : 'El drop rate del juego se combina con las kills/h de PIWTools.'}</div>
      ${best ? `<div class="pg-u-hero"><div>Mejor objetivo para <b>${esc(result.item.name)}</b></div><button class="pg-u-target" data-hunt-index="0" data-source="item">${esc(best.hunt.name)}${best.dailyBoosted ? '<span class="pg-u-badge">+20% diario</span>' : ''}</button><div style="margin-top:4px;font-size:11px;color:#a9b7c8">${best.itemsPh !== null ? `${fmt(best.itemsPh, 2)} items/h` : 'Drop confirmado, porcentaje no expuesto'} · ${fmt(best.kph)} kills/h · ${esc(best.source)}</div></div>` : ''}
      <div>${result.rows.slice(0, 12).map((row, index) => `
        <div class="pg-u-row ${index === 0 ? 'best' : ''}">
          <div class="pg-u-rank">${index === 0 ? '★' : index + 1}</div>
          <div><button class="pg-u-target" data-hunt-index="${index}" data-source="item" title="Ir directamente a cazar ${esc(row.hunt.name)}">${esc(row.hunt.name)} ${row.combat.level ? `<span style="color:#8491a3;font-weight:500">Nv. ${fmt(row.combat.level)}</span>` : ''}${row.dailyBoosted ? '<span class="pg-u-badge">+20% diario</span>' : ''}</button><div class="pg-u-sub">${esc(row.source)} · ${fmt(row.combat.hits, 2)} golpes · ${esc(row.combat.best.move)}${row.combat.best.isTM ? ' (MT)' : ''} ×${fmt(row.combat.best.eff, 2)}</div></div>
          <div class="pg-u-metric rate"><b>${row.perKill !== null ? fmt(row.perKill * 100, 3) + '%' : '—'}</b><br><small>items/kill</small></div>
          <div class="pg-u-metric speed"><b>${fmt(row.kph)}</b><br><small>kills/h</small></div>
          <div class="pg-u-metric items hide-mobile"><b>${row.itemsPh !== null ? fmt(row.itemsPh, 2) : '—'}</b><br><small>items/h</small></div>
          <div class="pg-u-metric eff hide-mobile"><b>×${fmt(row.combat.best.eff, 2)}</b><br><small>efectividad</small></div>
        </div>`).join('') || `<div class="pg-u-empty">No encuentro ninguna hunt desbloqueada cuyo Pokémon pueda soltar <b>${esc(result.item.name)}</b>.</div>`}</div>
      ${knownRows.length === 0 && result.rows.length ? '<div class="pg-u-note" style="margin-top:12px">El juego confirma qué Pokémon lo sueltan, pero no expone el porcentaje. El script no utiliza tus sesiones ni inventa un drop rate.</div>' : ''}`;
    shell(body, { after: overlay => {
      setupItemForm(overlay, false);
    }});
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0;
  }

  function elementText(el) {
    const img = el?.querySelector?.('img');
    const attrs = el ? Array.from(el.attributes || []).filter(a => /^data-|title|aria-label|name|value|href$/i.test(a.name)).map(a => a.value) : [];
    return norm([el?.textContent, el?.title, el?.getAttribute?.('aria-label'), img?.alt, img?.src, ...attrs].filter(Boolean).join(' '));
  }

  function findInteractiveByRegex(regex, root = document) {
    const els = [...root.querySelectorAll('button,a,[role="button"],.dock-btn,[tabindex]')].filter(isVisible);
    return els.find(el => regex.test(elementText(el))) || null;
  }

  function currentSlug() {
    return norm(window.__poke?.ws?.['field-init']?.slug || window.__poke?.lastSlug || window.__poke?.sess?.slug || '');
  }

  async function waitFor(fn, timeout = 5000, interval = 100) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try { const result = fn(); if (result) return result; } catch {}
      await sleep(interval);
    }
    return null;
  }

  function huntTerms(hunt) {
    const raw = [hunt?.name, hunt?.slug, hunt?.marker?.slug, hunt?.marker?.hunt, hunt?.marker?.pokemonName, hunt?.creature?.name]
      .filter(Boolean).map(norm).filter(Boolean);
    return [...new Set(raw.flatMap(t => [t, t.replace(/\b(level|lvl|nv)\s*\d+\b/g, '').trim()]).filter(Boolean))];
  }

  function scoreTarget(el, hunt, root) {
    if (!isVisible(el) || el.closest(`#${PANEL_ID}`)) return -1;
    const text = elementText(el); if (!text) return -1;
    let score = 0;
    for (const term of huntTerms(hunt)) {
      if (text === term) score = Math.max(score, 100);
      else if (text.includes(term)) score = Math.max(score, 75 + Math.min(15, term.length));
      else {
        const words = term.split(' ').filter(w => w.length > 2);
        const hits = words.filter(w => text.includes(w)).length;
        if (hits && hits === words.length) score = Math.max(score, 55 + hits * 4);
      }
    }
    const sid = String(hunt?.marker?.speciesId ?? hunt?.marker?.pokeId ?? hunt?.creature?.speciesId ?? hunt?.creature?.pokeId ?? '');
    if (sid && text.includes(sid)) score += 25;
    if (root && root.contains(el)) score += 15;
    if (/marker|hunt|pokemon|poke|map/.test(norm(el.className))) score += 8;
    return score;
  }

  function findMapRoot() {
    const selectors = ['.map-window','.world-map','.map-modal','.map-overlay','[data-window="map"]','[class*="map-window"]','[class*="world-map"]','[class*="map-modal"]'];
    for (const sel of selectors) { const el = [...document.querySelectorAll(sel)].find(isVisible); if (el) return el; }
    const headings = [...document.querySelectorAll('h1,h2,h3,.title,.window-title')].filter(isVisible).find(el => /(^|\W)(map|mapa)(\W|$)/i.test(el.textContent || ''));
    return headings?.closest('section,dialog,[role="dialog"],.window,.modal,div') || null;
  }

  function findMapButton() {
    return findInteractiveByRegex(/(^|\W)(map|mapa)(\W|$)/i);
  }

  const REGION_NAMES = [
    'kanto','outland','orre','johto','hoenn','sinnoh','unova','teselia','kalos','alola',
    'galar','paldea','hisui','sevii','islas sete','orange','fiore','almia','oblivia'
  ];

  function regionTermsForHunt(hunt) {
    const sources = [
      hunt?.marker?.region, hunt?.marker?.regionName, hunt?.marker?.continent,
      hunt?.marker?.continentName, hunt?.marker?.world, hunt?.marker?.area,
      hunt?.marker?.zone, hunt?.marker?.map, hunt?.marker?.location,
      hunt?.creature?.region, hunt?.creature?.continent, hunt?.creature?.area
    ];
    const terms = sources.flatMap(value => {
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') return [value.name, value.slug, value.id];
      return [value];
    }).filter(Boolean).map(norm).filter(Boolean);
    return [...new Set(terms.flatMap(term => [term, ...REGION_NAMES.filter(name => term.includes(name))]))];
  }

  function regionTabScore(el, root) {
    if (!isVisible(el) || el.closest(`#${PANEL_ID}`)) return -1;
    const text = elementText(el);
    if (!text) return -1;
    const meta = norm([
      el.getAttribute?.('role'), el.id, el.className,
      el.getAttribute?.('data-region'), el.getAttribute?.('data-continent'),
      el.getAttribute?.('data-area'), el.getAttribute?.('aria-controls')
    ].filter(Boolean).join(' '));
    const insideMap = root === document || !!root?.contains(el);
    const known = REGION_NAMES.some(name => text.includes(name) || meta.includes(name));
    const regionSemantic = /region|continent|world|area|zone/.test(meta);
    const tabSemantic = el.getAttribute?.('role') === 'tab' || /tab/.test(meta);
    const inTabList = !!el.closest?.('[role="tablist"],.tabs,[class*="tabs"],[class*="region"],[class*="continent"]');
    if (!known && !regionSemantic && !(insideMap && (tabSemantic || inTabList))) return -1;
    if (text.length > 180 && !known && !regionSemantic) return -1;
    if (/hunt|cazar|caçar|start|iniciar|market|mercado|item|stone/.test(text) && !known) return -1;
    let score = 0;
    if (known) score += 60;
    if (regionSemantic) score += 35;
    if (insideMap && el.getAttribute?.('role') === 'tab') score += 40;
    if (insideMap && tabSemantic) score += 20;
    if (insideMap && inTabList) score += 20;
    if (insideMap) score += 10;
    if (text.length <= 24) score += 8;
    return score;
  }

  function findRegionTabs() {
    const root = findMapRoot() || document;
    const selectors = [
      '[role="tab"]','[data-region]','[data-continent]','[data-area]',
      'button','a','[role="button"]','[tabindex]'
    ].join(',');
    const pools = root === document ? [document] : [root, document];
    const seen = new Set();
    const found = [];
    for (const scope of pools) {
      for (const el of scope.querySelectorAll(selectors)) {
        if (seen.has(el)) continue;
        seen.add(el);
        const score = regionTabScore(el, root);
        if (score >= 40) found.push({ el, score, label: elementText(el) });
      }
    }
    found.sort((a, b) => b.score - a.score);
    return found.map(entry => entry.el);
  }

  function isActiveRegionTab(el) {
    if (!el) return false;
    const aria = el.getAttribute?.('aria-selected');
    const pressed = el.getAttribute?.('aria-pressed');
    const meta = norm([el.className, el.getAttribute?.('data-state')].filter(Boolean).join(' '));
    return aria === 'true' || pressed === 'true' || /(^|\s)(active|selected|current|on)(\s|$)/.test(meta);
  }

  function mapSignature() {
    const root = findMapRoot() || document;
    const markerEls = [...root.querySelectorAll('.map-marker,[class*="marker"],[class*="hunt"],[data-slug],[data-pokemon],[data-species-id]')]
      .filter(isVisible).slice(0, 40);
    const active = findRegionTabs().filter(isActiveRegionTab).map(elementText).join('|');
    return `${active}::${markerEls.map(elementText).join('|').slice(0, 2500)}`;
  }

  async function selectRegionTab(tab) {
    if (!tab || !isVisible(tab)) return false;
    if (isActiveRegionTab(tab)) return true;
    const before = mapSignature();
    tab.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    tab.click();
    await waitFor(() => isActiveRegionTab(tab) || mapSignature() !== before, 2200, 100);
    await sleep(220);
    return true;
  }

  function findHuntMarker(hunt) {
    const root = findMapRoot() || document;
    const selectors = 'button,a,[role="button"],[tabindex],.map-marker,[class*="marker"],[class*="hunt"],[data-slug],[data-pokemon],[data-species-id]';
    const candidates = [...root.querySelectorAll(selectors)];
    let best = null, bestScore = 0;
    for (const el of candidates) {
      const score = scoreTarget(el, hunt, root);
      if (score > bestScore) { best = el; bestScore = score; }
    }
    return bestScore >= 55 ? best : null;
  }

  async function findHuntAcrossRegions(hunt) {
    let marker = findHuntMarker(hunt);
    if (marker) return marker;

    const desired = regionTermsForHunt(hunt);
    const tabs = findRegionTabs();
    const ordered = tabs.slice().sort((a, b) => {
      const aText = elementText(a), bText = elementText(b);
      const aMatch = desired.some(term => aText.includes(term) || term.includes(aText));
      const bMatch = desired.some(term => bText.includes(term) || term.includes(bText));
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
      if (isActiveRegionTab(a) !== isActiveRegionTab(b)) return isActiveRegionTab(a) ? 1 : -1;
      return 0;
    });

    const tried = new Set();
    for (const tab of ordered) {
      const label = elementText(tab) || 'otra región';
      if (tried.has(label)) continue;
      tried.add(label);
      if (isActiveRegionTab(tab)) continue;
      toast(`Buscando ${hunt.name || 'el objetivo'} en ${label}…`);
      await selectRegionTab(tab);
      marker = await waitFor(() => findHuntMarker(hunt), 2400, 120);
      if (marker) return marker;
    }
    return null;
  }

  function findStartButton(hunt) {
    const terms = huntTerms(hunt);
    const dialogs = [...document.querySelectorAll('dialog,[role="dialog"],.modal,.window,[class*="popup"],[class*="confirm"]')].filter(isVisible);
    const roots = dialogs.length ? dialogs.reverse() : [document];
    for (const root of roots) {
      const buttons = [...root.querySelectorAll('button,a,[role="button"]')].filter(b => isVisible(b) && b.id !== BUTTON_ID && !b.closest(`#${PANEL_ID}`));
      const contextual = norm(root.textContent || '');
      if (terms.length && !terms.some(t => contextual.includes(t)) && root !== document) continue;
      const preferred = buttons.find(b => /(^|\W)(hunt|cazar|caçar|start|iniciar|entrar|go)(\W|$)/i.test(elementText(b)) && !/(cancel|cancelar|close|fechar|volver|back)/i.test(elementText(b)));
      if (preferred) return preferred;
    }
    return null;
  }

  async function startHunt(hunt) {
    if (!hunt || busy) return;
    busy = true; suppressMapAutoOpenUntil = Date.now() + 25000;
    closePanel();
    const target = hunt.name || hunt.creature?.name || hunt.slug || 'objetivo';
    toast(`Abriendo mapa para cazar ${target}…`);
    try {
      const before = currentSlug();
      let marker = findHuntMarker(hunt);
      if (!marker) {
        const mapButton = findMapButton();
        if (!mapButton) throw new Error('No encuentro el botón Map/Mapa en esta pantalla.');
        mapButton.click();
        await waitFor(() => findMapRoot(), 5000, 120);
      }
      marker = await findHuntAcrossRegions(hunt);
      if (!marker) throw new Error(`El mapa se abrió y revisé sus regiones, pero no pude localizar a ${target}.`);
      marker.scrollIntoView?.({ block: 'center', inline: 'center' });
      marker.click();

      const targetTerms = huntTerms(hunt);
      const changed = await waitFor(() => {
        const now = currentSlug();
        return now && now !== before && targetTerms.some(t => now.includes(t) || t.includes(now));
      }, 1300, 100);
      if (!changed) {
        const start = await waitFor(() => findStartButton(hunt), 3000, 100);
        if (start) { start.click(); }
      }
      const confirmed = await waitFor(() => {
        const now = currentSlug();
        return now && targetTerms.some(t => now.includes(t) || t.includes(now));
      }, 5500, 150);
      if (confirmed) toast(`Hunt iniciada: ${target}`, 'ok');
      else toast(`He seleccionado ${target}, pero no pude confirmar que la hunt comenzara. Revisa la pantalla.`, 'bad');
    } catch (error) {
      console.error('[Hunt Advisor · iniciar hunt]', error);
      toast(error?.message || 'No se pudo iniciar la hunt.', 'bad');
    } finally { busy = false; }
  }

  function looksLikeMapButton(element) {
    const button = element?.closest?.('button,a,[role="button"],.dock-btn');
    if (!button || button.closest(`#${PANEL_ID}`)) return false;
    return /(^|\W)(map|mapa)(\W|$)/i.test(elementText(button));
  }


  function readButtonPosition() {
    try {
      const value = JSON.parse(localStorage.getItem(BUTTON_POS_KEY) || 'null');
      if (value && Number.isFinite(Number(value.left)) && Number.isFinite(Number(value.top))) {
        return { left: Number(value.left), top: Number(value.top) };
      }
    } catch {}
    return null;
  }

  function saveButtonPosition(button) {
    if (!button) return;
    const rect = button.getBoundingClientRect();
    try {
      localStorage.setItem(BUTTON_POS_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
    } catch {}
  }

  function clampFloatingButton(button, save = false) {
    if (!button?.isConnected) return;
    const rect = button.getBoundingClientRect();
    const margin = 4;
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    button.style.left = `${Math.max(margin, Math.min(rect.left, maxLeft))}px`;
    button.style.top = `${Math.max(margin, Math.min(rect.top, maxTop))}px`;
    button.style.right = 'auto';
    button.style.bottom = 'auto';
    if (save) saveButtonPosition(button);
  }

  function installDraggableButton(button) {
    if (!button || button.__pgDraggableInstalled) return;
    button.__pgDraggableInstalled = true;

    const saved = readButtonPosition();
    if (saved) {
      button.style.left = `${saved.left}px`;
      button.style.top = `${saved.top}px`;
      button.style.right = 'auto';
      button.style.bottom = 'auto';
      requestAnimationFrame(() => clampFloatingButton(button, false));
    }

    let drag = null;
    let suppressClickUntil = 0;

    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isTrusted) return;
      const rect = button.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        moved: false
      };
      try { button.setPointerCapture?.(event.pointerId); } catch {}
    });

    button.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      button.dataset.dragging = '1';
      const rect = button.getBoundingClientRect();
      const margin = 4;
      const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
      const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
      button.style.left = `${Math.max(margin, Math.min(drag.startLeft + dx, maxLeft))}px`;
      button.style.top = `${Math.max(margin, Math.min(drag.startTop + dy, maxTop))}px`;
      button.style.right = 'auto';
      button.style.bottom = 'auto';
      event.preventDefault();
    });

    const finish = event => {
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      const moved = drag.moved;
      drag = null;
      delete button.dataset.dragging;
      if (moved) {
        suppressClickUntil = Date.now() + 350;
        clampFloatingButton(button, true);
      }
    };

    button.addEventListener('pointerup', finish);
    button.addEventListener('pointercancel', finish);
    button.addEventListener('click', event => {
      if (Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);

    window.addEventListener('resize', () => clampFloatingButton(button, true));
  }

  function openFullFromButton(){panelCollapsed=false;activeTab='hunt';loadHunt(false);}
  function openCollapsedFromMap(){panelCollapsed=true;activeTab='hunt';loadHunt(false);}

  function install() {
    ensureStyles();
    activeTab='hunt';
    try { localStorage.removeItem(LEGACY_ACTIVE_TAB_KEY); } catch {}
    document.getElementById('pg-performance-supervisor-v1-button')?.remove();
    document.getElementById('pg-performance-supervisor-v1-panel')?.remove();
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement('button'); button.id = BUTTON_ID; button.type = 'button'; button.textContent = '🧠';
      button.setAttribute('aria-label', 'Abrir Hunt Intelligence');
      button.title = 'Hunt Intelligence · clic para abrir completo · mantén pulsado y arrastra para mover'; button.addEventListener('click', openFullFromButton);
      document.body.appendChild(button);
    }
    installDraggableButton(button);

    document.addEventListener('click', event => {
      if (Date.now() < suppressMapAutoOpenUntil) return;
      if (looksLikeMapButton(event.target)) { setTimeout(openCollapsedFromMap, 250); }
    }, true);
  }


  /* ---------------------------------------------------------------------- */
  /* Integración con PokeGrid Script Bridge. No altera la lógica del panel. */
  /* ---------------------------------------------------------------------- */
  const HEALTH_SCRIPT_ID = 'hunt-advisor';
  let healthClient = null;
  let healthTimer = null;

  function piwCacheHealth() {
    try {
      const cache = JSON.parse(localStorage.getItem('pg-piwtools-engine-v3:productivity-cache') || 'null');
      if (!cache || !cache.speeds) return { available: false, source: '', fetchedAt: 0, ageMinutes: null, count: 0, stale: false };
      const fetchedAt = Number(cache.fetchedAt) || 0;
      return {
        available: true,
        source: String(cache.source || 'PIWTools'),
        fetchedAt,
        ageMinutes: fetchedAt ? Math.max(0, (Date.now() - fetchedAt) / 60000) : null,
        count: Object.keys(cache.speeds || {}).length,
        stale: fetchedAt ? Date.now() - fetchedAt > 6 * 60 * 60 * 1000 : true
      };
    } catch {
      return { available: false, source: '', fetchedAt: 0, ageMinutes: null, count: 0, stale: false };
    }
  }

  function compactHuntResult(result) {
    if (!result) return null;
    const first = result.rows?.[0];
    return {
      generatedAt: Date.now(),
      rows: Array.isArray(result.rows) ? result.rows.length : 0,
      lead: result.lead ? { name: result.lead.name || '', level: Number(result.lead.level) || 0 } : null,
      best: first ? {
        name: first.hunt?.name || first.hunt?.creature?.name || first.hunt?.slug || '',
        kph: Number(first.kph) || 0,
        xph: Number(first.xph) || 0,
        dailyBoosted: Boolean(first.dailyBoosted)
      } : null,
      productivity: result.productivity ? {
        source: result.productivity.source || '',
        version: result.productivity.version || '',
        stale: Boolean(result.productivity.stale),
        count: Number(result.productivity.count) || 0
      } : null,
      dailyType: result.dailyBonus?.type || result.dailyBonus?.detectedType || '',
      useTM: Boolean(result.useTM)
    };
  }

  function huntHealthState() {
    const coreReady = Boolean(H()?.calculateRecommendations && I()?.searchItem && window.__PGPiwToolsEngine);
    const gameReady = Boolean(window.__poke?.ws && window.__poke?.api);
    const cache = piwCacheHealth();
    const panel = document.getElementById(PANEL_ID);
    const panelError = panel?.querySelector?.('.pg-u-empty')?.textContent || '';
    let status = 'ok';
    let statusText = 'Hunt Intelligence disponible.';
    if (!coreReady) {
      status = 'error';
      statusText = 'No se ha cargado correctamente el motor del Hunt Advisor.';
    } else if (!gameReady) {
      status = 'waiting';
      statusText = 'Esperando los datos iniciales del juego.';
    } else if (busy) {
      status = 'waiting';
      statusText = activeTab === 'item'
        ? 'Buscando el objeto solicitado.'
        : activeTab === 'notcaught'
          ? 'Consultando la Pokédex y las hunts pendientes.'
          : 'Calculando recomendaciones de hunt.';
    } else if (/no se pudo|error|fall[oó]/i.test(panelError)) {
      status = 'warning';
      statusText = panelError.trim().slice(0, 400);
    } else if (!cache.available && !lastHuntResult && !lastItemResult && !lastNotCaughtResult) {
      status = 'waiting';
      statusText = 'Preparado; PIWTools se cargará al realizar el primer cálculo.';
    } else if (cache.stale) {
      status = 'warning';
      statusText = 'Funcionando con una tabla de PIWTools antigua o en caché.';
    }
    return {
      status,
      statusText,
      dependencies: {
        gameData: { ok: gameReady, checkedAt: Date.now() },
        huntCore: { ok: Boolean(H()?.calculateRecommendations), checkedAt: Date.now() },
        itemCore: { ok: Boolean(I()?.searchItem), checkedAt: Date.now() },
        piwEngine: { ok: Boolean(window.__PGPiwToolsEngine), checkedAt: Date.now() }
      },
      metrics: {
        activeTab,
        busy,
        panelOpen: Boolean(panel?.isConnected),
        currentHunt: window.__poke?.ws?.['field-init']?.slug || window.__poke?.lastSlug || '',
        useTM: Boolean(H()?.getConfig?.().useTM),
        vipActive: Boolean(H()?.getConfig?.().vipActive),
        dailyTypeSetting: H()?.getConfig?.().dailyType || 'auto',
        dailyCycle: window.__PGPiwToolsEngine?.dailyCycleKey?.() || '',
        dailyDetectedTypes: window.__PGPiwToolsEngine?.detectDailyBonus?.()?.types || [],
        dailyDetection: window.__PGPiwToolsEngine?.getDailyDiagnostics?.() || null,
        personalCalibrations: Number(window.__PGPiwToolsEngine?.getCalibrationCount?.()) || 0,
        functionalTest: {
          ok: coreReady && gameReady,
          rankingEngine: Boolean(H()?.calculateRecommendations),
          itemFinder: Boolean(I()?.searchItem),
          notCaught: Boolean(lastNotCaughtResult || window.__poke?.api?.['/api/game/pokedex']),
          dailyAutomation: Boolean(window.__PGPiwToolsEngine?.isDailySettingValid?.())
        },
        piwtools: cache,
        lastHuntResult: compactHuntResult(lastHuntResult),
        notCaughtRows: Array.isArray(lastNotCaughtResult?.rows) ? lastNotCaughtResult.rows.length : 0,
        pokedexUncaught: Number(lastNotCaughtResult?.totalUncaught) || 0,
        lastItem: lastItemResult?.item?.name || I()?.getLastItem?.() || '',
        lastItemRows: Array.isArray(lastItemResult?.rows) ? lastItemResult.rows.length : 0
      }
    };
  }

  async function refreshCurrentHealthTarget(force = true) {
    if (activeTab === 'notcaught') {
      await loadNotCaught(force);
      return { tab: 'notcaught' };
    }
    if (activeTab === 'item') {
      const query = lastItemResult?.item?.name || I()?.getLastItem?.() || '';
      if (!query) throw new Error('No hay ningún objeto seleccionado en Item Finder.');
      await runItemSearch(query, force);
      return { tab: 'item', query };
    }
    if (activeTab === 'performance') { await renderPerformance(force); return { tab: 'performance' }; }
    if (activeTab === 'history') { await renderHistory(force); return { tab: 'history' }; }
    await loadHunt(force);
    return { tab: 'hunt' };
  }

  window.__PGHuntAdvisor = Object.freeze({
    version: '1.1.18',
    getState: huntHealthState,
    selfTest: () => ({
      ok: Boolean(H()?.calculateRecommendations && I()?.searchItem && window.__poke?.ws && window.__poke?.api),
      rankingEngine: Boolean(H()?.calculateRecommendations),
      itemFinder: Boolean(I()?.searchItem),
      dailyCycle: window.__PGPiwToolsEngine?.dailyCycleKey?.() || '',
      dailySetting: window.__PGPiwToolsEngine?.getDailyType?.() || 'auto',
      detectedTypes: window.__PGPiwToolsEngine?.detectDailyBonus?.()?.types || [],
      vipActive: Boolean(window.__PGPiwToolsEngine?.getVip?.()),
      supervisorReady: Boolean(S()?.getState)
    }),
    openHunt: () => { activeTab = 'hunt'; return loadHunt(false); },
    openNotCaught: () => { activeTab = 'notcaught'; return loadNotCaught(false); },
    openItem: query => { activeTab = 'item'; return runItemSearch(query || I()?.getLastItem?.() || '', false); },
    openPerformance: () => { activeTab = 'performance'; return renderPerformance(false); },
    openHistory: () => { activeTab = 'history'; return renderHistory(false); },
    refresh: () => refreshCurrentHealthTarget(true),
    getPokedexDebug: () => ({
      source: pokedexCache?.sourceMode || 'sin-cargar',
      ...(pokedexCache?.debug || {}),
      sampleNotCaught: (pokedexCache?.notCaughtSpecies || []).slice(0, 12).map(entry =>
        entry.name || entry.pokemonName || entry.speciesName || `#${pokedexSpeciesId(entry)}`
      )
    }),
    clearPiwToolsCache: () => {
      localStorage.removeItem('pg-piwtools-engine-v3:productivity-cache');
      return { cleared: true };
    }
  });

  function publishHuntHealth() {
    if (!healthClient) return;
    try {
      healthClient.heartbeat(huntHealthState());
    } catch (error) {
      try { healthClient.reportError(error, 'publish-health', { keepStatus: true }); } catch {}
    }
  }

  function connectHuntHealthBridge() {
    const bridge = window.__pokeGridScripts;
    if (!bridge?.register) return false;
    if (healthClient) return true;
    healthClient = bridge.register({
      id: HEALTH_SCRIPT_ID,
      name: 'Hunt Intelligence',
      version: '1.1.18',
      description: 'Ranking personal, Item Finder, rendimiento, histórico, VIP y bonus diario en un único motor.',
      icon: '🧠',
      category: 'gameplay-analysis',
      status: 'waiting',
      statusText: 'Preparando motores de cálculo.',
      staleAfterMs: 45000,
      capabilities: ['piwtools','hunt-ranking','pokedex-not-caught','item-finder','daily-bonus','daily-auto-reset','tm-toggle','vip-toggle','personal-history','personal-ranking']
    });
    healthClient.registerCommand('open-hunt', () => { activeTab = 'hunt'; loadHunt(false); return { opened: 'hunt' }; }, { label: 'Abrir Hunt Advisor' });
    healthClient.registerCommand('open-not-caught', () => { activeTab = 'notcaught'; loadNotCaught(false); return { opened: 'notcaught' }; }, { label: 'Abrir No capturados' });
    healthClient.registerCommand('open-item', args => { activeTab = 'item'; runItemSearch(args?.query || I()?.getLastItem?.() || '', false); return { opened: 'item' }; }, { label: 'Abrir Item Finder', args: { query: 'string' } });
    healthClient.registerCommand('open-performance', () => { activeTab='performance'; renderPerformance(false); return {opened:'performance'}; }, {label:'Abrir rendimiento'});
    healthClient.registerCommand('open-history', () => { activeTab='history'; renderHistory(false); return {opened:'history'}; }, {label:'Abrir histórico'});
    healthClient.registerCommand('refresh', () => refreshCurrentHealthTarget(true), { label: 'Actualizar datos' });
    healthClient.registerCommand('clear-piwtools-cache', () => window.__PGHuntAdvisor.clearPiwToolsCache(), { label: 'Limpiar caché PIWTools', dangerous: true });
    healthClient.registerTest?.(() => window.__PGHuntAdvisor.selfTest(), { label: 'Probar ranking, Item Finder y ciclo diario' });
    publishHuntHealth();
    healthTimer = setInterval(publishHuntHealth, 10000);
    return true;
  }

  window.addEventListener('pokegrid-health-bridge-ready', connectHuntHealthBridge);
  const huntBridgeTimer = setInterval(() => { if (connectHuntHealthBridge()) clearInterval(huntBridgeTimer); }, 1000);
  connectHuntHealthBridge();

  window.addEventListener('pokegrid-daily-bonus-updated', () => {
    if (busy) return;
    const overlay = document.getElementById(PANEL_ID);
    if (overlay?.isConnected) rerunActivePanel(false);
    publishHuntHealth();
  });

  window.__PGHuntIntelligence = Object.freeze({
    version: '1.1.18',
    openHunt: () => { activeTab='hunt'; return loadHunt(false); },
    openNotCaught: () => { activeTab='notcaught'; return loadNotCaught(false); },
    openItem: query => { activeTab='item'; return runItemSearch(query || I()?.getLastItem?.() || '', false); },
    openPerformance: () => { activeTab='performance'; return renderPerformance(false); },
    openHistory: () => { activeTab='history'; return renderHistory(false); },
    getVip: () => Boolean(H()?.getConfig?.()?.vipActive),
    setVip: value => H()?.setVip?.(Boolean(value)),
    getPokedexDebug: () => window.__PGHuntAdvisor?.getPokedexDebug?.() || null,
    getState: () => ({ hunt: huntHealthState(), supervisor: S()?.getState?.() || null })
  });

  window.addEventListener('pokegrid-vip-updated', () => {
    if (busy) return;
    const overlay = document.getElementById(PANEL_ID);
    if (overlay?.isConnected) rerunActivePanel(false);
    publishHuntHealth();
  });
  window.addEventListener('pokegrid-intelligence-updated', () => {
    if (busy) return;
    const overlay = document.getElementById(PANEL_ID);
    if (!overlay?.isConnected) return;
    if (activeTab === 'performance') renderPerformance(false);
    else if (activeTab === 'history') renderHistory(false);
  });

  install();
  console.info('[Hunt Intelligence] v1.1.18 cargado: Mejor general con XP, loot, rareza y oro; histórico o PIWTools sin calibración intermedia.');
})();

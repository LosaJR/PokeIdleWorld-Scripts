// ==UserScript==
// @name         Poke Idle World - Quality of Life (PIW-QOL ES)
// @namespace    http://tampermonkey.net/
// @version      9.10.33
// @description  Mejoras de calidad de vida en español, sin modificar el mapa y con candados de venta configurables.
// @author       Desjunior (JulianoCLI)
// @match        https://poke.idleworld.online/play
// @grant        none
// @run-at       document-start
// @updateURL     https://losajr.github.io/PokeIdleWorld-Scripts/piw-qol-es.meta.js
// @downloadURL   https://losajr.github.io/PokeIdleWorld-Scripts/piw-qol-es.user.js
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_BUILD = '9.10.33';

    const NativeWebSocket = window.WebSocket;
    const nativeWebSocketSend = NativeWebSocket.prototype.send;
    let gameSocket = null;
    let latestInventory = null;
    let latestPokemon = null;
    let latestFamily = null;
    let captureQualityHistory = [];
    let pendingCaptureResults = [];
    let recentPokemonAdditions = [];
    let pokemonRefreshPromise = null;
    let lastPokemonRefreshAt = 0;
    let captureLogSyncPromise = null;
    const captureLogWindowState = new WeakMap();
    const gameEventWaiters = new Map();
    const trackedGameSockets = new WeakSet();

    function handleGameSocketMessage(event) {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch {
            return;
        }
        if (message?.type === 'inventory') latestInventory = message.items || [];
        if (message?.type === 'family') latestFamily = message;
        if (message?.type === 'catch-result') {
            // Solo una captura REAL puede abrir una asociación pendiente.
            // Los intentos fallidos no deben quedar en cola porque podrían apropiarse
            // del Pokémon de una captura posterior.
            if (message.success === true) {
                rememberCaptureResult(message);
                // `poke-delta` es la fuente primaria; estas consultas quedan únicamente
                // como respaldo por si en algún caso el servidor omite el delta.
                scheduleBackgroundCaptureSync();
            } else {
                purgePendingCaptureResults();
            }
        }
        if (message?.type === 'poke-delta') {
            rememberCapturedPokemonDelta(message);
        }
        if (message?.type === 'pokes') {
            const nextPokemon = message.list || [];
            rememberRecentPokemonAdditions(latestPokemon, nextPokemon);
            reconcileCapturedPokemon(latestPokemon, nextPokemon);
            latestPokemon = nextPokemon;
            lastPokemonRefreshAt = Date.now();
            setTimeout(() => {
                enhancePartyQuality();
                enhanceCaptureLogQuality();
            }, 0);
        }
        const waiters = gameEventWaiters.get(message?.type);
        if (waiters) {
            gameEventWaiters.delete(message.type);
            waiters.forEach(resolve => resolve(message));
        }
    }

    function trackGameSocket(socket, url = socket?.url) {
        if (!socket || !String(url || '').includes('/ws')) return socket;
        gameSocket = socket;
        if (trackedGameSockets.has(socket)) return socket;
        trackedGameSockets.add(socket);
        socket.addEventListener('message', handleGameSocketMessage);
        socket.addEventListener('close', () => {
            if (gameSocket === socket) gameSocket = null;
        });
        return socket;
    }

    function TrackedWebSocket(url, protocols) {
        const socket = protocols === undefined
            ? new NativeWebSocket(url)
            : new NativeWebSocket(url, protocols);
        return trackGameSocket(socket, url);
    }
    TrackedWebSocket.prototype = NativeWebSocket.prototype;
    Object.setPrototypeOf(TrackedWebSocket, NativeWebSocket);
    window.WebSocket = TrackedWebSocket;
    NativeWebSocket.prototype.send = function(data) {
        trackGameSocket(this);
        return nativeWebSocketSend.call(this, data);
    };

    function sendGameMessage(message) {
        if (!gameSocket || gameSocket.readyState !== NativeWebSocket.OPEN) return false;
        gameSocket.send(JSON.stringify(message));
        return true;
    }

    async function waitForGameSocket(timeoutMs = 5000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (gameSocket?.readyState === NativeWebSocket.OPEN) return true;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return gameSocket?.readyState === NativeWebSocket.OPEN;
    }

    async function requestFreshGameEvent(type, requestType, { timeoutMs = 3500, attempts = 2 } = {}) {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const result = await requestGameEvent(type, requestType, null, timeoutMs);
            if (type === 'family') {
                if (result && !Array.isArray(result) && result.type === 'family') return result;
            } else if (Array.isArray(result)) {
                return result;
            }
        }
        return type === 'family' ? null : [];
    }

    function requestGameEvent(type, requestType, cachedValue, timeoutMs = 2500) {
        if (cachedValue) return Promise.resolve(cachedValue);
        return new Promise(resolve => {
            const waiters = gameEventWaiters.get(type) || [];
            const waiter = message => resolve(
                type === 'inventory' ? message.items || []
                    : type === 'family' ? message
                        : message.list || []
            );
            waiters.push(waiter);
            gameEventWaiters.set(type, waiters);
            const request = typeof requestType === 'string' ? { type: requestType } : requestType;
            if (!sendGameMessage(request)) {
                gameEventWaiters.set(type, waiters.filter(item => item !== waiter));
                resolve([]);
                return;
            }
            setTimeout(() => {
                const pending = gameEventWaiters.get(type) || [];
                gameEventWaiters.set(type, pending.filter(item => item !== waiter));
                resolve([]);
            }, timeoutMs);
        });
    }

    function requestPokemonTeamFromGameContext(timeoutMs = 1800) {
        const hudElement = document.querySelector('.phud-name') || document.querySelector('.phud');
        if (!hudElement) return Promise.resolve([]);
        const fiberKey = Object.keys(hudElement).find(key => key.startsWith('__reactFiber$'));
        let fiber = fiberKey ? hudElement[fiberKey] : null;
        let gameContext = null;
        for (let depth = 0; fiber && depth < 30; depth += 1, fiber = fiber.return) {
            const value = fiber.memoizedProps?.value;
            if (value && typeof value.subscribe === 'function' && typeof value.requestPokes === 'function') {
                gameContext = value;
                break;
            }
        }
        if (!gameContext) return Promise.resolve([]);

        return new Promise(resolve => {
            let settled = false;
            let unsubscribe = null;
            const finish = list => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                try { unsubscribe?.(); } catch {}
                resolve(Array.isArray(list) ? list : []);
            };
            const timeout = setTimeout(() => finish([]), timeoutMs);
            unsubscribe = gameContext.subscribe('pokes', message => finish(message?.list));
            gameContext.requestPokes();
        });
    }

    const STORAGE_CHAT_ACTIVE = 'script_chat_ativo_v1';
    const STORAGE_SELL_CONFIRM = 'script_sell_confirm_items_v1';
    const STORAGE_SELL_LOCKS = 'script_sell_locks_v1';
    const STORAGE_POKEMON_SELL_LOCKS = 'script_pokemon_sell_locks_v1';
    const STORAGE_GUARD_LEGENDARY = 'script_guard_legendary_v1';
    const STORAGE_HA_COMPACT = 'script_ha_compact_v1';
    const STORAGE_HA_DROPS = 'script_ha_drops_v1';
    const STORAGE_HUNT_MARKET = 'script_hunt_market_v1';
    const STORAGE_HUNT_BULK_BUY = 'script_hunt_bulk_buy_v1';
    const STORAGE_HUNT_SELL = 'script_hunt_sell_v1';
    const STORAGE_MARK_ENHANCEMENTS = 'script_mark_enhancements_v1';
    const STORAGE_HA_HISTORY = 'script_ha_history_v1';
    const STORAGE_GAME_FONT = 'script_game_font_v1';
    const STORAGE_CUSTOM_SCROLLBARS = 'script_custom_scrollbars_v1';
    const STORAGE_UNIFIED_FONTS = 'script_unified_fonts_v1';
    const STORAGE_COMPARE_WINDOW = 'script_compare_window_v1';
    const STORAGE_MARK_QUICK_BUY = 'script_mark_quick_buy_v1';
    const STORAGE_MARK_QUALITY_PICKER = 'script_mark_quality_picker_v1';
    const STORAGE_SHOW_QUALITY_POTENTIAL = 'script_show_quality_potential_v1';
    const STORAGE_CAPTURE_QUALITY_HISTORY = 'script_capture_quality_history_v2';
    const CAPTURE_QUALITY_HISTORY_LIMIT = 300;
    const CAPTURE_PENDING_MAX_AGE_MS = 20000;
    const CAPTURE_RECENT_ADDITION_MAX_AGE_MS = 90000;
    const CAPTURE_ROW_MATCH_MAX_DELTA_MS = 120000;
    const CAPTURE_LOG_SYNC_DELAYS_MS = [0, 250, 700, 1400];
    const CAPTURE_BACKGROUND_SYNC_DELAYS_MS = [0, 180, 500, 1000, 1800];
    const STORAGE_CUSTOM_FONT = 'script_custom_font_v1';
    const STORAGE_CUSTOM_FONT_NAME = 'script_custom_font_name_v1';
    const CUSTOM_FONT_FAMILY = 'PIW Uploaded Font';

    try {
        const storedCaptureHistory = JSON.parse(localStorage.getItem(STORAGE_CAPTURE_QUALITY_HISTORY) || '[]');
        captureQualityHistory = Array.isArray(storedCaptureHistory) ? storedCaptureHistory : [];
    } catch {
        captureQualityHistory = [];
    }

    const GAME_FONT_OPTIONS = {
        barlow: 'Barlow, "Barlow Fallback", system-ui, sans-serif',
        verdana: 'Verdana, Geneva, sans-serif',
        arial: 'Arial, Helvetica, sans-serif',
        system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        cinzel: 'Cinzel, "Cinzel Fallback", serif'
    };

    function getGameFont() { return localStorage.getItem(STORAGE_GAME_FONT) || 'barlow'; }
    function getCustomFont() { return localStorage.getItem(STORAGE_CUSTOM_FONT) || ''; }
    function openCustomFontDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('piw-qol-assets', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('assets');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    async function storeCustomFontFile(buffer) {
        const database = await openCustomFontDatabase();
        await new Promise((resolve, reject) => {
            const transaction = database.transaction('assets', 'readwrite');
            transaction.objectStore('assets').put(buffer, 'custom-font');
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        database.close();
    }
    async function loadStoredCustomFont() {
        try {
            const database = await openCustomFontDatabase();
            const buffer = await new Promise((resolve, reject) => {
                const request = database.transaction('assets').objectStore('assets').get('custom-font');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            database.close();
            if (!buffer) return false;
            const face = new FontFace(CUSTOM_FONT_FAMILY, buffer);
            await face.load();
            document.fonts.add(face);
            if (getGameFont() === 'custom') applyGameFont('custom');
            return true;
        } catch (error) {
            console.warn('No se ha podido cargar la fuente personalizada:', error);
            return false;
        }
    }
    function applyGameFont(value = getGameFont()) {
        const key = value === 'custom' || GAME_FONT_OPTIONS[value] ? value : 'barlow';
        localStorage.setItem(STORAGE_GAME_FONT, key);
        const custom = getCustomFont().replace(/[;{}]/g, '').trim();
        document.documentElement.style.setProperty('--piw-game-font', key === 'custom' && custom ? custom : GAME_FONT_OPTIONS[key === 'custom' ? 'barlow' : key]);
    }
    const preferenceEnabled = key => localStorage.getItem(key) !== 'false';
    function applyVisualPreferences() {
        document.documentElement.classList.toggle('script-custom-scrollbars', preferenceEnabled(STORAGE_CUSTOM_SCROLLBARS));
        document.documentElement.classList.toggle('script-unified-fonts', preferenceEnabled(STORAGE_UNIFIED_FONTS));
    }

    const globalCreatureApiData = new Map();
    const globalItemApiData = new Map();
    let itemDataLoadPromise = null;

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[char]);
    }

    function getGameLanguage() {
        return 'es';
    }

    const SCRIPT_I18N = {
        es: {
            scriptMods: 'Mods del script', modSettings: 'Configuración del mod',
            enabled: 'Activado', disabled: 'Desactivado', hidden: 'Oculto', icon: 'Icono (?)',
            chatInterface: 'Interfaz del chat', chatInterfaceDesc: 'Muestra u oculta la ventana del chat.',
            show: 'Mostrar', hide: 'Ocultar', selectAllGuards: 'Protecciones de Seleccionar todo',
            selectAllGuardsDesc: 'Protecciones aplicadas al seleccionar todo en las pestañas.',
            protectLegendary: 'Deseleccionar Pokémon legendarios (pestaña Pokémon)', protectLocked: 'Deseleccionar objetos bloqueados (pestaña Tienda)',
            sellConfirmation: 'Objetos con confirmación de venta',
            huntFeatures: 'Funciones de la hunt', huntFeaturesDesc: 'Elige qué mejoras estarán disponibles mientras estés en una hunt.',
            marketHud: 'HUD del Mercado Global', marketHudDesc: 'Consulta anuncios sin salir de la hunt.',
            bulkBuy: 'Compras de +1.000/+10.000', bulkBuyDesc: 'Añade grandes cantidades a la tienda de Poké Balls.',
            huntSell: 'Venta en la hunt', huntSellDesc: 'Permite vender objetos y Pokémon desde la tienda de la hunt.',
            cityMark: 'Mejoras de Mark', cityMarkDesc: 'Cantidades, bloqueos y confirmaciones en la tienda de la ciudad.',
            globalMarket: 'Mercado Global', items: 'Objetos', pokemon: 'Pokémon', refresh: 'Actualizar',
            shops: 'Tiendas', ballShop: 'Tienda de Poké Balls', sellItems: 'Vender objetos y Pokémon',
            search: 'Buscar...', loading: 'Cargando anuncios…', noListings: 'No se ha encontrado ningún anuncio.',
            showing: 'Mostrando', of: 'de', loadMore: 'Cargar más',
            inStock: 'en stock',
            buy: 'Comprar', offerOnly: 'Oferta', ivTotal: 'IV total', showOffers: 'Mostrar ofertas',
            all: 'Todos', stones: 'Piedras', pokeBalls: 'Poké Balls', diamonds: 'Diamantes', currency: 'Moneda', gold: 'Dólar',
            recent: 'Más recientes', lowestPrice: 'Precio más bajo', highestPrice: 'Precio más alto',
            highestIv: 'IV más alto', highestPower: 'Mayor poder', highestLevel: 'Nivel más alto', highestQuality: 'Mayor calidad',
            shinyOnly: 'Solo shiny', minIv: 'IV mín.', maxIv: 'IV máx.', minLevel: 'Nivel mín.', maxLevel: 'Nivel máx.', minQuality: 'Calidad mín.', maxQuality: 'Calidad máx.', allTypes: 'Todos los tipos',
            purchaseDone: 'Compra completada.', purchaseFailed: 'No se ha podido completar la compra.',
            loadFailed: 'No se ha podido cargar el mercado.', seller: 'Vendedor', quantity: 'Cantidad',
            price: 'Precio', selectItems: 'Seleccionar objetos ▾', protectedItems: 'Objetos que pedirán confirmación antes de venderse. La lista comienza vacía.',
            noProtected: 'Ningún objeto protegido', noItemFound: 'No se ha encontrado ningún objeto'
        },
        en: {
            scriptMods: 'Script Mods', modSettings: 'Mod Settings',
            enabled: 'Enabled', disabled: 'Disabled', hidden: 'Hidden', icon: 'Icon (?)',
            chatInterface: 'Chat Interface', chatInterfaceDesc: 'Shows or hides the chat window.',
            show: 'Show', hide: 'Hide', selectAllGuards: 'Select All Guards',
            selectAllGuardsDesc: 'Protections applied when using Select All in tabs.',
            protectLegendary: 'Deselect legendary Pokémon (Pokémon tab)', protectLocked: 'Deselect locked items (Shop tab)',
            sellConfirmation: 'Sell Confirmation Items',
            huntFeatures: 'Hunt Features', huntFeaturesDesc: 'Choose which enhancements are available while inside a hunt.',
            marketHud: 'Global Market HUD', marketHudDesc: 'Browse listings without leaving the hunt.',
            bulkBuy: '+1,000/+10,000 purchases', bulkBuyDesc: 'Adds large quantities to the Poké Ball shop.',
            huntSell: 'Hunt Selling', huntSellDesc: 'Sell items and Pokémon from the hunt shop.',
            cityMark: 'Mark Enhancements', cityMarkDesc: 'Quantities, locks and confirmations in the city shop.',
            globalMarket: 'Global Market', items: 'Items', pokemon: 'Pokémon', refresh: 'Refresh',
            shops: 'Shops', ballShop: 'Poké Ball Shop', sellItems: 'Sell items and Pokémon',
            search: 'Search...', loading: 'Loading listings…', noListings: 'No listings found.',
            showing: 'Showing', of: 'of', loadMore: 'Load more',
            inStock: 'in stock',
            buy: 'Buy', offerOnly: 'Offer', ivTotal: 'Total IV', showOffers: 'Show offers',
            all: 'All', stones: 'Stones', pokeBalls: 'Poké Balls', diamonds: 'Diamonds', currency: 'Currency', gold: 'Dollar',
            recent: 'Most recent', lowestPrice: 'Lowest price', highestPrice: 'Highest price',
            highestIv: 'Highest IV', highestPower: 'Highest power', highestLevel: 'Highest level', highestQuality: 'Highest quality',
            shinyOnly: 'Shiny only', minIv: 'Min IV', maxIv: 'Max IV', minLevel: 'Min level', maxLevel: 'Max level', minQuality: 'Min quality', maxQuality: 'Max quality', allTypes: 'All types',
            purchaseDone: 'Purchase completed.', purchaseFailed: 'Could not complete the purchase.',
            loadFailed: 'Could not load the market.', seller: 'Seller', quantity: 'Quantity',
            price: 'Price', selectItems: 'Select items ▾', protectedItems: 'Items that require confirmation before selling. The list starts empty.',
            noProtected: 'No protected items', noItemFound: 'No item found'
        }
    };
    function tr(key) { return SCRIPT_I18N[getGameLanguage()][key] || SCRIPT_I18N.en[key] || key; }

    function readStoredJSON(key, fallback) {
        const stored = localStorage.getItem(key);
        if (!stored) return fallback;
        try {
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed : fallback;
        } catch (error) {
            console.warn(`Error al leer la configuración "${key}". Se utilizará el valor predeterminado.`, error);
            return fallback;
        }
    }

    function parseGameNumber(value) {
        const text = String(value ?? '').trim().toLowerCase();
        const abbreviated = text.match(/(-?\d+(?:[.,]\d+)?)\s*([kmb])\b/);
        if (abbreviated) {
            const number = Number(abbreviated[1].replace(',', '.'));
            const multipliers = { k: 1e3, m: 1e6, b: 1e9 };
            return Number.isFinite(number) ? Math.round(number * multipliers[abbreviated[2]]) : 0;
        }
        const digits = text.replace(/[^0-9-]/g, '');
        const parsed = parseInt(digits, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    // URLs oficiais do jogo
    const POKEMON_TYPES_JSON_URL = 'https://poke.idleworld.online/game/creatures.json';
    const ITEMS_JSON_URL = 'https://poke.idleworld.online/game/items.json';
    const POKEMON_ITEM_ICONS = {1:36575,2:36585,3:36595,4:36605,5:36615,6:36625,7:36634,8:36643,9:36651,10:36669,11:36660,12:36702,13:36696,14:36687,15:36705,16:36722,17:36713,18:36731,19:36740,20:36755,21:36758,22:36767,23:36776,24:36785,25:36639,26:36647,27:36601,28:36611,29:36586,30:36606,31:36596,32:36576,33:36626,34:36616,35:36644,36:36635,37:36674,38:36683,39:36620,40:36630,41:36580,42:36590,43:36717,44:36726,45:36735,46:36652,47:36661,48:36670,49:36900,50:36688,51:36697,52:36723,53:36714,54:36656,55:36665,56:36706,57:36759,58:36782,59:36741,60:36732,61:36768,62:36786,63:36691,64:36700,65:36709,66:36771,67:36780,68:36789,69:36777,70:36577,71:36587,72:36676,73:36685,74:36744,75:36753,76:36762,77:36597,78:36607,79:36617,80:36627,81:36631,82:36640,83:36636,84:36692,85:36701,86:36799,87:36653,88:36655,89:36641,90:36671,91:36662,92:36680,93:36689,94:36698,95:36707,96:36715,97:36724,98:36592,99:36733,100:36694,101:36703,102:36751,103:36760,104:36769,105:36778,106:36737,107:36648,108:36588,109:36673,110:36682,111:36710,112:36718,113:36598,114:36608,115:36618,116:36781,117:36738,118:36745,119:36754,120:36581,121:36591,122:36628,123:36637,124:36645,125:36622,126:36663,127:36621,128:36672,129:36711,130:36720,131:36681,132:36690,133:36699,134:36708,135:36716,136:36725,137:36734,138:36743,139:36752,140:36761,141:36770,142:36779,143:36788,147:36629,148:36638,149:36646,150:36609};

    function getPokemonIconUrl(speciesId) {
        const id = Number(speciesId);
        if (id >= 152 && id <= 251 && id !== 201) return `/assets/pokeitems/gen2/${id}.png`;
        if ((id >= 252 && id <= 386) || id === 447 || id === 448) return `/assets/pokeitems/gen3/${id}.png`;
        return POKEMON_ITEM_ICONS[id] ? `/assets/pokeitems/${POKEMON_ITEM_ICONS[id]}.png` : '';
    }

    function normalizeGameItemIcon(icon) {
        if (!icon) return '';
        if (/^(https?:)?\//.test(icon)) return icon;
        return `/assets/items/${String(icon).replace(/^\/+/, '')}`;
    }

    // Carga de criaturas desde la API
    async function loadExternalPokemonData() {
        try {
            const response = await fetch(POKEMON_TYPES_JSON_URL);
            if (!response.ok) return;
            const data = await response.json();
            const creaturesList = Array.isArray(data) ? data : (data.creatures || []);
            creaturesList.forEach(poke => {
                const pokeName = String(poke?.name || '').toLowerCase().trim();
                if (pokeName) globalCreatureApiData.set(pokeName, poke);
            });
        } catch (error) {
            console.warn('⚠️ Error al cargar creatures.json', error);
        }
    }

    // Carga de objetos desde la API (para obtener los iconos oficiales)
    async function loadExternalItemData() {
        try {
            const response = await fetch(ITEMS_JSON_URL);
            if (response.ok) {
                const data = await response.json();
                const itemsList = Array.isArray(data) ? data : (data.items || Object.values(data));
                itemsList.forEach(item => {
                    if (!item) return;
                    const itemName = (item.name || item.title || '').toLowerCase().trim();
                    const itemId = String(item.id || item.key || '').toLowerCase().trim();

                    if (itemName) globalItemApiData.set(itemName, item);
                    if (itemId) globalItemApiData.set(itemId, item);
                });
                }
        } catch (e) {
            console.warn("⚠️ Error al cargar items.json", e);
        }
    }

    loadExternalPokemonData();
    itemDataLoadPromise = loadExternalItemData();

    // --- PROCESAMIENTO DE DROPS CON ICONOS REALES DE ITEMS.JSON ---
    function resolveItemIcon(itemName) {
        const cleanKey = itemName.toLowerCase().trim();
        let itemObj = globalItemApiData.get(cleanKey);

        if (!itemObj) {
            // Intenta buscar mediante una coincidencia parcial
            for (const [key, val] of globalItemApiData.entries()) {
                if (cleanKey.includes(key) || key.includes(cleanKey)) {
                    itemObj = val;
                    break;
                }
            }
        }

        if (itemObj) {
            const imgPath = itemObj.image || itemObj.icon || itemObj.sprite || itemObj.img || '';
            if (imgPath) {
                // Si la ruta es relativa, crea la URL correcta a partir del dominio
                const fullImgUrl = imgPath.startsWith('http') ? imgPath : `https://poke.idleworld.online/${imgPath.startsWith('/') ? imgPath.slice(1) : imgPath}`;
                return `<img src="${escapeHTML(fullImgUrl)}" style="width:20px; height:20px; vertical-align:middle; margin-right:8px; object-fit:contain;" />`;
            }
        }

        // Alternativa visual si el objeto no tiene una imagen asignada
        return `<span style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; background:#12202a; border:1px solid #273f52; border-radius:4px; margin-right:8px; font-size:10px; color:#48bb78;">🌿</span>`;
    }

    // --- ESTILOS VISUALES (ESTÉTICA LIMPIA) ---
    const style = document.createElement('style');
    style.id = 'simplifier-dynamic-styles';
    style.innerHTML = `
        :root { --piw-game-font: Barlow, "Barlow Fallback", system-ui, sans-serif; }
        html.script-unified-fonts,
        html.script-unified-fonts body,
        html.script-unified-fonts body * {
            font-family: var(--piw-game-font) !important;
        }
        html.script-custom-scrollbars * {
            scrollbar-width: thin;
            scrollbar-color: rgba(200, 170, 110, .48) transparent;
        }
        html.script-custom-scrollbars *::-webkit-scrollbar { width: 7px; height: 7px; }
        html.script-custom-scrollbars *::-webkit-scrollbar-track { background: transparent; }
        html.script-custom-scrollbars *::-webkit-scrollbar-corner { background: transparent; }
        html.script-custom-scrollbars *::-webkit-scrollbar-thumb {
            background: rgba(200, 170, 110, .34);
            border: 2px solid transparent;
            background-clip: padding-box;
            border-radius: 999px;
        }
        html.script-custom-scrollbars *::-webkit-scrollbar-thumb:hover { background: rgba(230, 205, 142, .58); background-clip: padding-box; }
        .promo-overlay { display: none !important; }
        #dock-btn-shops, #dock-btn-depot {
            background: transparent;
            border: 0;
            box-shadow: none;
            display: inline-flex; align-items: center; justify-content: center;
        }
        #dock-btn-shops { color: #9ae6b4; font-size: 15px; }
        #dock-btn-depot { color: #90cdf4; font-size: 15px; }
        .script-shop-wrap .poke-menu[hidden] { display: none !important; }
        .win-window, .cfg-window, .mk-window, .ball-window, .ha-window, .inv-window,
        .dep-window, .prof-window, .breed-window, .poke-window, .sell-confirm-modal,
        .cap-panel, .chat-box, .npc-dialog, .script-market-window {
            border-radius: 10px !important;
        }
        nav.game-dock, .phud.game-hud-tl, .phud.game-hud.t1 {
            border-radius: 10px !important;
            border: 2px solid rgb(120, 90, 40) !important;
            border-image: none !important;
            background-clip: padding-box !important;
        }
        nav.game-dock::before, .phud.game-hud-tl::before, .phud.game-hud.t1::before {
            border-radius: 7px !important;
        }
        .cfg-window.script-mods-open {
            width: min(900px, 94vw) !important;
            max-width: 94vw !important;
        }
        .cfg-mods-content .script-mods-grid {
            padding: 14px;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            background: #0c161f;
            border-radius: 10px;
        }
        .cfg-mods-content .script-mods-title,
        .cfg-mods-content .script-mods-wide { grid-column: 1 / -1; }
        .cfg-mods-content .cfg-row {
            min-width: 0;
            padding: 12px !important;
            border-radius: 8px !important;
        }
        .cfg-mods-content .cfg-label span { display: block; margin-top: 4px; line-height: 1.35; }
        .script-mod-category { grid-column:1/-1;display:block;min-width:0;border:1px solid #23394a;border-radius:10px;background:#0a141c;overflow:visible; }
        .script-mod-category > h3 { margin:0;padding:10px 12px;display:flex;align-items:center;gap:8px;color:#d9c38c;font-size:14px;background:#101e28;border-bottom:1px solid #23394a; }
        .script-mod-category-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:10px;align-items:stretch; }
        .cfg-window.script-mods-open { width:min(920px,94vw) !important;height:min(780px,92vh) !important;max-width:94vw !important;max-height:92vh !important; }
        .cfg-window.script-mods-open .cfg-body { min-height:0;overflow:hidden !important; }
        .cfg-mods-content { width:100%;height:100%;min-width:0;overflow:auto;box-sizing:border-box; }
        .script-mod-category-grid > .cfg-row { box-sizing:border-box;width:100%;min-width:0;height:100%;display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:6px; }
        .script-mod-category-grid > label.cfg-row { flex-direction:row;align-items:flex-start !important;justify-content:flex-start;gap:10px !important; }
        .script-mod-category-grid > label.cfg-row > input[type="checkbox"] { flex:0 0 auto;width:18px;height:18px;margin:1px 0 0;accent-color:#c8a24e; }
        .script-mod-category-grid > label.cfg-row > .cfg-label { flex:1;min-width:0;margin:0; }
        .script-mod-category-grid .cfg-seg { width:100%;align-items:stretch; }
        .script-mod-category-grid .cfg-seg-btn { min-width:0;white-space:normal;line-height:1.2; }
        .script-mod-category-grid > .cfg-row.script-mods-wide { grid-column:1/-1; }
        .script-mod-category-grid > .cfg-row:only-child { grid-column:1/-1; }
        .script-mod-category-grid input:not([type="checkbox"]):not([type="radio"]),
        .script-mod-category-grid select { box-sizing:border-box;max-width:100%; }
        .cfg-font-file-row { display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px; }
        .cfg-font-file-name { min-width:0;flex:1;color:#91a4b2;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        @media (max-width: 720px) {
            .cfg-mods-content .script-mods-grid { grid-template-columns: 1fr; }
            .cfg-mods-content .script-mods-title,
            .cfg-mods-content .script-mods-wide { grid-column: auto; }
            .script-mod-category { grid-column:auto; }
            .script-mod-category-grid { grid-template-columns:1fr; }
            .script-mod-category-grid > .cfg-row.script-mods-wide { grid-column:auto; }
        }

        .mk-lock { font-size: 14px; background: none; border: 1px solid transparent; border-radius: 4px; cursor: pointer; margin-left: 6px; padding: 2px 4px; }
        .mk-lock:hover { border-color: #c8a24e; }
        .mk-lock.on { color: #f6c453; }
        .mk-srow-head.locked { opacity: 0.6; }
        .mk-bulk-controls { display: inline-flex; gap: 4px; margin-left: 6px; vertical-align: middle; }
        .mk-bulk-btn { background: #14222d; color: #63b3ed; border: 1px solid #273f52; border-radius: 4px; padding: 3px 7px; font-size: 11px; font-weight: bold; cursor: pointer; }
        .mk-bulk-btn:hover { background: #1a365d; border-color: #3182ce; color: #fff; }
        .hunt-sell-list { max-height: 360px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
        .hunt-sell-row { display: grid; grid-template-columns: auto minmax(0, 1fr) 80px auto; align-items: center; gap: 8px; background: #14222d; border: 1px solid #1a2d3a; border-radius: 5px; padding: 7px 9px; }
        .hunt-sell-row[hidden] { display: none !important; }
        .hunt-sell-row input[type="number"] { width: 100%; box-sizing: border-box; background: #0c161f; color: #e2e8f0; border: 1px solid #273f52; border-radius: 4px; padding: 5px; }
        .hunt-sell-row.protected { opacity: 0.45; }
        .hunt-item-lock { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; background: #0c161f; color: #e2e8f0; border: 1px solid #273f52; border-radius: 5px; cursor: pointer; }
        .hunt-item-lock:hover { border-color: #c8a24e; background: #172634; }
        .hunt-item-lock.on { color: #f6c453; border-color: #8a6a2c; }

        .sell-confirm-backdrop { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 10150; display: flex; align-items: center; justify-content: center; }
        .sell-confirm-modal { background: #0c161f; border: 1px solid #273f52; border-radius: 8px; padding: 0; color: #e2e8f0; width: 320px; box-shadow: 0 12px 32px rgba(0,0,0,0.8); overflow: hidden; }
        .sell-confirm-title { background: #14222d; border-bottom: 1px solid #273f52; padding: 12px 16px; font-size: 15px; font-weight: bold; color: #63b3ed; display: flex; align-items: center; gap: 8px; }
        .sell-confirm-body { padding: 16px; }
        .sell-confirm-body p { color: #a0aec0; font-size: 13px; margin: 0 0 10px 0; }
        .sell-confirm-items { background: #14222d; border: 1px solid #1a2d3a; border-radius: 6px; padding: 8px 12px; margin-bottom: 16px; max-height: 100px; overflow-y: auto; }
        .sell-confirm-items div { color: #ffcc00; font-weight: bold; font-size: 13px; padding: 2px 0; }
        .sell-confirm-footer { display: flex; gap: 8px; }
        .sell-confirm-btn { flex: 1; padding: 8px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; transition: background 0.15s; }
        .sell-confirm-btn.yes { background: #48bb78; color: #fff; }
        .sell-confirm-btn.yes:hover { background: #38a169; }
        .sell-confirm-btn.no { background: #2b4c66; color: #e2e8f0; border: 1px solid #273f52; }
        .sell-confirm-btn.no:hover { background: #3182ce; }

        /* Native game window theme for every window created by the extension. */
        .sell-confirm-backdrop, .script-market-backdrop, .portable-ball-backdrop {
            background: rgba(0, 0, 0, .62) !important;
            backdrop-filter: blur(1px);
        }
        .sell-confirm-modal, .script-market-window, .script-portable-ball-window, .ha-compare-modal {
            background: linear-gradient(rgba(16, 24, 35, .99), rgba(9, 14, 21, .99)) !important;
            color: rgb(233, 226, 208) !important;
            border: 2px solid rgb(120, 90, 40) !important;
            border-radius: 10px !important;
            box-shadow: 0 12px 40px rgba(0, 0, 0, .7) !important;
            font-family: var(--piw-game-font) !important;
        }
        .sell-confirm-title,
        .script-market-window .cfg-title,
        .script-portable-ball-window .ball-head,
        .ha-compare-modal .ha-title {
            min-height: 47px;
            box-sizing: border-box;
            padding: 12px 14px 8px !important;
            background: transparent !important;
            border-bottom: 1px solid rgba(200, 170, 110, .16) !important;
            color: rgb(240, 230, 210) !important;
            font-family: var(--piw-game-font) !important;
            font-size: 17px !important;
            font-weight: 700 !important;
        }
        .sell-confirm-body { background: transparent !important; color: rgb(233, 226, 208) !important; }
        .sell-confirm-body p { color: rgb(174, 181, 188) !important; }
        .sell-confirm-modal input, .sell-confirm-modal select,
        .script-market-window input, .script-market-window select,
        .script-portable-ball-window input, .script-portable-ball-window select,
        .ha-compare-modal input, .ha-compare-modal select {
            box-sizing: border-box;
            min-height: 28px;
            background: rgba(8, 15, 22, .8) !important;
            color: rgb(230, 237, 243) !important;
            border: 1px solid rgb(58, 74, 92) !important;
            border-radius: 6px !important;
            padding: 5px 8px !important;
            font: 400 12px var(--piw-game-font) !important;
            outline: none;
        }
        .sell-confirm-modal input:focus, .sell-confirm-modal select:focus,
        .script-market-window input:focus, .script-market-window select:focus,
        .script-portable-ball-window input:focus, .script-portable-ball-window select:focus {
            border-color: rgb(200, 162, 78) !important;
            box-shadow: 0 0 0 2px rgba(200, 162, 78, .15) !important;
        }
        .sell-confirm-btn.yes, .portable-depot-clear-filters,
        .script-market-window .market-refresh, .script-portable-ball-window .mk-buy-btn {
            background: linear-gradient(rgb(230, 205, 142), rgb(200, 162, 78)) !important;
            color: rgb(26, 18, 6) !important;
            border: 1px solid rgb(106, 82, 35) !important;
            border-radius: 8px !important;
            font-weight: 800 !important;
        }
        .sell-confirm-btn.yes:hover, .portable-depot-clear-filters:hover,
        .script-market-window .market-refresh:hover, .script-portable-ball-window .mk-buy-btn:hover {
            filter: brightness(1.08);
        }
        .script-market-window .market-tab.on { background: linear-gradient(#d8b86b,#9c762f) !important; color:#171006 !important; }
        .market-sell-controls input, .market-sell-controls select { background:#071018;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px 8px;min-width:88px; }
        .market-sell-controls .market-sell-search { flex:1;min-width:180px; }
        .market-sell-controls .market-sell-qty { width:76px; }
        .market-sell-controls .market-sell-price { width:140px; }
        .market-sell-row { width:100%;display:grid;grid-template-columns:42px 1fr;gap:10px;align-items:center;text-align:left;background:#14222d;color:#e2e8f0;border:1px solid #1f3545;border-radius:7px;padding:8px 10px; }
        .market-sell-row:hover,.market-sell-row.on { border-color:#c8a24e;background:#1b2c39; }
        .market-sell-row img { width:38px;height:38px;object-fit:contain; }
        .market-sell-row small { display:block;color:#9fb0bd;margin-top:3px; }
        .script-quality-multiselect { position:relative;display:inline-block;z-index:8; }
        .script-quality-toggle { min-width:170px;text-align:left; }
        .script-quality-dropdown { position:absolute;min-width:190px;padding:7px;background:#101b24;border:1px solid #7a5a27;border-radius:6px;box-shadow:0 8px 22px #000b;display:grid;gap:3px;z-index:100000;pointer-events:auto; }
        .script-quality-option { display:flex;gap:7px;align-items:center;width:100%;padding:4px 5px;border-radius:4px;background:transparent;color:#e8dfcc;cursor:pointer;box-sizing:border-box;user-select:none;pointer-events:auto; }
        .script-quality-option:hover { background:#ffffff12; }
        .script-quality-option input { flex:0 0 auto;margin:0;accent-color:#3182ce;pointer-events:auto; }
        .script-mark-row-buy { display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto; }
        .script-mark-row-buy .mk-bulk-btn { min-width:38px;padding:5px 7px;font-size:11px; }
        .sell-confirm-btn.no, .mk-bulk-btn {
            background: rgba(255, 255, 255, .035) !important;
            color: rgb(233, 226, 208) !important;
            border: 1px solid rgba(200, 170, 110, .24) !important;
            border-radius: 8px !important;
        }
        .mk-bulk-btn.active, .mk-bulk-btn:hover {
            background: rgba(200, 170, 110, .16) !important;
            color: rgb(240, 230, 210) !important;
            border-color: rgba(230, 205, 142, .45) !important;
        }
        .portable-depot-family-tabs { display: inline-flex; gap: 6px; }
        .portable-depot-backdrop .sell-confirm-title { gap: 6px; }
        .portable-depot-backdrop .depot-tab {
            min-height: 34px;
            padding: 7px 8px !important;
            border-radius: 8px 8px 0 0 !important;
            font: 700 12.5px Barlow, "Barlow Fallback", sans-serif !important;
        }
        .portable-depot-backdrop .depot-tab.active {
            background: rgba(200, 170, 110, .16) !important;
            color: rgb(240, 230, 210) !important;
        }
        .portable-depot-content section,
        .hunt-sell-row, .market-row, .market-listing {
            background: transparent !important;
            border-color: rgba(255, 255, 255, .05) !important;
            border-radius: 8px !important;
        }
        .portable-depot-content section button,
        .hunt-sell-row, .market-row, .market-listing {
            background: rgba(255, 255, 255, .02) !important;
            color: rgb(233, 226, 208) !important;
            border: 1px solid rgba(255, 255, 255, .05) !important;
            border-radius: 8px !important;
        }
        .portable-depot-content section button:hover,
        .hunt-sell-row:hover, .market-row:hover, .market-listing:hover {
            background: rgba(200, 170, 110, .08) !important;
            border-color: rgba(200, 170, 110, .24) !important;
        }
        .portable-depot-poke-filters {
            flex-basis: 100%;
            display: grid;
            grid-template-columns: minmax(190px, 2fr) repeat(4, minmax(82px, 1fr)) auto auto;
            gap: 6px;
            padding: 9px;
            background: rgba(255, 255, 255, .02);
            border: 1px solid rgba(255, 255, 255, .05);
            border-radius: 8px;
        }
        .portable-depot-clear-filters,
        .portable-depot-quality-preset { min-height: 28px; padding: 5px 10px; cursor: pointer; }
        .portable-family-toolbar {
            display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0 0 9px;padding:7px;
            background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:8px;
        }
        .portable-family-toolbar .portable-family-count { margin-left:auto;color:#9fb1c4;font-size:11px;font-weight:800; }
        .portable-family-row {
            display:flex;width:100%;box-sizing:border-box;align-items:center;gap:9px;
            background:rgba(255,255,255,.02);color:rgb(233,226,208);
            border:1px solid rgba(255,255,255,.05);border-radius:8px;padding:8px;margin:0 0 7px;
        }
        .portable-family-row.selected {
            background:rgba(200,170,110,.10);border-color:rgba(230,205,142,.34);
        }
        .portable-family-row input[type="checkbox"] { width:17px;height:17px;flex:none;cursor:pointer; }
        .portable-family-row .portable-family-single { flex:none;white-space:nowrap;cursor:pointer; }
        .portable-shop-heading {
            margin: 8px 0 0;
            padding: 7px 3px 5px;
            color: rgb(240, 230, 210);
            border-bottom: 1px solid rgba(200, 170, 110, .2);
            font: 700 14px Cinzel, "Cinzel Fallback", serif;
        }
        @media (max-width: 760px) {
            .portable-depot-poke-filters { grid-template-columns: 1fr 1fr; }
            .portable-depot-poke-filters input:first-child { grid-column: 1 / -1; }
        }


        /* Hunt Analyzer Compact Mode */
        .ha-window.ha-compact {
            width: 320px; min-width: 300px; max-width: 90vw;
            min-height: 360px; max-height: 90vh;
            box-sizing: border-box !important; resize: both !important;
            overflow: auto !important; border-radius: 12px !important;
        }
        .ha-window:not(.ha-compare-modal) { opacity: 1 !important; }
        .ha-window.ha-compact .ha-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 4px !important; }
        .ha-window.ha-compact .ha-card { padding: 4px 8px !important; flex-direction: row !important; align-items: center !important; justify-content: flex-start !important; gap: 8px !important; }
        .ha-window.ha-compact .ha-card small { display: none !important; }
        .ha-window.ha-compact .ha-card-ico { font-size: 16px !important; margin: 0 !important; }
        .ha-window.ha-compact .ha-card b { font-size: 14px !important; }
        .ha-window.ha-compact .ha-balance { font-size: 14px !important; padding: 4px !important; flex-direction: row !important; justify-content: space-between !important; }
        .ha-window.ha-compact .ha-balance span { display: none !important; }
        .ha-window.ha-compact .ha-balance::before { content: 'Balance'; font-weight: bold; }
        .ha-window.ha-compact .ha-rates { display: flex !important; flex-direction: column !important; align-items: stretch !important; gap: 4px !important; padding: 4px !important; font-size: 11px !important; }
        .ha-window.ha-compact .ha-rates span { width: 100% !important; text-align: center !important; margin: 0 !important; }
        .ha-window.ha-compact .ha-drops-head, .ha-window.ha-compact .ha-note { display: none !important; }
        .ha-window.ha-compact .ha-clog-btn { display: none !important; }
        .ha-window.ha-compact .ha-drops { display: none !important; }
        .ha-window.ha-compact .ha-drops.show-drops {
            display: flex !important; max-height: none !important; min-height: 80px !important;
            overflow-y: auto !important; padding: 6px !important; flex: 1 1 auto !important;
            border-radius: 8px !important;
        }
        
        /* Hunt Analyzer Custom UI */
        .ha-script-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin: 0; padding: 8px; border-bottom: 1px solid #1b3040; }
        .ha-sbtn { background: #1a2d3a; color: #a0aec0; border: 1px solid #273f52; border-radius: 6px; padding: 6px 4px; font-size: 11px; cursor: pointer; transition: all 0.15s ease; text-align: center; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 4px; }
        .ha-sbtn:hover { background: #3182ce; color: #fff; border-color: #3182ce; }
        .ha-catch-stats { display: block; width: 100%; text-align: center; margin-top: 4px; }
        .ha-catch-stats.hidden { display: none !important; }
        .ha-rates { flex-wrap: wrap !important; }

        /* Compare Modal */
        .ha-compare-backdrop { position: fixed; inset: 0; z-index: 10100; pointer-events: none; }
        .ha-compare-modal {
            pointer-events: auto; position: fixed !important; left: 50%; top: 50%;
            transform: translate(-50%, -50%); width: min(580px, 92vw);
            min-width: 360px; min-height: 420px; max-width: 94vw; max-height: 90vh;
            overflow: auto !important; resize: both; border-radius: 14px !important;
            border: 1px solid #315269 !important; background: #0b151e !important;
            box-shadow: 0 20px 55px rgba(0,0,0,.82) !important; padding-bottom: 12px;
        }
        .ha-compare-modal .ha-title { position: sticky; top: 0; z-index: 2; background: #12222e; padding: 11px 13px; }
        .ha-compare-modal .ha-title { display: flex !important; align-items: center; gap: 8px; }
        .ha-compare-modal .ha-title > span { flex: 1 1 auto; min-width: 0; }
        .ha-compare-modal .ha-x {
            position: static !important; inset: auto !important; flex: 0 0 auto;
            width: 30px !important; height: 30px !important; margin: 0 !important;
        }
        .ha-compare-table { width: 100%; min-width: 500px; border-collapse: separate; border-spacing: 0 5px; font-size: 13px; }
        .ha-compare-table th { text-align: center; padding: 8px; color: #91a7b8; font-weight: 600; }
        .ha-compare-table td { padding: 9px; background:#101f2a; text-align: center; font-weight: bold; }
        .ha-compare-table td:first-child { border-radius: 7px 0 0 7px; }
        .ha-compare-table td:last-child { border-radius: 0 7px 7px 0; }
        .ha-compare-table tr:nth-child(even) { background-color: transparent; }
        .ha-compare-table td:first-child { text-align: left; font-weight: normal; color: #a0aec0; }
        .ha-compare-winner { color: #48bb78 !important; }
        .ha-compare-loser { color: #f56565 !important; }
        .ha-compare-modal .ha-title { cursor: grab; user-select: none; }
        .ha-compare-modal .ha-title:active { cursor: grabbing; }
        .ha-compare-backdrop {
            pointer-events: none !important;
            display: block !important;
            padding: 0 !important;
            background: transparent !important;
            backdrop-filter: none !important;
        }
        .ha-compare-modal {
            position: fixed !important;
            left: 50% !important; top: 50% !important; right: auto !important; bottom: auto !important;
            width: min(760px, 94vw);
            max-width: 94vw !important;
            max-height: 88vh !important;
            resize: both !important;
            overflow: auto !important;
            transform: translate(-50%, -50%);
        }
        .ha-compare-modal .ha-title { position: sticky !important; padding-right: 52px !important; }
        .ha-compare-modal .ha-x { position:absolute !important;right:10px !important;top:8px !important;left:auto !important;bottom:auto !important;z-index:4; }
        .ha-compare-modal > div:nth-child(2) { padding: 14px !important; }
        .ha-compare-table { width:100% !important; min-width: 440px !important; border-spacing: 0 7px !important; }
        .ha-compare-table th { background: transparent !important; color: #c7b98f !important; font-size: 12px; }
        .ha-compare-table td { background: rgba(255,255,255,.025) !important; border-top: 1px solid rgba(255,255,255,.04); border-bottom: 1px solid rgba(255,255,255,.04); }
        .ha-history-list > div { background: rgba(255,255,255,.025) !important; border: 1px solid rgba(255,255,255,.05); border-radius: 8px !important; }
        @media (max-width: 640px) {
            .ha-compare-modal > div:nth-child(2) { overflow-x: auto; }
            .ha-compare-table { min-width: 520px !important; }
        }

        /* Inventario no bloqueante y redimensionable */
        .script-inventory-backdrop {
            background: transparent !important; backdrop-filter: none !important;
            pointer-events: none !important;
        }
        .script-inventory-backdrop .inv-window, .inv-window.script-resizable-inventory {
            pointer-events: auto !important; resize: both !important; overflow: auto !important;
            min-width: 260px !important; min-height: 250px !important;
            max-width: 98vw !important; max-height: 95vh !important;
            border-radius: 12px !important;
        }
        .inv-window.script-resizable-inventory .inv-grid,
        .inv-window.script-resizable-inventory .inv-items,
        .inv-window.script-resizable-inventory .inv-slots {
            width: auto !important; max-width: 100% !important; min-width: 0 !important;
            box-sizing: border-box !important;
            display: grid !important;
            grid-template-columns: repeat(auto-fill, 42px) !important;
            grid-auto-rows: 42px !important;
            justify-content: start !important; align-content: start !important;
            gap: 6px !important; padding: 8px 12px !important;
            overflow: auto !important;
        }
        .inv-window.script-resizable-inventory .inv-slot {
            width: 42px !important; height: 42px !important;
            min-width: 42px !important; max-width: 42px !important;
            min-height: 42px !important; max-height: 42px !important;
            aspect-ratio: auto !important; justify-self: start !important;
        }
        .phud-party > button.phud-mon .script-party-quality {
            display: inline-block !important;
            margin-left: 5px !important;
            font-size: 10px !important;
            font-weight: 800 !important;
            line-height: 1 !important;
            vertical-align: middle !important;
            white-space: nowrap !important;
        }
        .script-capture-quality-row { position: relative !important; padding-right: 86px !important; }
        .script-capture-quality-row::after {
            content: attr(data-script-capture-quality);
            position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
            color: var(--script-capture-quality-color, #90cdf4);
            font-size: 10px; font-weight: 900; white-space: nowrap; pointer-events: none;
        }
    `;
    function appendStyleWhenReady(styleElement) {
        if (document.head) document.head.appendChild(styleElement);
        else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(styleElement), { once: true });
    }
    appendStyleWhenReady(style);
    applyGameFont();
    applyVisualPreferences();
    loadStoredCustomFont();

    function isChatActive() { return localStorage.getItem(STORAGE_CHAT_ACTIVE) === 'true'; }
    function setChatActive(state) { localStorage.setItem(STORAGE_CHAT_ACTIVE, state ? 'true' : 'false'); applyChatState(); }

    function getSellConfirmItems() {
        return readStoredJSON(STORAGE_SELL_CONFIRM, []);
    }
    function setSellConfirmItems(items) {
        localStorage.setItem(STORAGE_SELL_CONFIRM, JSON.stringify(items));
    }

    function normalizeSellLockName(itemName) {
        return String(itemName || '').trim().toLocaleLowerCase('es-ES');
    }
    function getSellLocks() {
        return readStoredJSON(STORAGE_SELL_LOCKS, []);
    }
    function isSellLocked(itemName) {
        const normalized = normalizeSellLockName(itemName);
        return getSellLocks().some(name => normalizeSellLockName(name) === normalized);
    }
    function addSellLock(itemName) {
        const locks = getSellLocks();
        if (!locks.some(name => normalizeSellLockName(name) === normalizeSellLockName(itemName))) {
            locks.push(String(itemName).trim());
            localStorage.setItem(STORAGE_SELL_LOCKS, JSON.stringify(locks));
        }
    }
    function removeSellLock(itemName) {
        const normalized = normalizeSellLockName(itemName);
        localStorage.setItem(STORAGE_SELL_LOCKS, JSON.stringify(
            getSellLocks().filter(name => normalizeSellLockName(name) !== normalized)
        ));
    }

    function normalizePokemonSellLockId(pokeId) {
        return String(pokeId ?? '').trim();
    }
    function getPokemonSellLocks() {
        return readStoredJSON(STORAGE_POKEMON_SELL_LOCKS, [])
            .map(normalizePokemonSellLockId)
            .filter(Boolean);
    }
    function isPokemonSellLocked(pokeId) {
        const normalized = normalizePokemonSellLockId(pokeId);
        return Boolean(normalized) && getPokemonSellLocks().includes(normalized);
    }
    function addPokemonSellLock(pokeId) {
        const normalized = normalizePokemonSellLockId(pokeId);
        if (!normalized) return;
        const locks = getPokemonSellLocks();
        if (!locks.includes(normalized)) {
            locks.push(normalized);
            localStorage.setItem(STORAGE_POKEMON_SELL_LOCKS, JSON.stringify(locks));
        }
    }
    function removePokemonSellLock(pokeId) {
        const normalized = normalizePokemonSellLockId(pokeId);
        if (!normalized) return;
        localStorage.setItem(STORAGE_POKEMON_SELL_LOCKS, JSON.stringify(
            getPokemonSellLocks().filter(id => id !== normalized)
        ));
    }

    function isGuardLegendaryActive() { return localStorage.getItem(STORAGE_GUARD_LEGENDARY) !== 'false'; }
    function setGuardLegendary(val) { localStorage.setItem(STORAGE_GUARD_LEGENDARY, val ? 'true' : 'false'); }
    function isHaCompact() { return localStorage.getItem(STORAGE_HA_COMPACT) === 'true'; }
    function setHaCompact(val) { localStorage.setItem(STORAGE_HA_COMPACT, val ? 'true' : 'false'); }
    function isHaDropsVisible() { return localStorage.getItem(STORAGE_HA_DROPS) === 'true'; }
    function setHaDropsVisible(val) { localStorage.setItem(STORAGE_HA_DROPS, val ? 'true' : 'false'); }
    function isHuntMarketActive() { return localStorage.getItem(STORAGE_HUNT_MARKET) !== 'false'; }
    function setHuntMarketActive(val) { localStorage.setItem(STORAGE_HUNT_MARKET, val ? 'true' : 'false'); }
    function isHuntBulkBuyActive() { return localStorage.getItem(STORAGE_HUNT_BULK_BUY) !== 'false'; }
    function setHuntBulkBuyActive(val) { localStorage.setItem(STORAGE_HUNT_BULK_BUY, val ? 'true' : 'false'); }
    function isHuntSellActive() { return localStorage.getItem(STORAGE_HUNT_SELL) !== 'false'; }
    function setHuntSellActive(val) { localStorage.setItem(STORAGE_HUNT_SELL, val ? 'true' : 'false'); }
    function isMarkEnhancementsActive() { return localStorage.getItem(STORAGE_MARK_ENHANCEMENTS) !== 'false'; }
    function setMarkEnhancementsActive(val) { localStorage.setItem(STORAGE_MARK_ENHANCEMENTS, val ? 'true' : 'false'); }

    function applyChatState() {
        const active = isChatActive();
        const chatFab = document.querySelector('.chat-fab');
        const chatBox = document.querySelector('.chat-box');
        if (chatFab) chatFab.style.display = active ? '' : 'none';
        if (chatBox) chatBox.style.display = active ? '' : 'none';
    }

    function findUtilityGameDock() {
        const direct = document.querySelector(
            'nav.game-dock, .game-dock, [data-guide="game-dock"], [data-testid="game-dock"]'
        );
        if (direct) return direct;

        // Fallback para cambios de etiqueta o clase del juego: busca el
        // contenedor que ya agrupa los botones nativos del dock.
        const nativeButtons = Array.from(document.querySelectorAll(
            '.dock-btn, button[class*="dock-btn"], [data-guide*="dock" i] button'
        )).filter(button =>
            button?.isConnected
            && !button.closest('.script-shop-wrap')
            && button.id !== 'dock-btn-depot'
        );

        const parentCounts = new Map();
        for (const button of nativeButtons) {
            const parent = button.parentElement;
            if (!parent) continue;
            parentCounts.set(parent, (parentCounts.get(parent) || 0) + 1);
        }

        return [...parentCounts.entries()]
            .sort((left, right) => right[1] - left[1])
            .find(([, count]) => count >= 2)?.[0] || null;
    }

    function buildUtilityShopMenu(menu) {
        menu.innerHTML = '';

        const addItem = (label, handler, key) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'poke-menu-item';
            item.dataset.scriptShopAction = key;
            item.setAttribute('role', 'menuitem');
            item.textContent = label;
            item.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                menu.hidden = true;
                handler();
            });
            menu.appendChild(item);
        };

        addItem(`🌐 ${tr('globalMarket')}`, showGlobalMarketWindow, 'market');
        addItem(`🔴 ${tr('ballShop')}`, showPortableBallShop, 'balls');
        addItem(`💰 ${tr('sellItems')}`, showHuntSellWindow, 'sell');
        addItem('🪨 Vender piedras', showHuntStoneSellWindow, 'stones');
    }

    function injectUtilityDockButtons() {
        const gameDock = findUtilityGameDock();
        if (!gameDock) return false;

        // Elimina únicamente copias antiguas o duplicadas creadas por PIW-QOL.
        const wraps = Array.from(document.querySelectorAll('.script-shop-wrap'));
        let shopWrap = wraps.find(wrap =>
            wrap.dataset?.piwQolBuild === SCRIPT_BUILD
            && wrap.isConnected
        ) || null;

        for (const wrap of wraps) {
            if (wrap !== shopWrap) wrap.remove();
        }

        if (!shopWrap) {
            shopWrap = document.createElement('span');
            shopWrap.className = 'dock-poke-wrap script-shop-wrap';
            shopWrap.dataset.piwQolBuild = SCRIPT_BUILD;

            const shopsButton = document.createElement('button');
            shopsButton.id = 'dock-btn-shops';
            shopsButton.className = 'dock-btn';
            shopsButton.type = 'button';
            shopsButton.textContent = '🏪';
            shopsButton.title = tr('shops');
            shopsButton.setAttribute('aria-label', tr('shops'));

            const menu = document.createElement('div');
            menu.className = 'poke-menu script-shop-menu';
            menu.setAttribute('role', 'menu');
            menu.hidden = true;
            buildUtilityShopMenu(menu);

            shopsButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();

                const willOpen = menu.hidden;
                document.querySelectorAll('.script-shop-menu').forEach(other => {
                    if (other !== menu) other.hidden = true;
                });

                if (willOpen) buildUtilityShopMenu(menu);
                menu.hidden = !willOpen;
            });

            document.addEventListener('click', event => {
                if (shopWrap.isConnected && !shopWrap.contains(event.target)) {
                    menu.hidden = true;
                }
            });

            shopWrap.append(shopsButton, menu);
        }

        // Si el juego reconstruyó el dock, vuelve a colocar los accesos.
        if (shopWrap.parentElement !== gameDock) gameDock.appendChild(shopWrap);
        shopWrap.style.removeProperty('display');
        shopWrap.hidden = false;

        const shopsButton = shopWrap.querySelector('#dock-btn-shops');
        if (shopsButton) {
            shopsButton.hidden = false;
            shopsButton.style.removeProperty('display');
        }

        let depotButton = document.getElementById('dock-btn-depot');
        if (!depotButton) {
            depotButton = document.createElement('button');
            depotButton.id = 'dock-btn-depot';
            depotButton.className = 'dock-btn';
            depotButton.type = 'button';
            depotButton.textContent = '📦';
            depotButton.title = 'Depósito';
            depotButton.setAttribute('aria-label', 'Depósito');
            depotButton.addEventListener('click', showPortableDepot);
        }

        depotButton.hidden = false;
        depotButton.style.removeProperty('display');

        if (depotButton.parentElement !== gameDock || depotButton.previousElementSibling !== shopWrap) {
            shopWrap.after(depotButton);
        }

        return true;
    }

    let configDropdownCloseHandler = null;

    function injectConfigTab() {
        const cfgWindow = document.querySelector('.cfg-window');
        if (!cfgWindow || cfgWindow.querySelector('.cfg-tab-mods')) return;

        const cfgTabs = cfgWindow.querySelector('.cfg-tabs');
        const cfgBody = cfgWindow.querySelector('.cfg-body');
        if (!cfgTabs || !cfgBody) return;

        const modsTab = document.createElement('button');
        modsTab.className = 'cfg-tab cfg-tab-mods';
        modsTab.type = 'button';
        modsTab.textContent = tr('scriptMods');

        let originalContent = cfgBody.querySelector('.cfg-original-content');
        if (!originalContent) {
            originalContent = document.createElement('div');
            originalContent.className = 'cfg-original-content';
            while (cfgBody.firstChild) originalContent.appendChild(cfgBody.firstChild);
            cfgBody.appendChild(originalContent);
        }

        let modsContent = cfgBody.querySelector('.cfg-mods-content');
        if (!modsContent) {
            modsContent = document.createElement('div');
            modsContent.className = 'cfg-mods-content';
            modsContent.style.display = 'none';
            cfgBody.appendChild(modsContent);
        }

        cfgTabs.appendChild(modsTab);

        function updateModsUI() {
            const chatActiveState = isChatActive();
            const sellConfirmItems = getSellConfirmItems();

            modsContent.innerHTML = `
                <div class="script-mods-grid">
                    <div class="script-mods-title" style="font-size: 17px; font-weight: bold; color: #63b3ed; border-bottom: 1px solid #1a2d3a; padding-bottom: 10px; margin-bottom: 2px;">⚙️ ${tr('modSettings')}</div>

                    <div class="cfg-row script-mods-wide" style="background:#14222d;padding:10px;border-radius:6px;border:1px solid #1a2d3a;margin:0;">
                        <div class="cfg-label" style="margin-bottom:7px;">
                            <b style="color:#e2e8f0;font-size:14px;">Fuente del juego</b>
                            <span style="color:#a0aec0;font-size:11px;">Aplica la misma familia tipográfica a todas las ventanas y controles.</span>
                        </div>
                        <select class="cfg-game-font" style="width:100%;background:#0c161f;color:#e2e8f0;border:1px solid #273f52;border-radius:6px;padding:7px;">
                            <option value="barlow">Barlow (original)</option>
                            <option value="verdana">Verdana</option>
                            <option value="arial">Arial</option>
                            <option value="system">Fuente del sistema</option>
                            <option value="cinzel">Cinzel</option>
                            <option value="custom">Personalizada</option>
                        </select>
                        <input class="cfg-custom-font" type="text" placeholder='Ex.: "Trebuchet MS", sans-serif' style="width:100%;margin-top:7px;background:#0c161f;color:#e2e8f0;border:1px solid #273f52;border-radius:6px;padding:7px;">
                        <div class="cfg-font-file-row">
                            <input class="cfg-custom-font-file" type="file" accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf" hidden>
                            <button class="cfg-seg-btn cfg-choose-font-file" type="button">Abrir archivo de fuente…</button>
                            <span class="cfg-font-file-name">${escapeHTML(localStorage.getItem(STORAGE_CUSTOM_FONT_NAME) || 'Ningún archivo seleccionado')}</span>
                        </div>
                    </div>

                    ${[
                        ['cfg-unified-fonts', STORAGE_UNIFIED_FONTS, 'Fuente unificada', 'Aplica la fuente seleccionada a las ventanas y controles del juego.'],
                        ['cfg-custom-scrollbars', STORAGE_CUSTOM_SCROLLBARS, 'Barras de desplazamiento minimalistas', 'Sustituye las barras blancas por un estilo transparente.'],
                        ['cfg-compare-window', STORAGE_COMPARE_WINDOW, 'Comparación de hunts', 'Muestra la ventana móvil y redimensionable de comparación.'],
                        ['cfg-mark-quick-buy', STORAGE_MARK_QUICK_BUY, 'Compras rápidas en Mark', 'Muestra 1, 10, 100, 1.000 y 10.000 en cada producto.'],
                        ['cfg-mark-quality-picker', STORAGE_MARK_QUALITY_PICKER, 'Selector de calidades de Mark', 'Agrupa las calidades en un selector múltiple.'],
                        ['cfg-show-quality-potential', STORAGE_SHOW_QUALITY_POTENTIAL, 'Porcentaje de potencial', 'Muestra una estimación (75 % calidad + 25 % IV) junto a la calidad en el equipo, el registro de capturas y la venta masiva. No es un valor oficial del juego, pero estima la fuerza del Pokémon.']
                    ].map(([className, key, title, description]) => `
                        <label class="cfg-row" style="background:#14222d;padding:10px;border-radius:6px;border:1px solid #1a2d3a;margin:0;display:flex;align-items:center;gap:9px;">
                            <input class="${className}" data-pref-key="${key}" type="checkbox" ${preferenceEnabled(key) ? 'checked' : ''}>
                            <span class="cfg-label"><b style="color:#e2e8f0;font-size:14px;">${title}</b><span style="color:#a0aec0;font-size:11px;">${description}</span></span>
                        </label>`).join('')}
                    
                    <div class="cfg-row" style="background: #14222d; padding: 10px; border-radius: 6px; border: 1px solid #1a2d3a; margin: 0;">
                        <div class="cfg-label" style="margin-bottom: 6px;">
                            <b style="color: #e2e8f0; font-size: 14px;">${tr('chatInterface')}</b>
                            <span style="color: #a0aec0; font-size: 11px;">${tr('chatInterfaceDesc')}</span>
                        </div>
                        <div class="cfg-seg" style="display: flex; gap: 4px;">
                            <button class="cfg-seg-btn ${chatActiveState ? 'on' : ''} btn-chat-on" type="button" style="flex:1;">${tr('show')}</button>
                            <button class="cfg-seg-btn ${!chatActiveState ? 'on' : ''} btn-chat-off" type="button" style="flex:1;">${tr('hide')}</button>
                        </div>
                    </div>

                    <div class="cfg-row" style="background: #14222d; padding: 10px; border-radius: 6px; border: 1px solid #1a2d3a; margin: 0;">
                        <div class="cfg-label" style="margin-bottom: 6px;">
                            <b style="color: #e2e8f0; font-size: 14px;">${tr('selectAllGuards')}</b>
                            <span style="color: #a0aec0; font-size: 11px;">${tr('selectAllGuardsDesc')}</span>
                        </div>
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 4px 0;">
                            <input type="checkbox" class="btn-guard-leg" ${isGuardLegendaryActive() ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer; accent-color:#3182ce;">
                            <span style="color:#a0aec0; font-size:12px;">${tr('protectLegendary')}</span>
                        </label>
                    </div>

                    <div class="cfg-row script-mods-wide" style="background:#14222d;padding:10px;border-radius:6px;border:1px solid #1a2d3a;margin:0;">
                        <div class="cfg-label" style="margin-bottom:8px;">
                            <b style="color:#e2e8f0;font-size:14px;">${tr('huntFeatures')}</b>
                            <span style="color:#a0aec0;font-size:11px;">${tr('huntFeaturesDesc')}</span>
                        </div>
                        ${[
                            ['btn-hunt-market', isHuntMarketActive(), tr('marketHud'), tr('marketHudDesc')],
                            ['btn-hunt-bulk', isHuntBulkBuyActive(), tr('bulkBuy'), tr('bulkBuyDesc')],
                            ['btn-hunt-sell', isHuntSellActive(), tr('huntSell'), tr('huntSellDesc')],
                            ['btn-mark-enhancements', isMarkEnhancementsActive(), tr('cityMark'), tr('cityMarkDesc')]
                        ].map(([className, checked, title, description]) => `
                            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:5px 0;">
                                <input type="checkbox" class="${className}" ${checked ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;accent-color:#3182ce;">
                                <span><b style="display:block;color:#e2e8f0;font-size:12px;">${title}</b><small style="color:#a0aec0;">${description}</small></span>
                            </label>`).join('')}
                    </div>

                    <div class="cfg-row script-mods-wide" style="background: #14222d; padding: 10px; border-radius: 6px; border: 1px solid #1a2d3a; margin: 0; display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap;">
                        <div class="cfg-label" style="flex:1;">
                            <b style="color: #e2e8f0; font-size: 14px;">${tr('sellConfirmation')}</b>
                            <span style="color: #a0aec0; font-size: 11px; display:block; margin-top:4px;">${tr('protectedItems')}</span>
                        </div>
                        
                        <div id="cfg-sell-selected-list" style="flex:1; display:flex; flex-direction:column; gap:4px; max-height:120px; overflow-y:auto; padding-right:4px;">
                        </div>
                        
                        <div style="flex:1; position:relative; min-width:180px;">
                            <button type="button" id="cfg-sell-dd-btn" style="width:100%; text-align:left; background:#0c161f; color:#e2e8f0; border:1px solid #273f52; padding:6px 10px; border-radius:4px; cursor:pointer;">${tr('selectItems')}</button>
                            <div id="cfg-sell-dropdown-menu" style="display:none; position:absolute; top:100%; right:0; width:100%; background:#14222d; border:1px solid #273f52; border-radius:4px; z-index:10; box-shadow:0 4px 6px rgba(0,0,0,0.3); margin-top:4px; padding:6px; box-sizing:border-box;">
                                <input type="text" id="cfg-sell-search" placeholder="${tr('search')}" style="width:100%; box-sizing:border-box; background:#0c161f; color:#e2e8f0; border:1px solid #273f52; border-radius:4px; padding:6px; outline:none; margin-bottom:6px;">
                                <div id="cfg-sell-dropdown" style="max-height:150px; overflow-y:auto;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const modsGrid = modsContent.querySelector('.script-mods-grid');
            const assignedRows = new Set();
            const addCategory = (icon, title, selectors) => {
                const rows = selectors.flatMap(selector => Array.from(modsGrid.querySelectorAll(selector)).map(element => element.closest('.cfg-row')))
                    .filter(row => row && !assignedRows.has(row));
                if (!rows.length) return;
                const section = document.createElement('section');
                section.className = 'script-mod-category';
                section.innerHTML = `<h3><span>${icon}</span>${title}</h3><div class="script-mod-category-grid"></div>`;
                const sectionGrid = section.querySelector('.script-mod-category-grid');
                rows.forEach(row => { assignedRows.add(row); sectionGrid.appendChild(row); });
                modsGrid.appendChild(section);
            };
            addCategory('🎨', 'Apariencia y fuentes', ['.cfg-game-font', '.cfg-unified-fonts', '.cfg-custom-scrollbars']);
            addCategory('🪟', 'Interfaz', ['.btn-chat-on']);
            addCategory('⚔️', 'Hunts, tiendas y Mark', ['.cfg-compare-window', '.cfg-mark-quick-buy', '.cfg-mark-quality-picker', '.btn-hunt-market']);
            addCategory('🛡️', 'Protecciones y ventas', ['.btn-guard-leg', '#cfg-sell-dd-btn']);
            const remaining = Array.from(modsGrid.children).filter(element => element.classList.contains('cfg-row'));
            if (remaining.length) {
                const section = document.createElement('section');
                section.className = 'script-mod-category';
                section.innerHTML = '<h3><span>⚙️</span>Otros recursos</h3><div class="script-mod-category-grid"></div>';
                remaining.forEach(row => section.querySelector('.script-mod-category-grid').appendChild(row));
                modsGrid.appendChild(section);
            }

            modsContent.querySelector('.cfg-game-font').value = getGameFont();
            modsContent.querySelector('.cfg-game-font').addEventListener('change', event => applyGameFont(event.target.value));
            modsContent.querySelector('.cfg-custom-font').value = getCustomFont();
            modsContent.querySelector('.cfg-custom-font').addEventListener('input', event => {
                localStorage.setItem(STORAGE_CUSTOM_FONT, event.target.value.replace(/[;{}]/g, ''));
                if (modsContent.querySelector('.cfg-game-font').value === 'custom') applyGameFont('custom');
            });
            const customFontFile = modsContent.querySelector('.cfg-custom-font-file');
            modsContent.querySelector('.cfg-choose-font-file').addEventListener('click', () => customFontFile.click());
            customFontFile.addEventListener('change', async () => {
                const file = customFontFile.files?.[0];
                if (!file) return;
                const extension = file.name.split('.').pop()?.toLowerCase();
                if (!['woff', 'woff2', 'ttf', 'otf'].includes(extension)) {
                    showScriptNotice('Selecciona un archivo .woff, .woff2, .ttf u .otf.', { title: 'Fuente no válida', isError: true });
                    return;
                }
                try {
                    const buffer = await file.arrayBuffer();
                    const face = new FontFace(CUSTOM_FONT_FAMILY, buffer);
                    await face.load();
                    document.fonts.add(face);
                    await storeCustomFontFile(buffer);
                    localStorage.setItem(STORAGE_CUSTOM_FONT, `"${CUSTOM_FONT_FAMILY}", sans-serif`);
                    localStorage.setItem(STORAGE_CUSTOM_FONT_NAME, file.name);
                    modsContent.querySelector('.cfg-custom-font').value = `"${CUSTOM_FONT_FAMILY}", sans-serif`;
                    modsContent.querySelector('.cfg-game-font').value = 'custom';
                    modsContent.querySelector('.cfg-font-file-name').textContent = file.name;
                    applyGameFont('custom');
                    showScriptNotice(`Fuente “${file.name}” aplicada y guardada.`, { title: 'Fuente personalizada' });
                } catch (error) {
                    showScriptNotice(`No se ha podido cargar la fuente: ${error.message}`, { title: 'Error de fuente', isError: true });
                }
            });
            modsContent.querySelectorAll('[data-pref-key]').forEach(control => control.addEventListener('change', event => {
                localStorage.setItem(event.target.dataset.prefKey, String(event.target.checked));
                applyVisualPreferences();
                if (event.target.dataset.prefKey === STORAGE_SHOW_QUALITY_POTENTIAL) {
                    setTimeout(enhancePartyQuality, 0);
                }
                if (event.target.dataset.prefKey === STORAGE_COMPARE_WINDOW) {
                    document.querySelector('.ha-script-actions')?.remove();
                    trackHuntAnalyzer();
                    if (!event.target.checked) document.querySelector('.ha-compare-backdrop')?.remove();
                }
                const mkWindow = findNativeMarkWindow();
                if (mkWindow) {
                    if (!preferenceEnabled(STORAGE_MARK_QUICK_BUY)) {
                        mkWindow.querySelectorAll('.script-mark-row-buy').forEach(node => node.remove());
                        mkWindow.querySelectorAll('button.mk-buy').forEach(button => button.style.removeProperty('display'));
                        mkWindow.querySelector('.mk-qtybar')?.style.removeProperty('display');
                    }
                    if (!preferenceEnabled(STORAGE_MARK_QUALITY_PICKER)) {
                        mkWindow.querySelector('.script-quality-multiselect')?.remove();
                        mkWindow.querySelector('.script-quality-dropdown')?.remove();
                        markQualityMenuOpen = false;
                        mkWindow.querySelectorAll('[data-script-quality-native]').forEach(button => {
                            button.style.removeProperty('display');
                            delete button.dataset.scriptQualityNative;
                        });
                    }
                    injectShopEnhancements();
                }
            }));

            modsContent.querySelector('.btn-chat-on').addEventListener('click', () => { setChatActive(true); updateModsUI(); });
            modsContent.querySelector('.btn-chat-off').addEventListener('click', () => { setChatActive(false); updateModsUI(); });

            modsContent.querySelector('.btn-guard-leg').addEventListener('change', (e) => {
                setGuardLegendary(e.target.checked);
            });
            modsContent.querySelector('.btn-hunt-market').addEventListener('change', e => {
                setHuntMarketActive(e.target.checked);
                injectHuntShopLauncher();
                if (!e.target.checked) document.querySelector('.script-market-backdrop')?.remove();
            });
            modsContent.querySelector('.btn-hunt-bulk').addEventListener('change', e => {
                setHuntBulkBuyActive(e.target.checked);
                const ballWindow = document.querySelector('.ball-window');
                if (ballWindow) injectHuntBallEnhancements(ballWindow);
            });
            modsContent.querySelector('.btn-hunt-sell').addEventListener('change', e => {
                setHuntSellActive(e.target.checked);
                injectHuntShopLauncher();
                const ballWindow = document.querySelector('.ball-window');
                if (ballWindow) injectHuntBallEnhancements(ballWindow);
            });
            modsContent.querySelector('.btn-mark-enhancements').addEventListener('change', e => setMarkEnhancementsActive(e.target.checked));

            const selectedListEl = modsContent.querySelector('#cfg-sell-selected-list');
            const ddBtn = modsContent.querySelector('#cfg-sell-dd-btn');
            const ddMenu = modsContent.querySelector('#cfg-sell-dropdown-menu');
            const searchInputEl = modsContent.querySelector('#cfg-sell-search');
            const dropdownEl = modsContent.querySelector('#cfg-sell-dropdown');

            ddBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                ddMenu.style.display = ddMenu.style.display === 'none' ? 'block' : 'none';
                if (ddMenu.style.display === 'block') {
                    renderDropdown();
                    searchInputEl.focus();
                }
            });

            if (configDropdownCloseHandler) {
                document.removeEventListener('click', configDropdownCloseHandler);
            }
            configDropdownCloseHandler = (e) => {
                if (!ddMenu.contains(e.target) && e.target !== ddBtn) {
                    ddMenu.style.display = 'none';
                }
            };
            document.addEventListener('click', configDropdownCloseHandler);

            let uniqueItems = null;

            function initUniqueItems() {
                if (uniqueItems) return;
                uniqueItems = [];
                const seenNames = new Set();
                for (const item of globalItemApiData.values()) {
                    const name = item.name || item.title;
                    if (name && !seenNames.has(name)) {
                        seenNames.add(name);
                        uniqueItems.push(item);
                    }
                }
                uniqueItems.sort((a, b) => (a.name || a.title).localeCompare(b.name || b.title));
            }

            function renderSelected() {
                const items = getSellConfirmItems();
                selectedListEl.innerHTML = '';
                if (items.length === 0) {
                    selectedListEl.innerHTML = `<span style="color:#718096; font-size:12px; margin:auto;">${tr('noProtected')}</span>`;
                } else {
                    items.forEach(itemName => {
                        const iconHTML = resolveItemIcon(itemName);
                        const tag = document.createElement('div');
                        tag.style = 'display:flex; justify-content:space-between; align-items:center; background:#1a2d3a; border:1px solid #2b4c66; padding:4px 8px; border-radius:4px; font-size:12px;';
                        
                        const leftDiv = document.createElement('div');
                        leftDiv.style = 'display:flex; align-items:center; gap:6px; color:#e2e8f0;';
                        leftDiv.innerHTML = `${iconHTML} <span>${itemName}</span>`;
                        
                        const rmBtn = document.createElement('span');
                        rmBtn.innerHTML = '×';
                        rmBtn.style = 'cursor:pointer; color:#f56565; font-weight:bold; font-size:14px;';
                        rmBtn.addEventListener('click', () => {
                            setSellConfirmItems(items.filter(i => i !== itemName));
                            renderSelected();
                            if (ddMenu.style.display === 'block') renderDropdown();
                        });
                        
                        tag.appendChild(leftDiv);
                        tag.appendChild(rmBtn);
                        selectedListEl.appendChild(tag);
                    });
                }
            }

            function renderDropdown() {
                initUniqueItems();
                const query = searchInputEl.value.toLowerCase().trim();
                const selectedItems = getSellConfirmItems();
                dropdownEl.innerHTML = '';
                
                const filtered = query ? uniqueItems.filter(item => (item.name || item.title).toLowerCase().includes(query)) : uniqueItems;
                const toShow = filtered.slice(0, 50);

                if (toShow.length === 0) {
                    dropdownEl.innerHTML = `<div style="padding:6px; color:#718096; font-size:12px; text-align:center;">${tr('noItemFound')}</div>`;
                    return;
                }
                
                toShow.forEach(item => {
                    const itemName = item.name || item.title;
                    const isChecked = selectedItems.includes(itemName);
                    const iconHTML = resolveItemIcon(itemName);
                    
                    const row = document.createElement('label');
                    row.style = 'display:flex; align-items:center; padding:6px 10px; cursor:pointer; border-bottom:1px solid #1a2d3a; font-size:13px;';
                    row.addEventListener('mouseenter', () => row.style.background = '#14222d');
                    row.addEventListener('mouseleave', () => row.style.background = 'transparent');
                    
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.checked = isChecked;
                    cb.style.marginRight = '8px';
                    cb.addEventListener('change', () => {
                        let current = getSellConfirmItems();
                        if (cb.checked && !current.includes(itemName)) current.push(itemName);
                        else if (!cb.checked) current = current.filter(i => i !== itemName);
                        setSellConfirmItems(current);
                        renderSelected();
                    });
                    
                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = itemName;
                    nameSpan.style.color = '#e2e8f0';
                    
                    row.appendChild(cb);
                    row.insertAdjacentHTML('beforeend', iconHTML);
                    row.appendChild(nameSpan);
                    dropdownEl.appendChild(row);
                });
            }

            searchInputEl.addEventListener('input', renderDropdown);
            renderSelected();
        }

        const tabsList = Array.from(cfgTabs.querySelectorAll('.cfg-tab'));
        tabsList.forEach(tab => {
            tab.addEventListener('click', () => {
                tabsList.forEach(t => t.classList.remove('on'));
                tab.classList.add('on');
                if (tab.classList.contains('cfg-tab-mods')) {
                    cfgWindow.classList.add('script-mods-open');
                    originalContent.style.display = 'none';
                    modsContent.style.display = 'block';
                    updateModsUI();
                } else {
                    cfgWindow.classList.remove('script-mods-open');
                    modsContent.style.display = 'none';
                    originalContent.style.display = 'block';
                }
            });
        });
    }

    function showSellConfirm(itemNames, callback) {
        if (!itemNames || itemNames.length === 0) return callback(true);
        
        const backdrop = document.createElement('div');
        backdrop.className = 'sell-confirm-backdrop';
        backdrop.innerHTML = `
            <div class="sell-confirm-modal">
                <div class="sell-confirm-title">⚠️ Confirmar venta</div>
                <div class="sell-confirm-body">
                    <p>Estás a punto de vender los siguientes objetos de gran valor:</p>
                    <div class="sell-confirm-items">
                        ${itemNames.map(n => `<div>• ${escapeHTML(n)}</div>`).join('')}
                    </div>
                    <div class="sell-confirm-footer">
                        <button class="sell-confirm-btn yes" type="button">✅ Confirmar venta</button>
                        <button class="sell-confirm-btn no" type="button">❌ Cancelar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        
        backdrop.querySelector('.yes').addEventListener('click', () => {
            backdrop.remove();
            callback(true);
        });
        backdrop.querySelector('.no').addEventListener('click', () => {
            backdrop.remove();
            callback(false);
        });
    }

    function getPokemonRarity(row) {
        const span = row.querySelector('.mk-meta span');
        if (!span) return null;
        return span.textContent.trim().toLowerCase();
    }

    function getGameTokens() {
        try {
            return JSON.parse(sessionStorage.getItem('pokeweb:tokens') || 'null');
        } catch {
            return null;
        }
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
        const refreshed = await response.json();
        if (!refreshed?.accessToken) return null;
        sessionStorage.setItem('pokeweb:tokens', JSON.stringify(refreshed));
        return refreshed.accessToken;
    }

    async function gameApiRequest(url, options = {}) {
        const send = accessToken => fetch(url, {
            ...options,
            headers: {
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                ...(options.headers || {})
            }
        });

        let response = await send(getGameTokens()?.accessToken);
        if (response.status === 401) {
            const refreshedToken = await refreshGameAccessToken();
            if (refreshedToken) response = await send(refreshedToken);
        }

        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.message || `HTTP ${response.status}`);
        return result;
    }

    async function readSellableInventoryFromDOM() {
        if (itemDataLoadPromise) await itemDataLoadPromise;
        const findVisibleInventory = () => Array.from(document.querySelectorAll('.inv-window')).find(windowElement => {
            const style = getComputedStyle(windowElement);
            const rect = windowElement.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        }) || null;

        let inventoryWindow = findVisibleInventory();
        const openedByScript = !inventoryWindow;
        if (!inventoryWindow) {
            document.querySelector('[data-guide="dock-inventory"]')?.click();
            for (let attempt = 0; attempt < 15 && !inventoryWindow; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                inventoryWindow = findVisibleInventory();
            }
        }
        if (!inventoryWindow) throw new Error('No se ha podido abrir el inventario.');

        const payload = await fetch(ITEMS_JSON_URL).then(response => response.json());
        const items = Array.isArray(payload) ? payload : (payload.items || []);
        const catalogById = new Map(items.map(item => [String(item.id), item]));

        const entries = Array.from(inventoryWindow.querySelectorAll('.inv-slot[data-guide^="inv-item-"]'))
            .map(slot => {
                const itemId = slot.dataset.guide.replace('inv-item-', '');
                const name = slot.querySelector('.inv-ico')?.alt?.trim() || '';
                const qty = parseInt(slot.querySelector('.inv-qty')?.textContent, 10) || 0;
                const catalogItem = catalogById.get(String(itemId));
                return {
                    itemId,
                    name,
                    qty,
                    category: String(catalogItem?.category || '').toLowerCase(),
                    npcPrice: parseGameNumber(catalogItem?.npcPrice)
                };
            })
            .filter(item => item.itemId && item.name && item.qty > 0 && item.npcPrice > 0)
            .filter(item => !['heal', 'revive', 'stone'].includes(item.category));

        if (openedByScript) inventoryWindow.querySelector('.cfg-x')?.click();
        return entries;
    }

    function sellItemsThroughShop(items) {
        return gameApiRequest('/api/game/shop/sell', {
            method: 'POST',
            body: JSON.stringify({ items })
        });
    }

    function showPurchaseConfirm({ name, quantity, unitPrice, currentGold, currentBalance, currency = 'GOLD' }, callback) {
        const total = quantity * unitPrice;
        const balance = Number(currentBalance ?? currentGold ?? 0);
        const currencyIcon = String(currency).toUpperCase() === 'DIAMONDS' ? '💎' : '💲';
        const locale = 'es-ES';
        const backdrop = document.createElement('div');
        backdrop.className = 'sell-confirm-backdrop';
        backdrop.innerHTML = `
            <div class="sell-confirm-modal">
                <div class="sell-confirm-title">🛒 Confirmar compra</div>
                <div class="sell-confirm-body">
                    <p><b>${quantity.toLocaleString(locale)}× ${escapeHTML(name)}</b></p>
                    <div class="sell-confirm-items">
                        <div>Precio unitario: ${currencyIcon}${unitPrice.toLocaleString(locale)}</div>
                        <div>Total: ${currencyIcon}${total.toLocaleString(locale)}</div>
                        <div>Saldo después de la compra: ${currencyIcon}${Math.max(0, balance - total).toLocaleString(locale)}</div>
                    </div>
                    <div class="sell-confirm-footer">
                        <button class="sell-confirm-btn yes" type="button" ${total > balance ? 'disabled' : ''}>Confirmar</button>
                        <button class="sell-confirm-btn no" type="button">Cancelar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        backdrop.querySelector('.yes').addEventListener('click', () => {
            backdrop.remove();
            callback(true);
        });
        backdrop.querySelector('.no').addEventListener('click', () => {
            backdrop.remove();
            callback(false);
        });
    }

    function showScriptNotice(message, { title = 'Aviso', isError = false } = {}) {
        return new Promise(resolve => {
            const backdrop = document.createElement('div');
            backdrop.className = 'sell-confirm-backdrop script-notice-backdrop';
            backdrop.innerHTML = `
                <div class="sell-confirm-modal" style="width:min(420px,92vw);">
                    <div class="sell-confirm-title">${isError ? '⚠️' : 'ℹ️'} ${escapeHTML(title)}</div>
                    <div class="sell-confirm-body">
                        <p style="margin:0 0 14px;color:${isError ? '#feb2b2' : '#e2e8f0'};">${escapeHTML(message)}</p>
                        <div class="sell-confirm-footer">
                            <button class="sell-confirm-btn yes script-notice-ok" type="button">OK</button>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(backdrop);
            backdrop.querySelector('.script-notice-ok').addEventListener('click', () => {
                backdrop.remove();
                resolve();
            });
        });
    }

    function showScriptConfirm(message, { title = 'Confirmar', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' } = {}) {
        return new Promise(resolve => {
            const backdrop = document.createElement('div');
            backdrop.className = 'sell-confirm-backdrop script-confirm-backdrop';
            backdrop.innerHTML = `
                <div class="sell-confirm-modal" style="width:min(440px,92vw);">
                    <div class="sell-confirm-title">❔ ${escapeHTML(title)}</div>
                    <div class="sell-confirm-body">
                        <p style="margin:0 0 14px;color:#e2e8f0;">${escapeHTML(message)}</p>
                        <div class="sell-confirm-footer">
                            <button class="sell-confirm-btn yes script-confirm-yes" type="button">${escapeHTML(confirmLabel)}</button>
                            <button class="sell-confirm-btn no script-confirm-no" type="button">${escapeHTML(cancelLabel)}</button>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(backdrop);
            backdrop.querySelector('.script-confirm-yes').addEventListener('click', () => {
                backdrop.remove();
                resolve(true);
            });
            backdrop.querySelector('.script-confirm-no').addEventListener('click', () => {
                backdrop.remove();
                resolve(false);
            });
        });
    }

    function showScriptQuantityPrompt(message, {
        title = 'Cantidad',
        value = 1,
        min = 1,
        max = Number.MAX_SAFE_INTEGER,
        confirmLabel = 'Aceptar',
        cancelLabel = 'Cancelar'
    } = {}) {
        return new Promise(resolve => {
            const safeMin = Math.max(1, Math.floor(Number(min) || 1));
            const safeMax = Math.max(safeMin, Math.floor(Number(max) || safeMin));
            const safeValue = Math.min(safeMax, Math.max(safeMin, Math.floor(Number(value) || safeMin)));
            const backdrop = document.createElement('div');
            backdrop.className = 'sell-confirm-backdrop script-quantity-backdrop';
            backdrop.innerHTML = `
                <div class="sell-confirm-modal" style="width:min(440px,92vw);">
                    <div class="sell-confirm-title">🔢 ${escapeHTML(title)}</div>
                    <div class="sell-confirm-body">
                        <p style="margin:0 0 12px;color:#e2e8f0;">${escapeHTML(message)}</p>
                        <input class="script-quantity-input" type="number" min="${safeMin}" max="${safeMax}" step="1" value="${safeValue}"
                            style="width:100%;box-sizing:border-box;background:#0c161f;color:#e2e8f0;border:1px solid #273f52;border-radius:6px;padding:8px 10px;font-weight:800;">
                        <div style="margin-top:6px;color:#8293a6;font-size:11px;">Disponible: ${safeMax.toLocaleString('es-ES')}</div>
                        <div class="sell-confirm-footer">
                            <button class="sell-confirm-btn yes script-quantity-yes" type="button">${escapeHTML(confirmLabel)}</button>
                            <button class="sell-confirm-btn no script-quantity-no" type="button">${escapeHTML(cancelLabel)}</button>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(backdrop);

            const input = backdrop.querySelector('.script-quantity-input');
            const finish = accepted => {
                if (!accepted) {
                    backdrop.remove();
                    resolve(null);
                    return;
                }
                const quantity = Math.floor(Number(input.value));
                if (!Number.isFinite(quantity) || quantity < safeMin || quantity > safeMax) {
                    input.focus();
                    input.select();
                    return;
                }
                backdrop.remove();
                resolve(quantity);
            };

            backdrop.querySelector('.script-quantity-yes').addEventListener('click', () => finish(true));
            backdrop.querySelector('.script-quantity-no').addEventListener('click', () => finish(false));
            backdrop.addEventListener('click', event => {
                if (event.target === backdrop) finish(false);
            });
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    finish(true);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(false);
                }
            });

            requestAnimationFrame(() => {
                input.focus();
                input.select();
            });
        });
    }

    function showWindowMessage(windowElement, message, isError = false) {
        let messageElement = windowElement.querySelector('.script-window-message');
        if (!messageElement) {
            messageElement = document.createElement('div');
            messageElement.className = 'script-window-message';
            messageElement.style.cssText = 'padding:7px 12px;text-align:center;font-size:12px;font-weight:bold;';
            windowElement.appendChild(messageElement);
        }
        messageElement.style.color = isError ? '#f56565' : '#48bb78';
        messageElement.textContent = message;
        clearTimeout(messageElement._hideTimer);
        messageElement._hideTimer = setTimeout(() => messageElement.remove(), 3500);
    }

    async function showPortableDepot() {
        document.querySelector('.portable-depot-backdrop')?.remove();

        const backdrop = document.createElement('div');
        backdrop.className = 'sell-confirm-backdrop portable-depot-backdrop';
        backdrop.innerHTML = `
            <div class="sell-confirm-modal" style="width:780px;max-width:95vw;">
                <div class="sell-confirm-title">
                    <span>📦 Depósito</span>
                    <button class="mk-bulk-btn depot-tab active" data-tab="items" type="button" style="margin-left:auto;">Objetos</button>
                    <button class="mk-bulk-btn depot-tab" data-tab="pokemon" type="button">Pokémon</button>
                    <span class="portable-depot-family-tabs"></span>
                    <button class="portable-depot-close" type="button" style="background:none;border:0;color:#a0aec0;font-size:20px;cursor:pointer;">×</button>
                </div>
                <div class="sell-confirm-body">
                    <div class="portable-depot-status" style="color:#a0aec0;text-align:center;padding:16px;">Cargando depósito...</div>
                    <div class="portable-depot-content"></div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        const close = () => backdrop.remove();
        backdrop.querySelector('.portable-depot-close').addEventListener('click', close);
        backdrop.addEventListener('click', event => {
            if (event.target === backdrop) close();
        });

        const status = backdrop.querySelector('.portable-depot-status');
        const content = backdrop.querySelector('.portable-depot-content');
        const familyTabs = backdrop.querySelector('.portable-depot-family-tabs');
        let activeTab = 'items';
        let depotData = null;
        let pokes = [];
        let inventory = [];
        let familyData = null;
        let busy = false;
        const depotPokeFilters = { name: '', ivMin: '', ivMax: '', qualityMin: '', qualityMax: '' };
        const familyPokeFilters = { name: '', ivMin: '', ivMax: '', qualityMin: '', qualityMax: '' };
        const familySelections = {
            'item:deposit': new Set(),
            'item:withdraw': new Set(),
            'pokemon:deposit': new Set(),
            'pokemon:withdraw': new Set()
        };
        const familyEntryKey = (entry, kind) => String(kind === 'item' ? (entry.itemId ?? entry.id) : entry.id);
        const familySelection = (direction, kind) => familySelections[`${kind}:${direction}`];

        const performFamilyAction = async payload => {
            latestFamily = null;
            familyData = await requestGameEvent('family', { type: 'family-action', ...payload }, null, 3500);
            if (!familyData?.family) throw new Error('La familia ya no está disponible.');
            if (payload.action === 'item') {
                latestInventory = null;
                inventory = await requestFreshGameEvent('inventory', 'inv-get', { timeoutMs: 2500, attempts: 2 });
            } else {
                latestPokemon = null;
                pokes = await requestGameEvent('pokes', 'pokes-get', null, 2500);
            }
            return true;
        };

        const ensureFamilyMovesAvailable = count => {
            const family = familyData?.family;
            if (!family) return false;
            if (family.frozen) {
                showWindowMessage(backdrop.querySelector('.sell-confirm-modal'), 'El depósito familiar está bloqueado.', true);
                return false;
            }
            const remaining = Math.max(0, Number(family.movesCap || 0) - Number(family.movesUsed || 0));
            if (remaining < count) {
                showWindowMessage(
                    backdrop.querySelector('.sell-confirm-modal'),
                    `Has seleccionado ${count} movimientos, pero solo quedan ${remaining} disponibles hoy.`,
                    true
                );
                return false;
            }
            return true;
        };

        const familyAction = async payload => {
            if (busy || !familyData?.family || !ensureFamilyMovesAvailable(1)) return false;
            busy = true;
            try {
                await performFamilyAction(payload);
                render();
                return true;
            } catch (error) {
                showWindowMessage(backdrop.querySelector('.sell-confirm-modal'), error.message || 'No se ha podido mover.', true);
                return false;
            } finally {
                busy = false;
            }
        };

        const familyBulkAction = async (entries, direction, kind) => {
            if (busy || !familyData?.family || !entries.length) return false;
            if (!ensureFamilyMovesAvailable(entries.length)) return false;

            const verb = direction === 'deposit' ? 'Depositar' : 'Retirar';
            const noun = kind === 'item'
                ? `${entries.length} tipo${entries.length === 1 ? '' : 's'} de objeto`
                : `${entries.length} Pokémon`;
            const extra = kind === 'item'
                ? ' Se moverá la cantidad completa disponible de cada pila seleccionada.'
                : '';
            const confirmed = await showScriptConfirm(
                `${verb} ${noun} en un solo lote?${extra} Esto consumirá ${entries.length} movimiento${entries.length === 1 ? '' : 's'} familiar${entries.length === 1 ? '' : 'es'}.`,
                { title: 'Depósito familiar · Selección múltiple', confirmLabel: verb }
            );
            if (!confirmed) return false;

            busy = true;
            let moved = 0;
            try {
                for (const entry of entries) {
                    const payload = kind === 'item'
                        ? {
                            action: 'item',
                            dir: direction,
                            itemId: entry.itemId ?? entry.id,
                            quantity: Math.max(1, Math.floor(Number(entry.quantity) || 1))
                        }
                        : {
                            action: 'poke',
                            dir: direction,
                            capturedId: entry.id
                        };
                    await performFamilyAction(payload);
                    moved++;
                }
                familySelection(direction, kind).clear();
                render();
                showWindowMessage(
                    backdrop.querySelector('.sell-confirm-modal'),
                    `${moved} movimiento${moved === 1 ? '' : 's'} completado${moved === 1 ? '' : 's'}.`
                );
                return true;
            } catch (error) {
                render();
                showWindowMessage(
                    backdrop.querySelector('.sell-confirm-modal'),
                    `${moved} completado${moved === 1 ? '' : 's'} antes del error: ${error.message || 'no se ha podido continuar.'}`,
                    true
                );
                return false;
            } finally {
                busy = false;
            }
        };

        const makeFamilyColumn = (title, entries, direction, kind) => {
            const column = document.createElement('section');
            column.style.cssText = 'flex:1;min-width:260px;background:#0d1822;border:1px solid #243545;border-radius:10px;padding:10px;max-height:52vh;overflow:auto;';
            const heading = document.createElement('div');
            heading.style.cssText = 'font-weight:800;color:#e7edf4;margin:2px 4px 10px;';
            heading.textContent = `${title} (${entries.length})`;
            column.appendChild(heading);

            if (!entries.length) {
                familySelection(direction, kind).clear();
                const empty = document.createElement('div');
                empty.style.cssText = 'color:#7f91a3;text-align:center;padding:28px 8px;';
                empty.textContent = 'No hay contenido disponible.';
                column.appendChild(empty);
                return column;
            }

            const selection = familySelection(direction, kind);
            const availableKeys = new Set(entries.map(entry => familyEntryKey(entry, kind)));
            [...selection].forEach(key => { if (!availableKeys.has(key)) selection.delete(key); });

            const toolbar = document.createElement('div');
            toolbar.className = 'portable-family-toolbar';
            const selectAll = document.createElement('button');
            selectAll.type = 'button';
            selectAll.className = 'mk-bulk-btn';
            selectAll.textContent = 'Seleccionar todo';
            const clear = document.createElement('button');
            clear.type = 'button';
            clear.className = 'mk-bulk-btn';
            clear.textContent = 'Ninguno';
            const move = document.createElement('button');
            move.type = 'button';
            move.className = 'mk-bulk-btn';
            const count = document.createElement('span');
            count.className = 'portable-family-count';

            const updateToolbar = () => {
                move.textContent = `${direction === 'deposit' ? 'Depositar' : 'Retirar'} seleccionados (${selection.size})`;
                move.disabled = selection.size === 0 || busy;
                count.textContent = `${selection.size}/${entries.length} seleccionados`;
            };

            selectAll.addEventListener('click', () => {
                entries.forEach(entry => selection.add(familyEntryKey(entry, kind)));
                render();
            });
            clear.addEventListener('click', () => {
                selection.clear();
                render();
            });
            move.addEventListener('click', async () => {
                const selectedEntries = entries.filter(entry => selection.has(familyEntryKey(entry, kind)));
                await familyBulkAction(selectedEntries, direction, kind);
            });
            toolbar.append(selectAll, clear, move, count);
            column.appendChild(toolbar);

            entries.forEach(entry => {
                const key = familyEntryKey(entry, kind);
                const row = document.createElement('div');
                row.className = `portable-family-row${selection.has(key) ? ' selected' : ''}`;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = selection.has(key);
                checkbox.title = 'Incluir en selección múltiple';
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) selection.add(key);
                    else selection.delete(key);
                    row.classList.toggle('selected', checkbox.checked);
                    updateToolbar();
                });

                const icon = document.createElement('img');
                icon.src = kind === 'item' ? normalizeGameItemIcon(entry.icon) : getPokemonIconUrl(entry.speciesId);
                icon.alt = entry.name || '';
                icon.style.cssText = `width:34px;height:34px;object-fit:contain;${kind === 'pokemon' ? 'image-rendering:pixelated;' : ''}flex:none;`;
                icon.onerror = () => { icon.style.visibility = 'hidden'; };

                const label = document.createElement('span');
                label.style.cssText = 'min-width:0;flex:1;font-weight:700;cursor:pointer;';
                label.textContent = kind === 'item'
                    ? `${entry.name || `Item #${entry.itemId}`} · ${Number(entry.quantity || 0).toLocaleString('es-ES')}`
                    : `${entry.name || entry.speciesId} · Nv. ${Number(entry.level || 0)} · IV ${Number(entry.ivTotal || 0)} · ${formatPokemonQualityWithPotential(entry.quality, entry.ivTotal)}${direction === 'deposit' ? ` · ${entry.team ? 'Equipo' : 'Caja'}` : ''}`;
                label.addEventListener('click', () => {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                });

                const action = document.createElement('button');
                action.type = 'button';
                action.className = 'mk-bulk-btn portable-family-single';
                action.textContent = direction === 'deposit' ? 'Depositar →' : '← Retirar';
                action.addEventListener('click', async () => {
                    if (kind === 'item') {
                        const available = Math.max(1, Math.floor(Number(entry.quantity) || 1));
                        const quantity = await showScriptQuantityPrompt(
                            `${direction === 'deposit' ? 'Depositar' : 'Retirar'} ${entry.name || `Item #${entry.itemId ?? entry.id}`}:`,
                            {
                                title: 'Depósito familiar · Objetos',
                                value: available,
                                min: 1,
                                max: available,
                                confirmLabel: direction === 'deposit' ? 'Depositar' : 'Retirar'
                            }
                        );
                        if (quantity === null) return;
                        await familyAction({
                            action: 'item',
                            dir: direction,
                            itemId: entry.itemId ?? entry.id,
                            quantity
                        });
                    } else {
                        const confirmed = await showScriptConfirm(
                            `${direction === 'deposit' ? 'Depositar' : 'Retirar'} ${entry.name || 'este Pokémon'} en el depósito familiar?`,
                            { title: 'Depósito familiar' }
                        );
                        if (confirmed) await familyAction({ action: 'poke', dir: direction, capturedId: entry.id });
                    }
                });

                row.append(checkbox, icon, label, action);
                column.appendChild(row);
            });

            updateToolbar();
            return column;
        };

        const renderFamilyHeader = () => {
            const family = familyData?.family;
            if (!family) return;
            const header = document.createElement('div');
            header.style.cssText = 'flex-basis:100%;display:flex;justify-content:space-between;gap:12px;padding:9px 12px;background:#13222f;border:1px solid #263b4c;border-radius:8px;color:#cbd5e0;font-size:12px;';
            header.innerHTML = `<strong>${escapeHTML(family.name)}</strong><span>${Number(family.movesUsed || 0)}/${Number(family.movesCap || 0)} movimientos hoy${family.frozen ? ' · bloqueado' : ''}</span>`;
            content.appendChild(header);
        };

        const parseDepotDecimalFilter = value => {
            const text = String(value ?? '').trim();
            if (!text) return null;
            const parsed = Number(text.replace(',', '.'));
            return Number.isFinite(parsed) ? parsed : null;
        };

        const filterDepotPokemon = (entries, filters) => entries.filter(entry => {
            const name = String(entry.name || '').toLocaleLowerCase();
            const query = filters.name.trim().toLocaleLowerCase();
            const iv = Number(entry.ivTotal || 0);
            const quality = Number(entry.quality || 0);
            const qualityMin = parseDepotDecimalFilter(filters.qualityMin);
            const qualityMax = parseDepotDecimalFilter(filters.qualityMax);
            if (query && !name.includes(query)) return false;
            if (filters.ivMin !== '' && iv < Number(filters.ivMin)) return false;
            if (filters.ivMax !== '' && iv > Number(filters.ivMax)) return false;
            if (qualityMin !== null && quality < qualityMin) return false;
            if (qualityMax !== null && quality > qualityMax) return false;
            return true;
        });

        const makeDepotPokemonFilters = filters => {
            const controls = document.createElement('div');
            controls.className = 'portable-depot-poke-filters';
            controls.innerHTML = `
                <input type="search" data-filter="name" placeholder="Buscar Pokémon por nombre">
                <input type="number" data-filter="ivMin" min="0" max="192" placeholder="IV mín.">
                <input type="number" data-filter="ivMax" min="0" max="192" placeholder="IV máx.">
                <input type="text" inputmode="decimal" autocomplete="off" data-filter="qualityMin" placeholder="Calidad mín. · 1,70">
                <input type="text" inputmode="decimal" autocomplete="off" data-filter="qualityMax" placeholder="Calidad máx. · 1,70">
                <button type="button" class="portable-depot-quality-preset" title="Calidad ≥ 1,70 e IV ≥ 100">1,70+ · IV 100+</button>
                <button type="button" class="portable-depot-clear-filters">Limpiar</button>`;
            controls.querySelectorAll('[data-filter]').forEach(input => {
                input.value = filters[input.dataset.filter];
                input.addEventListener('input', () => {
                    filters[input.dataset.filter] = input.value;
                    render();
                    const replacement = content.querySelector(`[data-filter="${input.dataset.filter}"]`);
                    replacement?.focus();
                    replacement?.setSelectionRange?.(replacement.value.length, replacement.value.length);
                });
            });
            controls.querySelector('.portable-depot-quality-preset').addEventListener('click', () => {
                filters.ivMin = '100';
                filters.ivMax = '';
                filters.qualityMin = '1,70';
                filters.qualityMax = '';
                render();
            });
            controls.querySelector('.portable-depot-clear-filters').addEventListener('click', () => {
                Object.keys(filters).forEach(key => { filters[key] = ''; });
                render();
            });
            return controls;
        };

        const makeColumn = (title, entries, direction, emptyText, isPokemon = false) => {
            const column = document.createElement('section');
            column.style.cssText = 'flex:1;min-width:260px;background:#0d1822;border:1px solid #243545;border-radius:10px;padding:10px;max-height:58vh;overflow:auto;';
            const heading = document.createElement('div');
            heading.style.cssText = 'font-weight:800;color:#e7edf4;margin:2px 4px 10px;';
            heading.textContent = `${title} (${entries.length})`;
            column.appendChild(heading);

            if (!entries.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'color:#7f91a3;text-align:center;padding:28px 8px;';
                empty.textContent = emptyText;
                column.appendChild(empty);
                return column;
            }

            entries.forEach(entry => {
                const row = document.createElement('button');
                row.type = 'button';
                row.style.cssText = 'display:flex;width:100%;align-items:center;gap:9px;background:#13222f;color:#e7edf4;border:1px solid #263b4c;border-radius:8px;padding:8px;margin:0 0 7px;cursor:pointer;text-align:left;';
                const image = document.createElement('img');
                if (isPokemon) {
                    image.src = getPokemonIconUrl(entry.speciesId);
                    image.alt = entry.name || '';
                    image.style.cssText = 'width:34px;height:34px;object-fit:contain;image-rendering:pixelated;flex:none;';
                    image.onerror = () => { image.style.visibility = 'hidden'; };
                } else {
                    image.src = normalizeGameItemIcon(entry.icon);
                    image.alt = entry.name || '';
                    image.style.cssText = 'width:34px;height:34px;object-fit:contain;flex:none;';
                    image.onerror = () => { image.style.visibility = 'hidden'; };
                }
                const label = document.createElement('span');
                label.style.cssText = 'min-width:0;flex:1;font-weight:700;';
                label.textContent = isPokemon
                    ? `${entry.name || entry.pokeId} · Nv. ${Number(entry.level || 0)} · IV ${Number(entry.ivTotal || 0)} · ${formatPokemonQualityWithPotential(entry.quality, entry.ivTotal)}`
                    : `${entry.name} · ${Number(entry.quantity || 0).toLocaleString('es-ES')}`;
                const action = document.createElement('span');
                action.style.cssText = 'color:#64c8ff;font-size:12px;font-weight:800;';
                action.textContent = direction === 'store' ? 'Guardar →' : '← Retirar';
                row.append(image, label, action);
                row.addEventListener('click', async () => {
                    if (busy) return;
                    busy = true;
                    row.disabled = true;
                    try {
                        if (isPokemon) {
                            sendGameMessage({ type: direction === 'store' ? 'poke-store' : 'poke-withdraw', pokeId: entry.id });
                            latestPokemon = null;
                            await new Promise(resolve => setTimeout(resolve, 350));
                            pokes = await requestGameEvent('pokes', 'pokes-get', latestPokemon);
                        } else {
                            depotData = await gameApiRequest('/api/game/depot/move', {
                                method: 'POST',
                                body: JSON.stringify({ itemId: entry.id, dir: direction })
                            });
                        }
                        render();
                    } catch (error) {
                        showWindowMessage(backdrop.querySelector('.sell-confirm-modal'), error.message || 'No se ha podido mover.', true);
                    } finally {
                        busy = false;
                    }
                });
                column.appendChild(row);
            });
            return column;
        };

        const render = () => {
            content.innerHTML = '';
            content.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;';
            if (activeTab === 'items') {
                content.append(
                    makeColumn('Mochila', depotData?.inventory || [], 'store', 'La mochila está vacía.'),
                    makeColumn(`Depósito · ${depotData?.depot?.length || 0}/${depotData?.maxSlots || 0}`, depotData?.depot || [], 'withdraw', 'El depósito está vacío.')
                );
            } else if (activeTab === 'pokemon') {
                content.appendChild(makeDepotPokemonFilters(depotPokeFilters));
                const team = filterDepotPokemon(pokes.filter(poke => poke.team && !String(poke.id).startsWith('team-')), depotPokeFilters);
                const box = filterDepotPokemon(pokes.filter(poke => !poke.team), depotPokeFilters);
                content.append(
                    makeColumn('Equipo', team, 'store', 'No hay ningún Pokémon en el equipo.', true),
                    makeColumn('Caja', box, 'withdraw', 'No hay ningún Pokémon en la caja.', true)
                );
            } else if (activeTab === 'family-items') {
                renderFamilyHeader();
                const inventoryById = new Map((depotData?.inventory || []).map(item => [String(item.id), item]));
                const bag = inventory.filter(item => Number(item.quantity) > 0).map(item => ({
                    ...item,
                    id: item.itemId,
                    name: inventoryById.get(String(item.itemId))?.name || globalItemApiData.get(String(item.itemId))?.name || `Item #${item.itemId}`,
                    icon: inventoryById.get(String(item.itemId))?.icon || globalItemApiData.get(String(item.itemId))?.icon || ''
                }));
                content.append(
                    makeFamilyColumn('Tu mochila', bag, 'deposit', 'item'),
                    makeFamilyColumn('Depósito familiar', familyData?.depot?.items || [], 'withdraw', 'item')
                );
            } else if (activeTab === 'family-pokemon') {
                renderFamilyHeader();
                content.appendChild(makeDepotPokemonFilters(familyPokeFilters));
                const owned = filterDepotPokemon(pokes.filter(poke => !String(poke.id).startsWith('team-')), familyPokeFilters);
                const stored = filterDepotPokemon(familyData?.depot?.pokes || [], familyPokeFilters);
                content.append(
                    makeFamilyColumn('Tus Pokémon · equipo y caja', owned, 'deposit', 'pokemon'),
                    makeFamilyColumn('Depósito familiar', stored, 'withdraw', 'pokemon')
                );
            }
        };

        const bindTab = tab => {
            tab.addEventListener('click', () => {
                activeTab = tab.dataset.tab;
                backdrop.querySelectorAll('.depot-tab').forEach(button => button.classList.toggle('active', button === tab));
                render();
            });
        };

        const configureFamilyTabs = () => {
            familyTabs.innerHTML = '';
            if (familyData?.family) {
                familyTabs.innerHTML = `
                    <button class="mk-bulk-btn depot-tab" data-tab="family-items" type="button">Familia: objetos</button>
                    <button class="mk-bulk-btn depot-tab" data-tab="family-pokemon" type="button">Familia: Pokémon</button>`;
                familyTabs.querySelectorAll('.depot-tab').forEach(bindTab);
                return;
            }
            const info = document.createElement('button');
            info.type = 'button';
            info.className = 'mk-bulk-btn';
            const familyConfirmed = familyData?.type === 'family';
            info.textContent = familyConfirmed ? 'Sin familia' : 'Familia no disponible';
            info.title = familyConfirmed
                ? 'Las pestañas familiares solo aparecen para los miembros de una familia.'
                : 'No se ha podido consultar la familia mediante WebSocket.';
            info.addEventListener('click', async () => {
                if (familyConfirmed) {
                    await showScriptNotice(
                        'Las pestañas familiares no aparecen porque esta cuenta no pertenece a ninguna familia.',
                        { title: 'Depósito familiar' }
                    );
                    return;
                }
                await showScriptNotice(
                    'La conexión del juego no ha respondido a la consulta familiar. Cierra y vuelve a abrir el depósito para intentarlo de nuevo.',
                    { title: 'Familia no disponible', isError: true }
                );
            });
            familyTabs.appendChild(info);
        };

        backdrop.querySelectorAll('.depot-tab').forEach(bindTab);

        try {
            const socketReady = await waitForGameSocket(5000);
            [depotData, pokes, inventory, familyData] = await Promise.all([
                gameApiRequest('/api/game/depot'),
                socketReady ? requestFreshGameEvent('pokes', 'pokes-get', { timeoutMs: 3500, attempts: 2 }) : Promise.resolve([]),
                socketReady ? requestFreshGameEvent('inventory', 'inv-get', { timeoutMs: 3000, attempts: 2 }) : Promise.resolve([]),
                socketReady ? requestFreshGameEvent('family', 'family-get', { timeoutMs: 3500, attempts: 2 }) : Promise.resolve(null)
            ]);
            configureFamilyTabs();
            status.remove();
            if (!socketReady) {
                showWindowMessage(backdrop.querySelector('.sell-confirm-modal'), 'WebSocket no disponible: no se han podido cargar los Pokémon ni la familia.', true);
            }
            render();
        } catch (error) {
            status.textContent = 'No se ha podido abrir el depósito.';
            status.style.color = '#f56565';
            console.error('Error al abrir el depósito portátil:', error);
        }
    }


    const SELLABLE_EVOLUTION_STONES = new Set([
        'Ancient Stone','Cocoon Stone','Crystal Stone','Darkness Stone','Earth Stone',
        'Enigma Stone','Feather Stone','Fire Stone','Heart Stone','Ice Stone',
        'Leaf Stone','Metal Stone','Punch Stone','Rock Stone','Thunder Stone',
        'Venom Stone','Water Stone','Moon Stone','Sun Stone','Rough Gemstone'
    ].map(name => name.toLocaleLowerCase('en-US')));

    function isListedEvolutionStone(name) {
        return SELLABLE_EVOLUTION_STONES.has(String(name || '').trim().toLocaleLowerCase('en-US'));
    }

    async function loadSellableStones() {
        if (itemDataLoadPromise) await itemDataLoadPromise;

        const [freshInventory, payload] = await Promise.all([
            requestFreshGameEvent('inventory', 'inv-get', { timeoutMs: 4000, attempts: 3 }),
            fetch(ITEMS_JSON_URL).then(response => {
                if (!response.ok) throw new Error(`items.json devolvió HTTP ${response.status}`);
                return response.json();
            })
        ]);

        const collectorInventory = window.__poke?.ws?.inventory?.items;
        const inventory = freshInventory.length
            ? freshInventory
            : Array.isArray(latestInventory) && latestInventory.length
                ? latestInventory
                : Array.isArray(collectorInventory)
                    ? collectorInventory
                    : [];

        const items = Array.isArray(payload) ? payload : (payload.items || []);
        const catalog = new Map(items.map(item => [String(item.id), item]));

        return inventory.map(entry => {
            const item = catalog.get(String(entry.itemId)) || {};
            const name = String(item.name || '').trim();
            return {
                itemId: String(entry.itemId),
                name,
                qty: Math.max(0, Number(entry.quantity) || 0),
                npcPrice: Math.max(0, Number(
                    item.npcPrice ?? item.sellValue ?? item.priceNpc ?? item.value ?? 0
                ) || 0)
            };
        }).filter(item =>
            item.qty > 0
            && item.npcPrice > 0
            && isListedEvolutionStone(item.name)
        );
    }

    function normalizeFlintItems(items) {
        return items.map(item => {
            const itemId = Number(item.itemId);
            const qty = Math.max(1, Math.floor(Number(item.qty) || 1));

            if (!Number.isFinite(itemId)) {
                throw new Error(`ID de piedra no válido: ${item.itemId}`);
            }

            return { itemId, qty };
        });
    }

    /*
     * Contrato real capturado desde la interfaz nativa de Flint:
     *
     * POST /api/game/flint/sell
     * {
     *   "itemId": 2,
     *   "qty": 1
     * }
     *
     * Flint acepta una clase de piedra por petición. Cuando se seleccionan
     * varias clases, se envían secuencialmente con el mismo formato.
     */
    async function sellStonesThroughFlint(selectedItems, onProgress = null) {
        const items = normalizeFlintItems(selectedItems);
        const soldItems = [];
        const failures = [];
        const responses = [];

        let goldGained = 0;
        let finalGold = null;
        let totalSold = 0;

        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];

            if (typeof onProgress === 'function') {
                onProgress({
                    current: index + 1,
                    total: items.length,
                    item
                });
            }

            try {
                const result = await gameApiRequest('/api/game/flint/sell', {
                    method: 'POST',
                    body: JSON.stringify({
                        itemId: item.itemId,
                        qty: item.qty
                    })
                });

                if (result?.ok === false) {
                    throw new Error(result?.message || 'Flint rechazó la venta.');
                }

                const soldQty = Math.max(
                    0,
                    Math.floor(Number(result?.sold ?? item.qty) || 0)
                );

                if (!soldQty) {
                    throw new Error(result?.message || 'Flint no confirmó ninguna piedra vendida.');
                }

                soldItems.push({
                    itemId: item.itemId,
                    qty: soldQty,
                    name: String(result?.item || '')
                });

                totalSold += soldQty;
                goldGained += Math.max(0, Number(result?.goldGained) || 0);

                if (Number.isFinite(Number(result?.gold))) {
                    finalGold = Number(result.gold);
                }

                responses.push(result);
            } catch (error) {
                failures.push({
                    itemId: item.itemId,
                    qty: item.qty,
                    message: String(error?.message || error)
                });
            }
        }

        if (!soldItems.length) {
            throw new Error(
                failures[0]?.message || 'Flint no ha aceptado ninguna piedra.'
            );
        }

        return {
            ok: failures.length === 0,
            sold: totalSold,
            soldItems,
            failures,
            goldGained,
            gold: finalGold,
            responses
        };
    }

    async function showHuntStoneSellWindow() {
        document.querySelector('.hunt-stone-sell-backdrop')?.remove();
        const backdrop = document.createElement('div');
        backdrop.className = 'sell-confirm-backdrop hunt-stone-sell-backdrop';
        backdrop.innerHTML = `
            <div class="sell-confirm-modal" style="width:480px;max-width:94vw;">
                <div class="sell-confirm-title"><span>🪨 Vender piedras</span><button class="hunt-stone-close" type="button" style="margin-left:auto;background:none;border:0;color:#a0aec0;font-size:20px;cursor:pointer;">×</button></div>
                <div class="sell-confirm-body">
                    <div class="hunt-stone-status" style="color:#a0aec0;text-align:center;padding:12px;">Cargando piedras...</div>
                    <div class="hunt-sell-list"></div>
                    <div class="sell-confirm-footer" style="display:none;">
                        <button class="sell-confirm-btn hunt-stone-select-all" type="button">Seleccionar todo</button>
                        <button class="sell-confirm-btn yes hunt-stone-submit" type="button">Vender</button>
                        <button class="sell-confirm-btn no hunt-stone-cancel" type="button">Cancelar</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(backdrop);
        const close=()=>backdrop.remove();
        backdrop.querySelector('.hunt-stone-close').addEventListener('click',close);
        backdrop.querySelector('.hunt-stone-cancel').addEventListener('click',close);
        backdrop.addEventListener('click',event=>{if(event.target===backdrop)close();});
        const status=backdrop.querySelector('.hunt-stone-status');
        const list=backdrop.querySelector('.hunt-sell-list');
        const footer=backdrop.querySelector('.sell-confirm-footer');
        const selectAll=backdrop.querySelector('.hunt-stone-select-all');
        const submit=backdrop.querySelector('.hunt-stone-submit');
        try {
            const [stones,characterData]=await Promise.all([
                loadSellableStones(),
                gameApiRequest('/api/characters/me').catch(()=>({}))
            ]);
            const shopData={gold:Number(characterData?.character?.gold??characterData?.gold??0)};
            if(!stones.length){status.textContent='No se ha encontrado ninguna piedra vendible en el inventario.';return;}
            footer.style.display='flex';
            stones.sort((a,b)=>a.name.localeCompare(b.name,'es-ES')).forEach(item=>{
                const row=document.createElement('label');
                row.className='hunt-sell-row';
                row.style.gridTemplateColumns='auto minmax(0,1fr) 90px';
                const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.itemId=item.itemId;checkbox.dataset.itemName=item.name;checkbox.dataset.unitPrice=String(item.npcPrice);
                const name=document.createElement('span');name.textContent=`${item.name} (${item.qty.toLocaleString('es-ES')}) · 💲${item.npcPrice.toLocaleString('es-ES')}`;
                const quantity=document.createElement('input');quantity.type='number';quantity.min='1';quantity.max=String(item.qty);quantity.value=String(item.qty);
                row.append(checkbox,name,quantity);list.appendChild(row);
            });
            const updateSummary=()=>{
                let total=0;
                list.querySelectorAll('.hunt-sell-row').forEach(row=>{
                    const checkbox=row.querySelector('input[type="checkbox"]'),quantity=row.querySelector('input[type="number"]');
                    if(checkbox.checked)total+=(Math.min(Number(quantity.value)||0,Number(quantity.max)||0))*(Number(checkbox.dataset.unitPrice)||0);
                });
                const eligible=Array.from(list.querySelectorAll('input[type="checkbox"]'));
                selectAll.textContent=eligible.length&&eligible.every(input=>input.checked)?'Deseleccionar todo':'Seleccionar todo';
                status.textContent=`Saldo actual: 💲${Number(shopData.gold||0).toLocaleString('es-ES')} · Venta seleccionada: 💲${total.toLocaleString('es-ES')}`;
            };
            selectAll.addEventListener('click',()=>{const inputs=Array.from(list.querySelectorAll('input[type="checkbox"]'));const check=inputs.some(input=>!input.checked);inputs.forEach(input=>{input.checked=check;});updateSummary();});
            list.addEventListener('input',updateSummary);list.addEventListener('change',updateSummary);updateSummary();
            submit.addEventListener('click',async()=>{
                const selected=Array.from(list.querySelectorAll('.hunt-sell-row')).flatMap(row=>{
                    const checkbox=row.querySelector('input[type="checkbox"]'),quantity=row.querySelector('input[type="number"]');
                    if(!checkbox.checked)return[];
                    const qty=Math.min(Math.floor(Number(quantity.value)||0),Math.floor(Number(quantity.max)||0));
                    const unitPrice=Math.max(0,Number(checkbox.dataset.unitPrice)||0);
                    return qty>0?[{
                        itemId:checkbox.dataset.itemId,
                        name:checkbox.dataset.itemName,
                        qty,
                        unitPrice,
                        expectedGold:qty*unitPrice
                    }]:[];
                });
                if(!selected.length){showWindowMessage(backdrop.querySelector('.sell-confirm-modal'),'Selecciona al menos una piedra.',true);return;}

                const selectedQty=selected.reduce((sum,item)=>sum+item.qty,0);
                const expectedGold=selected.reduce((sum,item)=>sum+item.expectedGold,0);
                const expectedBalance=Number(shopData.gold||0)+expectedGold;

                const confirmed=await showScriptConfirm(
                    `¿Vender ${selectedQty.toLocaleString('es-ES')} piedras por 💲${expectedGold.toLocaleString('es-ES')}?

Saldo actual: 💲${Number(shopData.gold||0).toLocaleString('es-ES')}
Saldo estimado después de la venta: 💲${expectedBalance.toLocaleString('es-ES')}`,
                    {
                        title:'Confirmar venta de piedras',
                        confirmLabel:`Vender por 💲${expectedGold.toLocaleString('es-ES')}`
                    }
                );
                if(!confirmed)return;
                submit.disabled=true;
                const originalSubmitText=submit.textContent;
                try{
                    const result=await sellStonesThroughFlint(
                        selected.map(({itemId,qty})=>({itemId,qty})),
                        progress=>{
                            submit.textContent=`Vendiendo ${progress.current}/${progress.total}…`;
                        }
                    );

                    latestInventory=null;

                    result.soldItems.forEach(sold=>{
                        const checkbox=Array.from(list.querySelectorAll('input[type="checkbox"]'))
                            .find(input=>String(input.dataset.itemId)===String(sold.itemId));
                        const row=checkbox?.closest('.hunt-sell-row');
                        const quantity=row?.querySelector('input[type="number"]');
                        if(!row||!quantity)return;

                        const remaining=Math.max(0,Number(quantity.max||0)-sold.qty);
                        if(!remaining){
                            row.remove();
                        }else{
                            quantity.max=String(remaining);
                            quantity.value=String(remaining);
                            checkbox.checked=false;
                        }
                    });

                    if(Number.isFinite(Number(result.gold))){
                        shopData.gold=Number(result.gold);
                    }
                    updateSummary();

                    const gained=Number(result.goldGained||0);
                    const successText=gained>0
                        ? `Venta a Flint completada: ${result.sold.toLocaleString('es-ES')} piedras · +💲${gained.toLocaleString('es-ES')}`
                        : `Venta a Flint completada: ${result.sold.toLocaleString('es-ES')} piedras.`;

                    if(result.failures.length){
                        const failedText=result.failures
                            .map(failure=>`ID ${failure.itemId}: ${failure.message}`)
                            .join(' · ');
                        showWindowMessage(
                            backdrop.querySelector('.sell-confirm-modal'),
                            `${successText} No se pudieron vender algunas selecciones: ${failedText}`,
                            true
                        );
                    }else{
                        showWindowMessage(
                            backdrop.querySelector('.sell-confirm-modal'),
                            successText
                        );
                    }

                    if(!list.querySelector('.hunt-sell-row'))footer.style.display='none';
                }catch(error){
                    showWindowMessage(
                        backdrop.querySelector('.sell-confirm-modal'),
                        `No se ha podido vender: ${error.message}`,
                        true
                    );
                }finally{
                    submit.disabled=false;
                    submit.textContent=originalSubmitText;
                }
            });
        } catch(error){console.error('Error al cargar las piedras:',error);status.textContent=`No se han podido cargar las piedras: ${error.message}`;status.style.color='#f56565';}
    }

    async function showHuntSellWindow() {
        document.querySelector('.hunt-sell-backdrop')?.remove();

        const backdrop = document.createElement('div');
        backdrop.className = 'sell-confirm-backdrop hunt-sell-backdrop';
        backdrop.innerHTML = `
            <div class="sell-confirm-modal" style="width:460px; max-width:94vw;">
                <div class="sell-confirm-title">
                    <span>🛒 Vender objetos</span>
                    <button class="hunt-pokemon-open mk-bulk-btn" type="button" style="margin-left:auto;">🐾 Pokémon</button>
                    <button class="hunt-sell-close" type="button" style="margin-left:auto;background:none;border:0;color:#a0aec0;font-size:20px;cursor:pointer;">×</button>
                </div>
                <div class="sell-confirm-body">
                    <div class="hunt-sell-status" style="color:#a0aec0;text-align:center;padding:16px;">Cargando inventario...</div>
                    <div class="hunt-sell-list"></div>
                    <div class="sell-confirm-footer" style="display:none;">
                        <button class="sell-confirm-btn hunt-sell-select-all" type="button">Seleccionar todo</button>
                        <button class="sell-confirm-btn yes hunt-sell-submit" type="button">Vender</button>
                        <button class="sell-confirm-btn no hunt-sell-cancel" type="button">Cancelar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        const close = () => backdrop.remove();
        backdrop.querySelector('.hunt-sell-close').addEventListener('click', close);
        backdrop.querySelector('.hunt-sell-cancel').addEventListener('click', close);
        backdrop.querySelector('.hunt-pokemon-open').addEventListener('click', () => {
            close();
            showHuntPokemonSellWindow();
        });

        const status = backdrop.querySelector('.hunt-sell-status');
        const list = backdrop.querySelector('.hunt-sell-list');
        const footer = backdrop.querySelector('.sell-confirm-footer');
        const submit = backdrop.querySelector('.hunt-sell-submit');
        const selectAll = backdrop.querySelector('.hunt-sell-select-all');

        try {
            const [inventory, shopData] = await Promise.all([
                gameSocket
                    ? requestGameEvent('inventory', 'inv-get', latestInventory).then(async entries => {
                        if (!entries.length) return readSellableInventoryFromDOM();
                        const payload = await fetch(ITEMS_JSON_URL).then(response => response.json());
                        const catalogItems = Array.isArray(payload) ? payload : (payload.items || []);
                        const catalog = new Map(catalogItems.map(item => [String(item.id), item]));
                        return entries.map(entry => {
                            const catalogItem = catalog.get(String(entry.itemId));
                            return {
                                itemId: String(entry.itemId),
                                name: catalogItem?.name || `Item ${entry.itemId}`,
                                qty: Number(entry.quantity) || 0,
                                category: String(catalogItem?.category || '').toLowerCase(),
                                npcPrice: Number(catalogItem?.npcPrice) || 0
                            };
                        }).filter(item => item.qty > 0 && item.npcPrice > 0)
                            .filter(item => !['heal', 'revive', 'stone'].includes(item.category));
                    })
                    : readSellableInventoryFromDOM(),
                gameApiRequest('/api/game/shop')
            ]);
            if (inventory.length === 0) {
                status.textContent = 'No se ha encontrado ningún objeto que pueda venderse en el inventario.';
                return;
            }

            status.style.display = 'none';
            footer.style.display = 'flex';
            inventory.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
                const isProtected = isSellLocked(item.name);
                const row = document.createElement('label');
                row.className = `hunt-sell-row${isProtected ? ' protected' : ''}`;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.disabled = isProtected;
                checkbox.dataset.itemId = item.itemId;
                checkbox.dataset.itemName = item.name;
                checkbox.dataset.unitPrice = String(item.npcPrice);

                const name = document.createElement('span');
                name.textContent = `${item.name} (${item.qty.toLocaleString('es-ES')}) · 💲${item.npcPrice.toLocaleString('es-ES')}${isProtected ? ' 🔒' : ''}`;

                const quantity = document.createElement('input');
                quantity.type = 'number';
                quantity.min = '1';
                quantity.max = String(item.qty);
                quantity.value = String(item.qty);
                quantity.disabled = isProtected;

                const lockButton = document.createElement('button');
                lockButton.type = 'button';
                lockButton.className = `hunt-item-lock${isProtected ? ' on' : ''}`;

                const applyLockState = locked => {
                    row.classList.toggle('protected', locked);
                    checkbox.disabled = locked;
                    quantity.disabled = locked;
                    if (locked) checkbox.checked = false;
                    lockButton.classList.toggle('on', locked);
                    lockButton.textContent = locked ? '🔒' : '🔓';
                    lockButton.title = locked
                        ? 'Desbloquear — permitir la venta'
                        : 'Bloquear — proteger de la venta';
                    lockButton.setAttribute('aria-label', locked ? 'Desbloquear objeto' : 'Bloquear objeto');
                    name.textContent = `${item.name} (${item.qty.toLocaleString('es-ES')}) · 💲${item.npcPrice.toLocaleString('es-ES')}${locked ? ' 🔒' : ''}`;
                };

                lockButton.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const locked = !isSellLocked(item.name);
                    if (locked) addSellLock(item.name);
                    else removeSellLock(item.name);
                    applyLockState(locked);
                    updateSaleSummary();
                });

                applyLockState(isProtected);
                row.append(checkbox, name, quantity, lockButton);
                list.appendChild(row);
            });

            const updateSaleSummary = () => {
                let total = 0;
                list.querySelectorAll('.hunt-sell-row').forEach(row => {
                    const checkbox = row.querySelector('input[type="checkbox"]');
                    const quantity = row.querySelector('input[type="number"]');
                    if (checkbox.checked) {
                        total += (parseInt(quantity.value, 10) || 0) * (Number(checkbox.dataset.unitPrice) || 0);
                    }
                });
                status.textContent = `Saldo actual: 💲${Number(shopData.gold || 0).toLocaleString('es-ES')} · Venta seleccionada: 💲${total.toLocaleString('es-ES')}`;
                status.style.display = '';
                const eligible = Array.from(list.querySelectorAll('input[type="checkbox"]:not(:disabled)'));
                selectAll.textContent = eligible.length > 0 && eligible.every(checkbox => checkbox.checked)
                    ? 'Deseleccionar todo'
                    : 'Seleccionar todo';
            };
            selectAll.addEventListener('click', () => {
                const eligible = Array.from(list.querySelectorAll('input[type="checkbox"]:not(:disabled)'));
                const shouldSelect = eligible.some(checkbox => !checkbox.checked);
                eligible.forEach(checkbox => { checkbox.checked = shouldSelect; });
                updateSaleSummary();
            });
            list.addEventListener('input', updateSaleSummary);
            list.addEventListener('change', updateSaleSummary);
            updateSaleSummary();

            submit.addEventListener('click', () => {
                const selectedRows = Array.from(list.querySelectorAll('.hunt-sell-row')).flatMap(row => {
                    const checkbox = row.querySelector('input[type="checkbox"]');
                    const quantity = row.querySelector('input[type="number"]');
                    if (!checkbox.checked) return [];
                    const qty = Math.min(parseInt(quantity.value, 10) || 0, parseInt(quantity.max, 10) || 0);
                    return qty > 0 ? [{
                        itemId: checkbox.dataset.itemId,
                        name: checkbox.dataset.itemName,
                        qty
                    }] : [];
                });

                if (selectedRows.length === 0) {
                    status.textContent = 'Selecciona al menos un objeto.';
                    status.style.display = '';
                    return;
                }

                const executeSale = async () => {
                    submit.disabled = true;
                    submit.textContent = 'Vendiendo...';
                    try {
                        const result = await sellItemsThroughShop(selectedRows.map(({ itemId, qty }) => ({ itemId, qty })));
                        latestInventory = null;
                        shopData.gold = Number(result.gold ?? shopData.gold ?? 0);
                        selectedRows.forEach(soldItem => {
                            const checkbox = Array.from(list.querySelectorAll('input[type="checkbox"]'))
                                .find(input => String(input.dataset.itemId) === String(soldItem.itemId));
                            const row = checkbox?.closest('.hunt-sell-row');
                            const quantity = row?.querySelector('input[type="number"]');
                            if (!row || !checkbox || !quantity) return;
                            const remaining = Math.max(0, Number(quantity.max || 0) - soldItem.qty);
                            if (remaining === 0) {
                                row.remove();
                                return;
                            }
                            quantity.max = String(remaining);
                            quantity.value = String(remaining);
                            checkbox.checked = false;
                            row.querySelector('span').textContent = `${checkbox.dataset.itemName} (${remaining.toLocaleString('es-ES')}) · 💲${Number(checkbox.dataset.unitPrice || 0).toLocaleString('es-ES')}`;
                        });
                        updateSaleSummary();
                        showWindowMessage(backdrop.querySelector('.sell-confirm-modal'), `Venta completada: +💲${Number(result.goldGained || 0).toLocaleString('es-ES')}`);
                        submit.disabled = false;
                        submit.textContent = 'Vender';
                    } catch (error) {
                        console.error('Error al vender objetos en Mark:', error);
                        status.textContent = 'No se ha podido completar la venta. Inténtalo de nuevo.';
                        status.style.display = '';
                        submit.disabled = false;
                        submit.textContent = 'Vender';
                    }
                };

                const confirmationNames = new Set(getSellConfirmItems().map(name => name.toLowerCase()));
                const selectedToConfirm = selectedRows
                    .filter(item => confirmationNames.has(item.name.toLowerCase()))
                    .map(item => item.name);
                if (selectedToConfirm.length > 0) {
                    showSellConfirm(selectedToConfirm, confirmed => {
                        if (confirmed) executeSale();
                    });
                } else {
                    executeSale();
                }
            });
        } catch (error) {
            console.error('Error al cargar el inventario de Mark:', error);
            status.textContent = 'No se han podido cargar los objetos para vender.';
        }
    }

    async function showHuntPokemonSellWindow() {
        document.querySelector('.hunt-sell-backdrop')?.remove();
        const backdrop = document.createElement('div');
        backdrop.className = 'sell-confirm-backdrop hunt-sell-backdrop';
        backdrop.innerHTML = `
            <div class="sell-confirm-modal" style="width:500px; max-width:94vw;">
                <div class="sell-confirm-title">
                    <span>🐾 Vender Pokémon</span>
                    <button class="hunt-items-open mk-bulk-btn" type="button" style="margin-left:auto;">🎒 Objetos</button>
                    <button class="hunt-sell-close" type="button" style="margin-left:auto;background:none;border:0;color:#a0aec0;font-size:20px;cursor:pointer;">×</button>
                </div>
                <div class="sell-confirm-body">
                    <div class="hunt-pokemon-filters" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
                        <input class="hunt-pokemon-search" type="search" placeholder="Buscar Pokémon..." style="min-width:140px;flex:1;background:#0c161f;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px 8px;">
                        <select class="hunt-pokemon-shiny-filter" style="background:#0c161f;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px;">
                            <option value="">Todos</option>
                            <option value="shiny">✨ Shiny</option>
                            <option value="normal">Normais</option>
                        </select>
                        <input class="hunt-pokemon-iv-min-filter" type="number" min="0" max="192" placeholder="IV mín." style="width:72px;background:#0c161f;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px;">
                        <input class="hunt-pokemon-iv-max-filter" type="number" min="0" max="192" placeholder="IV máx." style="width:72px;background:#0c161f;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px;">
                        <input class="hunt-pokemon-quality-min-filter" type="number" min="0" step="0.01" placeholder="Calidad mín." style="width:82px;background:#0c161f;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px;">
                        <input class="hunt-pokemon-quality-max-filter" type="number" min="0" step="0.01" placeholder="Calidad máx." style="width:82px;background:#0c161f;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px;">
                    </div>
                    <div class="hunt-sell-status" style="color:#a0aec0;text-align:center;padding:8px;">Cargando Pokémon...</div>
                    <div class="hunt-sell-list"></div>
                    <div class="sell-confirm-footer" style="display:none;">
                        <button class="sell-confirm-btn hunt-pokemon-select-all" type="button">Seleccionar todo</button>
                        <button class="sell-confirm-btn yes hunt-pokemon-submit" type="button">Vender seleccionados</button>
                        <button class="sell-confirm-btn no hunt-sell-cancel" type="button">Cancelar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        const close = () => backdrop.remove();
        backdrop.querySelector('.hunt-sell-close').addEventListener('click', close);
        backdrop.querySelector('.hunt-sell-cancel').addEventListener('click', close);
        backdrop.querySelector('.hunt-items-open').addEventListener('click', () => {
            close();
            showHuntSellWindow();
        });

        const status = backdrop.querySelector('.hunt-sell-status');
        const list = backdrop.querySelector('.hunt-sell-list');
        const footer = backdrop.querySelector('.sell-confirm-footer');
        const submit = backdrop.querySelector('.hunt-pokemon-submit');
        const pokeSearch = backdrop.querySelector('.hunt-pokemon-search');
        const shinyFilter = backdrop.querySelector('.hunt-pokemon-shiny-filter');
        const ivMinFilter = backdrop.querySelector('.hunt-pokemon-iv-min-filter');
        const ivMaxFilter = backdrop.querySelector('.hunt-pokemon-iv-max-filter');
        const qualityMinFilter = backdrop.querySelector('.hunt-pokemon-quality-min-filter');
        const qualityMaxFilter = backdrop.querySelector('.hunt-pokemon-quality-max-filter');
        const selectAll = backdrop.querySelector('.hunt-pokemon-select-all');

        try {
            const [pokemon, shopData] = await Promise.all([
                (async () => {
                    const contextPokemon = await requestPokemonTeamFromGameContext(2200);
                    if (contextPokemon.length) return contextPokemon;
                    return requestGameEvent('pokes', 'pokes-get', latestPokemon);
                })(),
                gameApiRequest('/api/game/shop')
            ]);
            const sellable = pokemon.filter(poke => !poke.team && !poke.starter && Number(poke.sellValue) > 0);
            if (!sellable.length) {
                status.textContent = 'No se ha encontrado ningún Pokémon que pueda venderse.';
                return;
            }

            footer.style.display = 'flex';
            sellable.forEach(poke => {
                const nativeProtected = Boolean(poke.locked || poke.shiny || poke.market || poke.listed);
                const scriptLocked = isPokemonSellLocked(poke.id);
                const protectedPoke = nativeProtected || scriptLocked;
                const row = document.createElement('label');
                row.className = `hunt-sell-row${protectedPoke ? ' protected' : ''}`;
                row.style.gridTemplateColumns = 'auto 1fr auto auto';
                row.dataset.searchName = String(poke.name || '').toLocaleLowerCase();
                row.dataset.shiny = poke.shiny ? 'true' : 'false';
                row.dataset.iv = String(Number(poke.ivTotal) || 0);
                row.dataset.quality = String(Number(poke.quality) || 0);
                row.dataset.pokeId = String(poke.id);
                row.dataset.nativeProtected = nativeProtected ? 'true' : 'false';
                row.dataset.scriptLocked = scriptLocked ? 'true' : 'false';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.disabled = protectedPoke;
                checkbox.dataset.pokeId = String(poke.id);
                checkbox.dataset.value = String(poke.sellValue || 0);

                const name = document.createElement('span');
                const quality = formatPokemonQualityWithPotential(poke.quality, poke.ivTotal, poke.shiny);
                const renderPokemonName = lockedByScript => {
                    const flags = [
                        poke.shiny ? '✨' : '',
                        (poke.locked || lockedByScript) ? '🔒' : '',
                        (poke.market || poke.listed) ? '🏷️' : ''
                    ].filter(Boolean).join(' ');
                    name.textContent = `${poke.name || `Pokémon ${poke.speciesId}`} · IV ${poke.ivTotal ?? '—'} · ${quality}${flags ? ` ${flags}` : ''}`;
                };

                const value = document.createElement('strong');
                value.textContent = `💲${Number(poke.sellValue).toLocaleString('es-ES')}`;

                const lockButton = document.createElement('button');
                lockButton.type = 'button';
                lockButton.className = `hunt-item-lock${scriptLocked || nativeProtected ? ' on' : ''}`;

                const applyPokemonLockState = lockedByScript => {
                    const locked = nativeProtected || lockedByScript;
                    row.dataset.scriptLocked = lockedByScript ? 'true' : 'false';
                    row.classList.toggle('protected', locked);
                    checkbox.disabled = locked;
                    if (locked) checkbox.checked = false;
                    lockButton.classList.toggle('on', lockedByScript || nativeProtected);
                    lockButton.textContent = locked ? '🔒' : '🔓';
                    lockButton.disabled = nativeProtected;
                    lockButton.style.opacity = nativeProtected ? '0.6' : '';
                    lockButton.style.cursor = nativeProtected ? 'not-allowed' : '';
                    lockButton.title = nativeProtected
                        ? 'Protegido por el juego: no puede venderse desde aquí'
                        : lockedByScript
                            ? 'Desbloquear Pokémon — permitir seleccionarlo para venta'
                            : 'Bloquear Pokémon — excluirlo de Seleccionar todo y de la venta';
                    lockButton.setAttribute('aria-label', nativeProtected
                        ? 'Pokémon protegido por el juego'
                        : lockedByScript ? 'Desbloquear Pokémon' : 'Bloquear Pokémon');
                    renderPokemonName(lockedByScript);
                };

                lockButton.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (nativeProtected) return;
                    const locked = !isPokemonSellLocked(poke.id);
                    if (locked) addPokemonSellLock(poke.id);
                    else removePokemonSellLock(poke.id);
                    applyPokemonLockState(locked);
                    updateSummary();
                });

                applyPokemonLockState(scriptLocked);
                row.append(checkbox, name, value, lockButton);
                list.appendChild(row);
            });

            const updateSummary = () => {
                const total = Array.from(list.querySelectorAll('input[type="checkbox"]:checked'))
                    .reduce((sum, checkbox) => sum + Number(checkbox.dataset.value || 0), 0);
                const visibleRows = Array.from(list.querySelectorAll('.hunt-sell-row:not([hidden])'));
                const selectable = visibleRows
                    .map(row => row.querySelector('input[type="checkbox"]'))
                    .filter(checkbox => checkbox && !checkbox.disabled);
                const allVisibleSelected = selectable.length > 0 && selectable.every(checkbox => checkbox.checked);
                selectAll.textContent = allVisibleSelected ? 'Deseleccionar visibles' : 'Seleccionar todo';
                status.textContent = `${visibleRows.length.toLocaleString('es-ES')} Pokémon mostrados · Saldo: 💲${Number(shopData.gold || 0).toLocaleString('es-ES')} · Seleccionado: 💲${total.toLocaleString('es-ES')}`;
            };
            const applyPokemonFilters = () => {
                const query = pokeSearch.value.trim().toLocaleLowerCase();
                const minIv = ivMinFilter.value === '' ? null : Number(ivMinFilter.value);
                const maxIv = ivMaxFilter.value === '' ? null : Number(ivMaxFilter.value);
                const minQuality = qualityMinFilter.value === '' ? null : Number(qualityMinFilter.value);
                const maxQuality = qualityMaxFilter.value === '' ? null : Number(qualityMaxFilter.value);
                list.querySelectorAll('.hunt-sell-row').forEach(row => {
                    const shinyMatches = !shinyFilter.value
                        || (shinyFilter.value === 'shiny' && row.dataset.shiny === 'true')
                        || (shinyFilter.value === 'normal' && row.dataset.shiny !== 'true');
                    const show = (!query || row.dataset.searchName.includes(query))
                        && shinyMatches
                        && (minIv === null || Number(row.dataset.iv) >= minIv)
                        && (maxIv === null || Number(row.dataset.iv) <= maxIv)
                        && (minQuality === null || Number(row.dataset.quality) >= minQuality)
                        && (maxQuality === null || Number(row.dataset.quality) <= maxQuality);
                    row.hidden = !show;
                    if (!show) row.querySelector('input[type="checkbox"]').checked = false;
                });
                updateSummary();
            };
            list.addEventListener('change', updateSummary);
            [pokeSearch, shinyFilter, ivMinFilter, ivMaxFilter, qualityMinFilter, qualityMaxFilter].forEach(control => {
                control.addEventListener('input', applyPokemonFilters);
            });
            selectAll.addEventListener('click', () => {
                const selectable = Array.from(list.querySelectorAll('.hunt-sell-row:not([hidden]) input[type="checkbox"]:not(:disabled)'));
                const shouldSelect = selectable.some(checkbox => !checkbox.checked);
                selectable.forEach(checkbox => { checkbox.checked = shouldSelect; });
                updateSummary();
            });
            updateSummary();
            applyPokemonFilters();

            submit.addEventListener('click', async () => {
                const pokeIds = Array.from(list.querySelectorAll('input[type="checkbox"]:checked'))
                    .map(checkbox => checkbox.dataset.pokeId);
                if (!pokeIds.length) return showScriptNotice('Selecciona al menos un Pokémon.');
                if (!await showScriptConfirm(`Vender ${pokeIds.length} Pokémon seleccionados?`, { title: 'Confirmar venta', confirmLabel: 'Vender' })) return;
                submit.disabled = true;
                try {
                    const result = await gameApiRequest('/api/game/pokemon/sell', {
                        method: 'POST',
                        body: JSON.stringify({ pokeIds })
                    });
                    latestPokemon = null;
                    shopData.gold = Number(result.gold ?? shopData.gold ?? 0);
                    list.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => checkbox.closest('.hunt-sell-row')?.remove());
                    applyPokemonFilters();
                    if (!list.querySelector('.hunt-sell-row')) footer.style.display = 'none';
                    showWindowMessage(backdrop.querySelector('.sell-confirm-modal'), `Venta completada: +💲${Number(result.goldGained || 0).toLocaleString('es-ES')}`);
                    submit.disabled = false;
                    sendGameMessage({ type: 'pokes-get' });
                } catch (error) {
                    showScriptNotice(`No se ha podido completar la venta: ${error.message}`, { title: 'Error en la venta', isError: true });
                    submit.disabled = false;
                }
            });
        } catch (error) {
            console.error('Error al cargar los Pokémon:', error);
            status.textContent = 'No se han podido cargar los Pokémon.';
        }
    }

    function getMarketListings(payload) {
        if (Array.isArray(payload)) return payload;
        for (const key of ['listings', 'items', 'results', 'offers', 'data']) {
            if (Array.isArray(payload?.[key])) return payload[key];
            if (payload?.[key] && payload[key] !== payload) {
                const nested = getMarketListings(payload[key]);
                if (nested.length) return nested;
            }
        }
        return [];
    }

    function normalizeMarketCurrency(value) {
        const currency = String(value || 'GOLD').trim().toUpperCase();
        return /DIAM|^DD$/.test(currency) ? 'DIAMONDS' : 'GOLD';
    }

    function showGlobalMarketWindow() {
        document.querySelector('.script-market-backdrop')?.remove();
        const backdrop = document.createElement('div');
        backdrop.className = 'script-market-backdrop';
        backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;';
        backdrop.innerHTML = `
            <div class="mk-window script-market-window" style="width:min(760px,95vw);height:min(620px,88vh);display:flex;flex-direction:column;background:#0c161f;border:1px solid #2b4c66;border-radius:10px;box-shadow:0 16px 50px rgba(0,0,0,.75);">
                <div class="mk-head" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #1a2d3a;">
                    <b style="flex:1;color:#e2e8f0;">🌐 ${tr('globalMarket')}</b>
                    <button class="mk-bulk-btn market-refresh" type="button">↻ ${tr('refresh')}</button>
                    <button class="cfg-x market-close" type="button" aria-label="Close">×</button>
                </div>
                <div class="script-market-tabs" style="display:flex;gap:6px;padding:10px 12px 0;">
                    <button class="mk-bulk-btn market-tab on" data-mode="buy" type="button">Comprar</button>
                    <button class="mk-bulk-btn market-tab" data-mode="sell" type="button">Vender</button>
                </div>
                <div class="market-buy-controls" style="display:flex;gap:6px;padding:10px 12px 0;flex-wrap:wrap;">
                    <select class="market-category" style="background:#071018;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px 9px;">
                        <option value="All">${tr('all')}</option>
                        <option value="Items" selected>${tr('items')}</option>
                        <option value="Stones">${tr('stones')}</option>
                        <option value="Poke Balls">${tr('pokeBalls')}</option>
                        <option value="Diamonds">${tr('diamonds')}</option>
                        <option value="Pokemon">${tr('pokemon')}</option>
                    </select>
                    <select class="market-sort" style="background:#071018;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px 9px;">
                        <option value="recent">${tr('recent')}</option>
                        <option value="price-asc">${tr('lowestPrice')}</option>
                        <option value="price-desc">${tr('highestPrice')}</option>
                        <option value="iv-desc">${tr('highestIv')}</option>
                        <option value="power-desc">${tr('highestPower')}</option>
                        <option value="level-desc">${tr('highestLevel')}</option>
                        <option value="quality-desc">${tr('highestQuality')}</option>
                    </select>
                    <input class="market-search" type="search" placeholder="${tr('search')}" style="flex:1;min-width:180px;background:#071018;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px 9px;">
                    <label style="display:flex;align-items:center;gap:5px;color:#a0aec0;font-size:12px;"><input class="market-show-gold" type="checkbox" checked> 💲 ${tr('gold')}</label>
                    <label style="display:flex;align-items:center;gap:5px;color:#a0aec0;font-size:12px;"><input class="market-show-diamonds" type="checkbox" checked> 💎 ${tr('diamonds')}</label>
                </div>
                <div class="market-pokemon-filters" style="display:none;gap:6px;padding:7px 12px 0;flex-wrap:wrap;">
                    <label style="display:flex;align-items:center;gap:5px;color:#a0aec0;font-size:12px;"><input class="market-shiny-only" type="checkbox"> ${tr('shinyOnly')}</label>
                    <input class="market-iv-min" type="number" min="0" max="192" placeholder="${tr('minIv')}" style="width:72px;background:#071018;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px;">
                    <input class="market-iv-max" type="number" min="0" max="192" placeholder="${tr('maxIv')}" style="width:72px;background:#071018;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px;">
                    <input class="market-level-min" type="number" min="1" placeholder="${tr('minLevel')}" style="width:82px;background:#071018;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px;">
                    <input class="market-level-max" type="number" min="1" placeholder="${tr('maxLevel')}" style="width:82px;background:#071018;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px;">
                    <input class="market-quality-min" type="number" min="0" step="0.01" placeholder="${tr('minQuality')}" style="width:88px;background:#071018;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px;">
                    <input class="market-quality-max" type="number" min="0" step="0.01" placeholder="${tr('maxQuality')}" style="width:88px;background:#071018;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px;">
                    <select class="market-type" style="min-width:130px;background:#071018;color:#e2e8f0;border:1px solid #273f52;border-radius:5px;padding:6px;"><option value="">${tr('allTypes')}</option></select>
                </div>
                <div class="market-sell-controls" style="display:none;padding:10px 12px 0;gap:7px;flex-wrap:wrap;">
                    <select class="market-sell-kind"><option value="item">Objetos</option><option value="pokemon">Pokémon</option></select>
                    <input class="market-sell-search" type="search" placeholder="Buscar para vender...">
                    <input class="market-sell-iv-min" type="number" min="0" max="192" placeholder="IV mín.">
                    <input class="market-sell-quality-min" type="number" min="0" step="0.01" placeholder="Calidad mín.">
                    <select class="market-sell-type"><option value="">Todos los tipos</option></select>
                    <select class="market-sell-currency"><option value="GOLD">Dólar</option><option value="DIAMONDS">Diamantes</option></select>
                    <input class="market-sell-qty" type="number" min="1" value="1" title="Cantidad">
                    <input class="market-sell-price" type="number" min="1" placeholder="Precio unitario">
                    <button class="mk-bulk-btn market-sell-submit" type="button" disabled>Anunciar</button>
                </div>
                <div class="market-status" style="padding:7px 12px;color:#a0aec0;font-size:12px;"></div>
                <div class="market-list" style="padding:0 12px 12px;overflow:auto;display:grid;gap:7px;"></div>
            </div>`;
        document.body.appendChild(backdrop);

        let activeCategory = 'Items';
        let marketMode = 'buy';
        let currentListings = [];
        let sellEntries = [];
        let selectedSellEntry = null;
        let renderLimit = 100;
        const list = backdrop.querySelector('.market-list');
        const status = backdrop.querySelector('.market-status');
        const search = backdrop.querySelector('.market-search');
        const categorySelect = backdrop.querySelector('.market-category');
        const sortSelect = backdrop.querySelector('.market-sort');
        const showGold = backdrop.querySelector('.market-show-gold');
        const showDiamonds = backdrop.querySelector('.market-show-diamonds');
        const pokemonFilters = backdrop.querySelector('.market-pokemon-filters');
        const shinyOnly = backdrop.querySelector('.market-shiny-only');
        const ivMin = backdrop.querySelector('.market-iv-min');
        const ivMax = backdrop.querySelector('.market-iv-max');
        const levelMin = backdrop.querySelector('.market-level-min');
        const levelMax = backdrop.querySelector('.market-level-max');
        const qualityMin = backdrop.querySelector('.market-quality-min');
        const qualityMax = backdrop.querySelector('.market-quality-max');
        const typeSelect = backdrop.querySelector('.market-type');
        const buyControls = backdrop.querySelector('.market-buy-controls');
        const sellControls = backdrop.querySelector('.market-sell-controls');
        const sellKind = backdrop.querySelector('.market-sell-kind');
        const sellSearch = backdrop.querySelector('.market-sell-search');
        const sellIvMin = backdrop.querySelector('.market-sell-iv-min');
        const sellQualityMin = backdrop.querySelector('.market-sell-quality-min');
        const sellType = backdrop.querySelector('.market-sell-type');
        const sellCurrency = backdrop.querySelector('.market-sell-currency');
        const sellQty = backdrop.querySelector('.market-sell-qty');
        const sellPrice = backdrop.querySelector('.market-sell-price');
        const sellSubmit = backdrop.querySelector('.market-sell-submit');
        const close = () => backdrop.remove();

        const renderSell = () => {
            const query = sellSearch.value.trim().toLocaleLowerCase();
            const isPokemon = sellKind.value === 'pokemon';
            sellIvMin.style.display = isPokemon ? '' : 'none';
            sellQualityMin.style.display = isPokemon ? '' : 'none';
            sellType.style.display = isPokemon ? '' : 'none';
            sellQty.style.display = isPokemon ? 'none' : '';
            const filtered = sellEntries.filter(entry => entry.kind === sellKind.value)
                .filter(entry => !query || entry.name.toLocaleLowerCase().includes(query))
                .filter(entry => !isPokemon || sellIvMin.value === '' || Number(entry.ivTotal) >= Number(sellIvMin.value))
                .filter(entry => !isPokemon || sellQualityMin.value === '' || Number(entry.quality) >= Number(sellQualityMin.value))
                .filter(entry => !isPokemon || !sellType.value || entry.type1 === sellType.value || entry.type2 === sellType.value)
                .sort((a, b) => isPokemon
                    ? Number(b.ivTotal) - Number(a.ivTotal) || Number(b.quality) - Number(a.quality) || Number(b.level) - Number(a.level)
                    : a.name.localeCompare(b.name, 'es-ES'));
            list.innerHTML = '';
            status.textContent = `${filtered.length} disponibles para anunciar`;
            filtered.forEach(entry => {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = `market-sell-row${selectedSellEntry === entry ? ' on' : ''}`;
                const details = isPokemon
                    ? `Nv ${entry.level ?? 1} · IV ${entry.ivTotal ?? 0}/192 · ${formatPokemonQualityWithPotential(entry.quality, entry.ivTotal)}${entry.shiny ? ' · ✨ Shiny' : ''}`
                    : `${Number(entry.quantity || 0).toLocaleString('es-ES')} en la mochila`;
                row.innerHTML = `${entry.icon ? `<img src="${escapeHTML(entry.icon)}" alt="">` : ''}<span><b>${escapeHTML(entry.name)}</b><small>${escapeHTML(details)}</small></span>`;
                row.addEventListener('click', () => {
                    selectedSellEntry = entry;
                    sellQty.max = String(entry.quantity || 1);
                    sellQty.value = String(Math.min(Number(sellQty.value) || 1, entry.quantity || 1));
                    sellSubmit.disabled = !(Number(sellPrice.value) >= 1);
                    renderSell();
                });
                list.appendChild(row);
            });
        };

        const loadSell = async () => {
            status.textContent = tr('loading');
            try {
                const [inventory, pokemon, itemPayload, ballPayload] = await Promise.all([
                    requestFreshGameEvent('inventory', 'inv-get', { timeoutMs: 3500, attempts: 2 }),
                    requestFreshGameEvent('pokes', 'pokes-get', { timeoutMs: 3500, attempts: 2 }),
                    fetch(ITEMS_JSON_URL).then(response => response.json()),
                    loadBallCatalog().catch(() => ({ catalog: [], counts: {} }))
                ]);
                const itemMap = new Map((itemPayload.items || []).map(item => [String(item.id), item]));
                sellEntries = inventory.filter(entry => Number(entry.quantity) > 0).map(entry => {
                    const item = itemMap.get(String(entry.itemId)) || {};
                    return { kind: 'item', marketKind: 'item', refId: Number(entry.itemId), name: item.name || `Item ${entry.itemId}`, icon: normalizeGameItemIcon(item.icon), quantity: Number(entry.quantity) };
                });
                const balls = Array.isArray(ballPayload.catalog) ? ballPayload.catalog : (ballPayload.catalog?.balls || []);
                balls.forEach(ball => {
                    const quantity = Number(ballPayload.counts?.[String(ball.id)] || 0);
                    if (quantity > 0) sellEntries.push({ kind: 'item', marketKind: 'ball', refId: Number(ball.id), name: ball.name, icon: ball.iconUrl || normalizeGameItemIcon(ball.icon), quantity });
                });
                pokemon.filter(poke => !poke.starter && !poke.market && !poke.listed).forEach(poke => sellEntries.push({
                    ...poke, kind: 'pokemon', name: poke.name || `Pokémon ${poke.speciesId}`, icon: getPokemonIconUrl(poke.speciesId), quantity: 1
                }));
                const types = [...new Set(pokemon.flatMap(poke => [poke.type1, poke.type2]).filter(Boolean))].sort();
                sellType.innerHTML = `<option value="">Todos los tipos</option>${types.map(type => `<option value="${escapeHTML(type)}">${escapeHTML(type)}</option>`).join('')}`;
                selectedSellEntry = null;
                sellSubmit.disabled = true;
                renderSell();
            } catch (error) {
                status.textContent = `No se han podido cargar tus objetos y Pokémon: ${error.message}`;
            }
        };

        const render = () => {
            const query = search.value.trim().toLocaleLowerCase();
            let filtered = currentListings.filter(entry => {
                const ref = entry.item || entry.pokemon || entry.product || {};
                const name = entry.name || entry.title || entry.itemName || entry.pokemonName || ref.name || ref.title || '';
                if (query && !String(name).toLocaleLowerCase().includes(query)) return false;
                const entryCurrency = normalizeMarketCurrency(entry.currency || entry.currencyType || ref.currency || ref.currencyType);
                if (entryCurrency === 'GOLD' && !showGold.checked) return false;
                if (entryCurrency === 'DIAMONDS' && !showDiamonds.checked) return false;
                if (activeCategory === 'Pokemon') {
                    const iv = Number(entry.ivTotal ?? -1);
                    const level = Number(entry.level ?? -1);
                    const quality = Number(entry.quality ?? -1);
                    if (shinyOnly.checked && !entry.shiny) return false;
                    if (ivMin.value !== '' && iv < Number(ivMin.value)) return false;
                    if (ivMax.value !== '' && iv > Number(ivMax.value)) return false;
                    if (levelMin.value !== '' && level < Number(levelMin.value)) return false;
                    if (levelMax.value !== '' && level > Number(levelMax.value)) return false;
                    if (qualityMin.value !== '' && quality < Number(qualityMin.value)) return false;
                    if (qualityMax.value !== '' && quality > Number(qualityMax.value)) return false;
                    if (typeSelect.value && entry.type1 !== typeSelect.value && entry.type2 !== typeSelect.value) return false;
                }
                return true;
            });
            const sorters = {
                'price-asc': (a, b) => Number(a.price) - Number(b.price),
                'price-desc': (a, b) => Number(b.price) - Number(a.price),
                'iv-desc': (a, b) => Number(b.ivTotal ?? -1) - Number(a.ivTotal ?? -1),
                'power-desc': (a, b) => Number(b.power ?? -1) - Number(a.power ?? -1),
                'level-desc': (a, b) => Number(b.level ?? -1) - Number(a.level ?? -1),
                'quality-desc': (a, b) => Number(b.quality ?? -1) - Number(a.quality ?? -1)
            };
            if (sorters[sortSelect.value]) filtered = [...filtered].sort(sorters[sortSelect.value]);
            const visible = filtered.slice(0, renderLimit);
            list.innerHTML = '';
            const categoryLabel = categorySelect.options[categorySelect.selectedIndex]?.text || activeCategory;
            status.textContent = filtered.length
                ? `${tr('showing')} ${visible.length.toLocaleString()} ${tr('of')} ${filtered.length.toLocaleString()} ${categoryLabel}`
                : tr('noListings');
            visible.forEach(entry => {
                const ref = entry.item || entry.pokemon || entry.product || {};
                const name = entry.name || entry.title || entry.itemName || entry.pokemonName || ref.name || ref.title || '—';
                const price = Number(entry.price ?? entry.totalPrice ?? entry.value ?? 0);
                const quantity = Number(entry.quantity ?? entry.qty ?? entry.amount ?? 1);
                const quality = entry.quality ?? ref.quality;
                const ivTotal = entry.ivTotal ?? ref.ivTotal ?? entry.iv ?? ref.iv;
                const stats = entry.stats || ref.stats || {};
                const statText = entry.kind === 'pokemon'
                    ? [
                        ['HP', stats.hp], ['ATK', stats.atk], ['DEF', stats.def],
                        ['SP.ATK', stats.spAtk], ['SP.DEF', stats.spDef], ['SPD', stats.speed]
                    ].filter(([, value]) => value != null).map(([label, value]) => `${label} ${value}`).join(' · ')
                    : '';
                const row = document.createElement('div');
                row.style.cssText = 'display:grid;grid-template-columns:minmax(190px,1fr) auto auto auto;gap:12px;align-items:center;background:#14222d;border:1px solid #1f3545;border-radius:7px;padding:9px 11px;color:#e2e8f0;';
                const potential = quality != null && ivTotal != null
                    ? getPokemonPotentialPercent(quality, ivTotal, entry.shiny ?? ref.shiny)
                    : null;
                const details = [
                    ivTotal != null ? `${tr('ivTotal')}: ${ivTotal}/192` : '',
                    quality != null ? `Q: ${Number(quality).toFixed(2)}${potential !== null ? ` (${potential}%)` : ''}` : ''
                ].filter(Boolean).join(' · ');
                const offerOnly = Boolean(entry.offerOnly || price <= 0);
                const currency = normalizeMarketCurrency(entry.currency || entry.currencyType || ref.currency || ref.currencyType);
                const currencyIcon = currency === 'DIAMONDS' ? '💎' : '💲';
                row.innerHTML = `
                    <div><b>${escapeHTML(name)}</b>${details ? `<small style="display:block;color:#90cdf4;margin-top:2px;">${escapeHTML(details)}</small>` : ''}${statText ? `<small style="display:block;color:#a0aec0;margin-top:2px;">${escapeHTML(statText)}</small>` : ''}</div>
                    <span style="color:#a0aec0;">${tr('quantity')}: <b style="color:#e2e8f0;">${quantity.toLocaleString('es-ES')}</b></span>
                    <b style="color:#f6c453;">${offerOnly ? tr('offerOnly') : `${currencyIcon} ${price.toLocaleString('es-ES')}`}</b>`;
                const buyButton = document.createElement('button');
                buyButton.type = 'button';
                buyButton.className = 'mk-bulk-btn market-buy';
                buyButton.textContent = tr('buy');
                buyButton.disabled = offerOnly;
                buyButton.addEventListener('click', async () => {
                    buyButton.disabled = true;
                    try {
                        const characterData = await gameApiRequest('/api/characters/me');
                        const currentBalance = currency === 'DIAMONDS'
                            ? Number(characterData.character?.diamonds || 0)
                            : Number(characterData.character?.gold || 0);
                        const confirmed = await new Promise(resolve => showPurchaseConfirm({
                            name,
                            quantity: 1,
                            unitPrice: price,
                            currentBalance,
                            currency
                        }, resolve));
                        if (!confirmed) {
                            buyButton.disabled = false;
                            return;
                        }
                        const marketAction = entry.kind === 'pokemon'
                            ? { action: 'buy', id: entry.id, quantity: 1 }
                            : {
                                action: 'buy-stack',
                                kind: entry.kind,
                                refId: entry.refId,
                                price: entry.price,
                                currency: entry.currency,
                                quantity: 1,
                                ids: entry.ids ?? [entry.id]
                            };
                        await gameApiRequest('/api/game/market/action', {
                            method: 'POST',
                            body: JSON.stringify(marketAction)
                        });
                        if (quantity <= 1 || entry.kind === 'pokemon') {
                            currentListings = currentListings.filter(item => item !== entry);
                        } else {
                            entry.quantity = quantity - 1;
                        }
                        render();
                        showWindowMessage(backdrop.querySelector('.script-market-window'), tr('purchaseDone'));
                    } catch (error) {
                        showWindowMessage(backdrop.querySelector('.script-market-window'), `${tr('purchaseFailed')} ${error.message}`, true);
                        buyButton.disabled = false;
                    }
                });
                row.appendChild(buyButton);
                list.appendChild(row);
            });
            if (visible.length < filtered.length) {
                const more = document.createElement('button');
                more.type = 'button';
                more.className = 'mk-bulk-btn';
                more.style.cssText = 'margin:5px auto;padding:8px 18px;';
                more.textContent = `${tr('loadMore')} (+${Math.min(100, filtered.length - visible.length)})`;
                more.addEventListener('click', () => {
                    renderLimit += 100;
                    render();
                });
                list.appendChild(more);
            }
        };

        const load = async () => {
            status.textContent = tr('loading');
            list.innerHTML = '';
            try {
                const payload = await gameApiRequest(`/api/game/market?category=${encodeURIComponent(activeCategory)}`);
                currentListings = getMarketListings(payload);
                const types = [...new Set(currentListings.flatMap(entry => [entry.type1, entry.type2]).filter(Boolean))].sort();
                typeSelect.innerHTML = `<option value="">${tr('allTypes')}</option>${types.map(type => `<option value="${escapeHTML(type)}">${escapeHTML(type)}</option>`).join('')}`;
                pokemonFilters.style.display = activeCategory === 'Pokemon' ? 'flex' : 'none';
                renderLimit = 100;
                render();
            } catch (error) {
                console.warn('Error al cargar el Mercado Global:', error);
                status.textContent = `${tr('loadFailed')} ${error.message || ''}`.trim();
            }
        };
        backdrop.querySelector('.market-close').addEventListener('click', close);
        backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
        backdrop.querySelector('.market-refresh').addEventListener('click', () => marketMode === 'sell' ? loadSell() : load());
        backdrop.querySelectorAll('.market-tab').forEach(tab => tab.addEventListener('click', () => {
            marketMode = tab.dataset.mode;
            backdrop.querySelectorAll('.market-tab').forEach(button => button.classList.toggle('on', button === tab));
            buyControls.style.display = marketMode === 'buy' ? 'flex' : 'none';
            pokemonFilters.style.display = marketMode === 'buy' && activeCategory === 'Pokemon' ? 'flex' : 'none';
            sellControls.style.display = marketMode === 'sell' ? 'flex' : 'none';
            if (marketMode === 'sell') loadSell(); else load();
        }));
        [sellKind, sellSearch, sellIvMin, sellQualityMin, sellType].forEach(control => control.addEventListener('input', () => {
            selectedSellEntry = null;
            sellSubmit.disabled = true;
            renderSell();
        }));
        sellPrice.addEventListener('input', () => { sellSubmit.disabled = !selectedSellEntry || !(Number(sellPrice.value) >= 1); });
        sellSubmit.addEventListener('click', async () => {
            const entry = selectedSellEntry;
            const price = Math.floor(Number(sellPrice.value));
            if (!entry || price < 1) return;
            const quantity = entry.kind === 'pokemon' ? 1 : Math.max(1, Math.min(entry.quantity, Math.floor(Number(sellQty.value) || 1)));
            const message = `¿Publicar ${quantity}× ${entry.name} por ${price.toLocaleString('es-ES')} ${sellCurrency.value === 'DIAMONDS' ? 'diamantes' : 'dólares'}?`;
            if (!await showScriptConfirm(message, { title: 'Confirmar anuncio', confirmLabel: 'Anunciar' })) return;
            sellSubmit.disabled = true;
            try {
                const action = entry.kind === 'pokemon'
                    ? { action: 'sell-pokemon', capturedId: entry.id, price, currency: sellCurrency.value }
                    : { action: 'sell', kind: entry.marketKind, refId: entry.refId, quantity, price, currency: sellCurrency.value };
                await gameApiRequest('/api/game/market/action', { method: 'POST', body: JSON.stringify(action) });
                showWindowMessage(backdrop.querySelector('.script-market-window'), `Anuncio creado: ${entry.name}`);
                await loadSell();
            } catch (error) {
                showWindowMessage(backdrop.querySelector('.script-market-window'), `Error al publicar el anuncio: ${error.message}`, true);
                sellSubmit.disabled = false;
            }
        });
        categorySelect.addEventListener('change', () => {
            activeCategory = categorySelect.value;
            renderLimit = 100;
            if (activeCategory !== 'Pokemon' && ['iv-desc', 'power-desc', 'level-desc', 'quality-desc'].includes(sortSelect.value)) {
                sortSelect.value = 'recent';
            }
            load();
        });
        [search, sortSelect, showGold, showDiamonds, shinyOnly, ivMin, ivMax, levelMin, levelMax, qualityMin, qualityMax, typeSelect].forEach(control => control.addEventListener('input', () => {
            renderLimit = 100;
            render();
        }));
        load();
    }

    function injectHuntShopLauncher() {
        const captureBar = document.querySelector('[data-guide="capture-bar"]');
        if (!captureBar) return;
        const captureShopLink = captureBar.querySelector('.cap-shop-link');
        if (captureShopLink) captureShopLink.style.display = 'none';
        let marketButton = captureBar.querySelector('.script-open-global-market');
        if (!isHuntMarketActive()) {
            marketButton?.remove();
            return;
        }
        if (!marketButton) {
            marketButton = document.createElement('button');
            marketButton.type = 'button';
            marketButton.className = 'cap-shop-link script-open-global-market';
            marketButton.textContent = `🌐 ${tr('globalMarket')}`;
            marketButton.addEventListener('click', showGlobalMarketWindow);
            captureBar.appendChild(marketButton);
        }
    }

    let ballCatalogPromise = null;

    function loadBallCatalog() {
        if (!ballCatalogPromise) {
            ballCatalogPromise = gameApiRequest('/api/game/balls').catch(error => {
                ballCatalogPromise = null;
                throw error;
            });
        }
        return ballCatalogPromise;
    }

    async function showPortableBallShop() {
        document.querySelector('.portable-ball-backdrop')?.remove();
        const backdrop = document.createElement('div');
        backdrop.className = 'portable-ball-backdrop';
        backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;';
        backdrop.innerHTML = `
            <div class="ball-window script-portable-ball-window" style="width:min(680px,95vw);max-height:86vh;display:flex;flex-direction:column;background:#0c161f;border:1px solid #2b4c66;border-radius:10px;box-shadow:0 16px 50px rgba(0,0,0,.75);">
                <div class="ball-head" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #1a2d3a;">
                    <b style="flex:1;color:#e2e8f0;">🔴 Poké Balls y curación</b>
                    <span class="ball-gold" style="color:#f6c453;"></span>
                    <button class="cfg-x portable-ball-close" type="button" aria-label="Close">×</button>
                </div>
                <div class="portable-ball-status" style="padding:8px 12px;color:#a0aec0;font-size:12px;">${tr('loading')}</div>
                <div class="portable-ball-list" style="padding:0 12px 12px;overflow:auto;display:grid;gap:7px;"></div>
            </div>`;
        document.body.appendChild(backdrop);
        const close = () => backdrop.remove();
        backdrop.querySelector('.portable-ball-close').addEventListener('click', close);
        backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });

        const status = backdrop.querySelector('.portable-ball-status');
        const list = backdrop.querySelector('.portable-ball-list');
        try {
            ballCatalogPromise = null;
            markCatalogPromise = null;
            const [shopData, ballsData, inventory] = await Promise.all([
                loadMarkCatalog(),
                loadBallCatalog(),
                requestFreshGameEvent('inventory', 'inv-get', { timeoutMs: 3000, attempts: 2 })
            ]);
            const locale = 'es-ES';
            const blockedBalls = new Set(['idle ball', 'master ball']);
            const balls = (Array.isArray(shopData.balls) ? shopData.balls : [])
                .filter(ball => !blockedBalls.has(String(ball.name || '').trim().toLocaleLowerCase()));
            const consumables = (Array.isArray(shopData.items) ? shopData.items : [])
                .filter(item => ['heal', 'revive'].includes(String(item.category || '').toLocaleLowerCase()) || /potion|revive/i.test(String(item.name || '')));
            const itemCounts = new Map(inventory.map(item => [String(item.itemId), Number(item.quantity) || 0]));
            const data = { gold: Number(shopData.gold ?? ballsData.gold ?? 0) };
            backdrop.querySelector('.ball-gold').textContent = `💲 ${data.gold.toLocaleString(locale)}`;
            status.textContent = '';

            const addHeading = label => {
                const heading = document.createElement('div');
                heading.className = 'portable-shop-heading';
                heading.textContent = label;
                list.appendChild(heading);
            };

            const renderProduct = (product, kind) => {
                const row = document.createElement('div');
                row.className = 'ball-row';
                row.style.cssText = 'display:grid;grid-template-columns:minmax(150px,1fr) auto;gap:12px;align-items:center;background:#14222d;border:1px solid #1f3545;border-radius:7px;padding:9px 11px;';
                const info = document.createElement('div');
                info.style.cssText = 'display:grid;grid-template-columns:36px 1fr;gap:9px;align-items:center;';
                const icon = document.createElement('img');
                icon.src = normalizeGameItemIcon(product.icon || product.iconUrl);
                icon.alt = product.name || '';
                icon.style.cssText = 'width:34px;height:34px;object-fit:contain;';
                icon.onerror = () => { icon.style.visibility = 'hidden'; };
                const details = document.createElement('div');
                const initialCount = kind === 'ball'
                    ? Number(ballsData.counts?.[String(product.id)] || 0)
                    : Number(itemCounts.get(String(product.id)) || 0);
                row.dataset.ownedCount = String(initialCount);
                details.innerHTML = `<b style="color:#e2e8f0;">${escapeHTML(product.name)}</b><small class="portable-ball-owned" style="display:block;color:#a0aec0;margin-top:3px;">${initialCount.toLocaleString(locale)}× ${tr('inStock')} · 💲${Number(product.priceGold || 0).toLocaleString(locale)}</small>`;
                info.append(icon, details);
                const actions = document.createElement('div');
                actions.className = 'ball-actions';
                actions.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;';
                [1, 10, 100, 1000, 10000].forEach(quantity => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'ball-buy';
                    button.textContent = `+${quantity.toLocaleString('es-ES')}`;
                    button.addEventListener('click', async () => {
                        button.disabled = true;
                        try {
                            const confirmed = await new Promise(resolve => showPurchaseConfirm({
                                name: product.name,
                                quantity,
                                unitPrice: Number(product.priceGold) || 0,
                                currentGold: Number(data.gold) || 0
                            }, resolve));
                            if (!confirmed) return;
                            const result = await buyFromMarkShop(product, kind, quantity);
                            data.gold = Number(result.gold ?? data.gold);
                            const serverCount = kind === 'ball'
                                ? result.counts?.[String(product.id)]
                                : result.inventory?.find?.(item => String(item.itemId) === String(product.id))?.quantity;
                            const currentCount = Number(row.dataset.ownedCount || 0);
                            const count = Number(serverCount ?? (currentCount + quantity));
                            row.dataset.ownedCount = String(count);
                            info.querySelector('.portable-ball-owned').textContent = `${count.toLocaleString(locale)}× ${tr('inStock')} · 💲${Number(product.priceGold || 0).toLocaleString(locale)}`;
                            backdrop.querySelector('.ball-gold').textContent = `💲 ${data.gold.toLocaleString(locale)}`;
                            showWindowMessage(backdrop.querySelector('.script-portable-ball-window'), tr('purchaseDone'));
                        } catch (error) {
                            showWindowMessage(backdrop.querySelector('.script-portable-ball-window'), `${tr('purchaseFailed')} ${error.message}`, true);
                        } finally {
                            button.disabled = false;
                        }
                    });
                    actions.appendChild(button);
                });
                row.append(info, actions);
                list.appendChild(row);
            };

            addHeading('Poké Balls');
            balls.forEach(ball => renderProduct(ball, 'ball'));
            addHeading('Potions e Revives');
            consumables.forEach(item => renderProduct(item, 'item'));
        } catch (error) {
            status.textContent = `${tr('loadFailed')} ${error.message || ''}`.trim();
        }
    }

    function injectHuntBallEnhancements(ballWindow) {
        if (!ballWindow) return;

        const header = ballWindow.querySelector('.ball-head');
        if (!isHuntSellActive()) header?.querySelector('.hunt-sell-open')?.remove();
        if (header && isHuntSellActive() && !header.querySelector('.hunt-sell-open')) {
            const sellButton = document.createElement('button');
            sellButton.type = 'button';
            sellButton.className = 'mk-bulk-btn hunt-sell-open';
            sellButton.textContent = '💰 Vender objetos';
            sellButton.addEventListener('click', async () => {
                ballWindow.querySelector('.cfg-x')?.click();
                await new Promise(resolve => setTimeout(resolve, 100));
                showHuntSellWindow();
            });
            header.querySelector('.cfg-x')?.before(sellButton);
        }

        if (!isHuntBulkBuyActive()) {
            ballWindow.querySelectorAll('.script-hunt-bulk').forEach(button => button.remove());
            ballWindow.querySelectorAll('.ball-actions').forEach(actions => delete actions.dataset.bulkEnhanced);
            return;
        }
        ballWindow.querySelectorAll('.ball-row').forEach(row => {
            const actions = row.querySelector('.ball-actions');
            const ballName = row.querySelector('.ball-name')?.textContent?.trim();
            if (!actions || !ballName || !actions.querySelector('.ball-buy') || actions.dataset.bulkEnhanced) return;

            [1000, 10000].forEach(quantity => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'ball-buy script-hunt-bulk';
                button.textContent = `+${quantity.toLocaleString('es-ES')}`;
                button.addEventListener('click', async () => {
                    button.disabled = true;
                    try {
                        const data = await loadBallCatalog();
                        const ball = data.catalog?.find(item => item.name === ballName);
                        if (!ball?.id) throw new Error('No se ha encontrado la Poké Ball en el catálogo.');
                        const confirmed = await new Promise(resolve => showPurchaseConfirm({
                            name: ballName,
                            quantity,
                            unitPrice: Number(ball.priceGold) || 0,
                            currentGold: Number(data.gold) || 0
                        }, resolve));
                        if (!confirmed) return;
                        const result = await gameApiRequest('/api/game/balls/buy', {
                            method: 'POST',
                            body: JSON.stringify({ ballId: ball.id, qty: quantity })
                        });
                        const owned = row.querySelector('.ball-own');
                        const count = result.counts?.[String(ball.id)];
                        if (owned && count !== undefined) owned.textContent = `${Number(count).toLocaleString('es-ES')}× en stock`;
                        const gold = ballWindow.querySelector('.ball-gold');
                        if (gold && result.gold !== undefined) gold.textContent = `💲 ${Number(result.gold).toLocaleString('es-ES')}`;
                        ballCatalogPromise = null;
                        showWindowMessage(ballWindow, `Compra completada: ${quantity.toLocaleString('es-ES')}× ${ballName}`);
                    } catch (error) {
                        console.error('Error al comprar Poké Balls:', error);
                        showWindowMessage(ballWindow, `No se ha podido completar la compra: ${error.message}`, true);
                    } finally {
                        button.disabled = false;
                    }
                });
                actions.appendChild(button);
            });
            actions.dataset.bulkEnhanced = 'true';
        });
    }

    let markCatalogPromise = null;

    function loadMarkCatalog() {
        if (!markCatalogPromise) {
            markCatalogPromise = gameApiRequest('/api/game/shop').catch(error => {
                markCatalogPromise = null;
                throw error;
            });
        }
        return markCatalogPromise;
    }

    async function buyFromMarkShop(product, kind, quantity) {
        const requestedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
        let remaining = requestedQuantity;
        let result = null;
        while (remaining > 0) {
            const batchQuantity = Math.min(1000, remaining);
            const payload = kind === 'ball'
                ? { ballId: product.id, qty: batchQuantity }
                : { itemId: product.id, qty: batchQuantity };
            result = await gameApiRequest('/api/game/shop/buy', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            remaining -= batchQuantity;
        }
        return result || {};
    }

    function setNativeInputValue(input, value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, String(value));
        else input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    let markQualityMenuOpen = false;

    function findNativeMarkWindow() {
        return Array.from(document.querySelectorAll('.mk-window')).find(windowElement => {
            if (windowElement.classList.contains('script-market-window') || windowElement.closest('.script-market-backdrop')) return false;
            const title = windowElement.querySelector('.ball-head, .mk-head')?.textContent || '';
            return /(?:Loja\s+do\s+Mark|Mark(?:'s)?\s+Shop)/i.test(title);
        }) || null;
    }

    function isMarkQualitySelected(button) {
        return button.classList.contains('on')
            || button.classList.contains('active')
            || button.getAttribute('aria-pressed') === 'true'
            || button.dataset.active === 'true'
            || button.querySelector('input[type="checkbox"]')?.checked === true;
    }

    function injectMarkQualityMultiSelect(mkWindow) {
        if (!preferenceEnabled(STORAGE_MARK_QUALITY_PICKER)) return;
        const qualityPattern = /^(?:fraca|comum|incomum|rara|épica|epica|lendária|lendaria|mítica|mitica|anciã|ancia|divina|pobre|común|comun|infrecuente|rara|épica|epica|legendaria|mítica|mitica|ancestral|divina|poor|common|uncommon|rare|epic|legendary|mythic|ancient|divine)$/i;
        const qualityButtons = Array.from(mkWindow.querySelectorAll('button:not(.script-quality-toggle)'))
            .filter(button => qualityPattern.test(button.textContent.trim()));
        if (qualityButtons.length < 3) return;
        const parent = qualityButtons[0].parentElement;
        const siblings = qualityButtons.filter(button => button.parentElement === parent);
        if (siblings.length < 3 || parent.querySelector('.script-quality-multiselect')) return;
        mkWindow.querySelectorAll('.script-quality-dropdown').forEach(dropdown => dropdown.remove());
        siblings.forEach(button => { button.style.display = 'none'; button.dataset.scriptQualityNative = 'true'; });

        const picker = document.createElement('div');
        picker.className = 'script-quality-multiselect';
        picker.innerHTML = '<button class="mk-bulk-btn script-quality-toggle" type="button" aria-haspopup="true" aria-expanded="false">Calidades: todas ▾</button>';
        const toggle = picker.querySelector('.script-quality-toggle');

        const updateLabel = (dropdown = mkWindow.querySelector('.script-quality-dropdown')) => {
            const selectedCount = dropdown
                ? dropdown.querySelectorAll('input[type="checkbox"]:checked').length
                : siblings.filter(isMarkQualitySelected).length;
            toggle.textContent = selectedCount ? `Calidades: ${selectedCount} seleccionadas ▾` : 'Calidades: todas ▾';
        };

        const closeDropdown = () => {
            mkWindow.querySelector('.script-quality-dropdown')?.remove();
            markQualityMenuOpen = false;
            toggle.setAttribute('aria-expanded', 'false');
        };

        const openDropdown = () => {
            mkWindow.querySelector('.script-quality-dropdown')?.remove();
            const dropdown = document.createElement('div');
            dropdown.className = 'script-quality-dropdown';
            dropdown.setAttribute('role', 'menu');
            siblings.forEach(button => {
                const labelText = button.textContent.trim();
                const option = document.createElement('label');
                option.className = 'script-quality-option';
                option.innerHTML = `<input type="checkbox" data-label="${escapeHTML(labelText)}"> <span>${escapeHTML(labelText)}</span>`;
                const checkbox = option.querySelector('input');
                checkbox.checked = isMarkQualitySelected(button);
                checkbox.addEventListener('change', event => {
                    event.stopPropagation();
                    markQualityMenuOpen = true;
                    updateLabel(dropdown);
                    button.click();
                    [50, 150, 300].forEach(delay => setTimeout(() => {
                        if (!picker.isConnected || siblings.some(nativeButton => !nativeButton.isConnected)) {
                            picker.remove();
                            mkWindow.querySelector('.script-quality-dropdown')?.remove();
                            injectMarkQualityMultiSelect(mkWindow);
                            return;
                        }
                        const currentDropdown = mkWindow.querySelector('.script-quality-dropdown');
                        if (currentDropdown) updateLabel(currentDropdown);
                        else if (picker.isConnected && markQualityMenuOpen) openDropdown();
                    }, delay));
                });
                dropdown.appendChild(option);
            });
            ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => dropdown.addEventListener(type, event => event.stopPropagation()));
            mkWindow.appendChild(dropdown);
            const toggleRect = toggle.getBoundingClientRect();
            const windowRect = mkWindow.getBoundingClientRect();
            const desiredLeft = toggleRect.left - windowRect.left;
            const maxLeft = Math.max(8, windowRect.width - dropdown.offsetWidth - 8);
            dropdown.style.left = `${Math.max(8, Math.min(desiredLeft, maxLeft))}px`;
            dropdown.style.top = `${toggleRect.bottom - windowRect.top + 4}px`;
            markQualityMenuOpen = true;
            toggle.setAttribute('aria-expanded', 'true');
            updateLabel(dropdown);
        };

        toggle.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (mkWindow.querySelector('.script-quality-dropdown')) closeDropdown();
            else openDropdown();
        });

        const outside = event => {
            if (!picker.isConnected) return document.removeEventListener('pointerdown', outside, true);
            const dropdown = mkWindow.querySelector('.script-quality-dropdown');
            if (!picker.contains(event.target) && !dropdown?.contains(event.target)) closeDropdown();
        };
        document.addEventListener('pointerdown', outside, true);
        parent.appendChild(picker);
        updateLabel();
        if (markQualityMenuOpen) requestAnimationFrame(openDropdown);
    }

    function legacyInjectMarkBuyQuantities(mkWindow) {
        const quantityBar = mkWindow.querySelector('.mk-qtybar');
        const quantityInput = quantityBar?.querySelector('input.mk-qty');
        if (!quantityBar || !quantityInput) return;
        Array.from(quantityBar.children).forEach(child => {
            if (!child.classList.contains('script-mark-qty-presets')) child.style.display = 'none';
        });
        quantityBar.style.justifyContent = 'center';
        if (quantityBar.querySelector('.script-mark-qty-presets')) return;

        const presets = document.createElement('span');
        presets.className = 'script-mark-qty-presets';
        presets.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center;width:100%;';
        [1, 10, 100, 1000, 10000].forEach(quantity => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'mk-bulk-btn';
            button.textContent = quantity.toLocaleString('es-ES');
            button.addEventListener('click', () => {
                mkWindow.dataset.scriptBuyQty = String(quantity);
                setNativeInputValue(quantityInput, quantity);
                presets.querySelectorAll('button').forEach(item => item.classList.toggle('on', item === button));
            });
            presets.appendChild(button);
        });
        quantityInput.addEventListener('input', () => delete mkWindow.dataset.scriptBuyQty);
        quantityBar.appendChild(presets);

        if (!mkWindow.dataset.scriptBuyIntercepted) {
            mkWindow.addEventListener('click', async event => {
                const buyButton = event.target.closest('button.mk-buy');
                const quantity = parseInt(mkWindow.dataset.scriptBuyQty, 10);
                if (!buyButton || !quantity) return;
                event.preventDefault();
                event.stopImmediatePropagation();

                const row = buyButton.closest('.mk-row');
                const name = row?.querySelector('.mk-name')?.textContent?.trim();
                if (!name) return;
                buyButton.disabled = true;
                try {
                    const [catalog, characterData] = await Promise.all([
                        loadMarkCatalog(),
                        gameApiRequest('/api/characters/me').catch(() => null)
                    ]);
                    const ball = catalog.balls?.find(item => item.name === name);
                    const item = catalog.items?.find(entry => entry.name === name);
                    const product = ball || item;
                    if (!product) throw new Error('Producto no encontrado.');
                    const displayedGold = parseGameNumber(mkWindow.querySelector('.mk-gold')?.textContent);
                    const currentGold = Math.max(
                        0,
                        Number(characterData?.character?.gold || 0),
                        Number(characterData?.gold || 0),
                        Number(displayedGold || 0),
                        Number(catalog.gold || 0)
                    );
                    const confirmed = await new Promise(resolve => showPurchaseConfirm({
                        name,
                        quantity,
                        unitPrice: Number(product.priceGold) || 0,
                        currentGold
                    }, resolve));
                    if (!confirmed) return;
                    const result = await buyFromMarkShop(product, ball ? 'ball' : 'item', quantity);
                    const gold = mkWindow.querySelector('.mk-gold');
                    if (gold && result.gold !== undefined) gold.textContent = `💲 ${Number(result.gold).toLocaleString('es-ES')}`;
                    markCatalogPromise = null;
                    showWindowMessage(mkWindow, `Compra completada: ${quantity.toLocaleString('es-ES')}× ${name}`);
                    setTimeout(() => {
                        const currentInput = mkWindow.querySelector('.mk-qty');
                        if (currentInput) setNativeInputValue(currentInput, quantity);
                        mkWindow.dataset.scriptBuyQty = String(quantity);
                    }, 0);
                } catch (error) {
                    showWindowMessage(mkWindow, `No se ha podido completar la compra: ${error.message}`, true);
                } finally {
                    buyButton.disabled = false;
                }
            }, true);
            mkWindow.dataset.scriptBuyIntercepted = 'true';
        }
    }

    async function injectMarkBuyQuantities(mkWindow) {
        if (!preferenceEnabled(STORAGE_MARK_QUICK_BUY)) return;
        const quantityBar = mkWindow.querySelector('.mk-qtybar');
        if (quantityBar) quantityBar.style.display = 'none';
        const buyTab = Array.from(mkWindow.querySelectorAll('.mk-tab')).some(tab => tab.classList.contains('on') && /Comprar|Buy/i.test(tab.textContent));
        const rows = Array.from(mkWindow.querySelectorAll('.mk-row')).filter(row => row.querySelector('.mk-name'));
        if (!buyTab || !rows.length) return;
        let catalog;
        try { catalog = await loadMarkCatalog(); } catch { return; }
        rows.forEach(row => {
            if (row.querySelector('.script-mark-row-buy')) return;
            const name = row.querySelector('.mk-name')?.textContent?.trim();
            const ball = catalog.balls?.find(product => product.name === name);
            const item = catalog.items?.find(product => product.name === name);
            const product = ball || item;
            if (!product) return;
            row.querySelector('button.mk-buy')?.style.setProperty('display', 'none');
            const actions = document.createElement('div');
            actions.className = 'script-mark-row-buy';
            [1, 10, 100, 1000, 10000].forEach(quantity => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'mk-bulk-btn';
                button.textContent = quantity.toLocaleString('es-ES');
                button.title = `Comprar ${quantity.toLocaleString('es-ES')}× ${name}`;
                button.addEventListener('click', async event => {
                    event.preventDefault(); event.stopPropagation();
                    button.disabled = true;
                    try {
                        const currentGold = Math.max(0, parseGameNumber(mkWindow.querySelector('.mk-gold')?.textContent), Number(catalog.gold || 0));
                        const confirmed = await new Promise(resolve => showPurchaseConfirm({ name, quantity, unitPrice: Number(product.priceGold) || 0, currentGold }, resolve));
                        if (!confirmed) return;
                        const result = await buyFromMarkShop(product, ball ? 'ball' : 'item', quantity);
                        const gold = mkWindow.querySelector('.mk-gold');
                        if (gold && result.gold !== undefined) gold.textContent = `💲 ${Number(result.gold).toLocaleString('es-ES')}`;
                        const owned = row.querySelector('.script-owned-qty');
                        if (owned) {
                            const serverCount = ball ? result.counts?.[String(product.id)] : result.inventory?.find?.(entry => String(entry.itemId) === String(product.id))?.quantity;
                            const current = parseGameNumber(owned.textContent);
                            owned.textContent = `${Number(serverCount ?? current + quantity).toLocaleString('es-ES')}× ${tr('inStock')}`;
                        }
                        latestInventory = null; markCatalogPromise = null; ballCatalogPromise = null;
                        const confirmedStock = ball
                            ? Number((await loadBallCatalog()).counts?.[String(product.id)])
                            : Number((await requestFreshGameEvent('inventory', 'inv-get', { timeoutMs: 3500, attempts: 2 }))
                                .find(entry => String(entry.itemId) === String(product.id))?.quantity || 0);
                        const currentOwned = row.querySelector('.script-owned-qty');
                        if (currentOwned && Number.isFinite(confirmedStock)) {
                            currentOwned.textContent = `${confirmedStock.toLocaleString('es-ES')}× ${tr('inStock')}`;
                        }
                        showWindowMessage(mkWindow, `Compra completada: ${quantity.toLocaleString('es-ES')}× ${name}`);
                    } catch (error) {
                        showWindowMessage(mkWindow, `No se ha podido completar la compra: ${error.message}`, true);
                    } finally { button.disabled = false; }
                });
                actions.appendChild(button);
            });
            (row.querySelector('.mk-actions') || row).appendChild(actions);
        });
    }

    async function injectMarkOwnedQuantities(mkWindow) {
        const buyTab = Array.from(mkWindow.querySelectorAll('.mk-tab'))
            .some(tab => tab.classList.contains('on') && /Comprar|Buy/i.test(tab.textContent));
        if (!buyTab || !mkWindow.querySelector('.mk-row') || mkWindow.dataset.scriptOwnedLoading === 'true') return;
        mkWindow.dataset.scriptOwnedLoading = 'true';

        let shouldRetry = false;
        try {
            let [inventory, ballsData, shopData] = await Promise.all([
                requestGameEvent('inventory', 'inv-get', latestInventory),
                loadBallCatalog(),
                loadMarkCatalog()
            ]);
            const inventoryAvailable = inventory.length > 0;
            shouldRetry = !inventoryAvailable;
            const itemCounts = new Map(inventory.map(entry => [String(entry.itemId), Number(entry.quantity) || 0]));

            mkWindow.querySelectorAll('.mk-row').forEach(row => {
                const name = row.querySelector('.mk-name')?.textContent?.trim();
                const info = row.querySelector('.mk-info');
                if (!name || !info) return;
                const ball = shopData.balls?.find(item => item.name === name);
                const item = shopData.items?.find(entry => entry.name === name);
                if (!ball && item && !inventoryAvailable) {
                    info.querySelector('.script-owned-qty')?.remove();
                    return;
                }
                const quantity = ball
                    ? Number(ballsData.counts?.[String(ball.id)] || 0)
                    : Number(itemCounts.get(String(item?.id)) || 0);

                let owned = info.querySelector('.script-owned-qty');
                if (!owned) {
                    owned = document.createElement('div');
                    owned.className = 'mk-meta script-owned-qty';
                    info.appendChild(owned);
                }
                const quantityText = `${quantity.toLocaleString('es-ES')}× ${tr('inStock')}`;
                if (owned.textContent !== quantityText) owned.textContent = quantityText;
            });
            if (inventoryAvailable) delete mkWindow.dataset.scriptOwnedRetries;
        } catch (error) {
            console.warn('Error al cargar las cantidades de Mark:', error);
            shouldRetry = true;
        } finally {
            delete mkWindow.dataset.scriptOwnedLoading;
            if (shouldRetry && mkWindow.isConnected) {
                const retries = Number(mkWindow.dataset.scriptOwnedRetries || 0);
                if (retries < 5) {
                    mkWindow.dataset.scriptOwnedRetries = String(retries + 1);
                    setTimeout(() => injectMarkOwnedQuantities(mkWindow), 800);
                }
            }
        }
    }

    function showMarkModSettings(mkWindow) {
        const activateMarkSettings = () => {
            injectConfigTab();
            const configWindow = document.querySelector('.cfg-window');
            const modsTab = configWindow?.querySelector('.cfg-tab-mods');
            if (!modsTab || !configWindow.getClientRects().length) return false;
            modsTab.click();
            requestAnimationFrame(() => {
                const markSetting = configWindow.querySelector('.cfg-mark-quick-buy, .cfg-mark-quality-picker, .btn-mark-enhancements');
                const section = markSetting?.closest('.script-mod-category') || markSetting?.closest('.cfg-row');
                section?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
            return true;
        };
        const settingsButton = Array.from(document.querySelectorAll('button')).find(button => {
            if (button.closest('.mk-window, .cfg-window') || button.classList.contains('script-mark-settings')) return false;
            const accessibleText = `${button.textContent || ''} ${button.title || ''} ${button.getAttribute('aria-label') || ''}`.trim();
            return /configura|settings|ajustes|prefer[eê]ncias/i.test(accessibleText)
                || /^⚙(?:️)?$/.test(accessibleText)
                || button.matches('[class*="setting" i], [class*="config" i], [class*="gear" i]');
        });
        const closeButton = mkWindow.querySelector('.ball-head .cfg-x:not(.script-mark-settings), .mk-head .cfg-x:not(.script-mark-settings)');
        closeButton?.click();
        setTimeout(() => {
            const configWindow = document.querySelector('.cfg-window');
            if (!configWindow?.getClientRects().length) {
                settingsButton?.click();
                setTimeout(() => {
                    const menuItem = Array.from(document.querySelectorAll('button, .sel-item')).find(element => {
                        if (!element.getClientRects().length || element === settingsButton || element.closest('.cfg-window, .mk-window')) return false;
                        return /^(?:Configurações|Settings)$/i.test(element.textContent.trim());
                    });
                    menuItem?.click();
                }, 100);
            }
            let attempts = 0;
            const waitForSettings = setInterval(() => {
                attempts += 1;
                if (activateMarkSettings() || attempts >= 40) {
                    clearInterval(waitForSettings);
                    if (attempts >= 40) showScriptNotice('No se ha podido abrir la configuración de Mark.', { title: 'Configuración', isError: true });
                }
            }, 50);
        }, 80);
    }

    function injectMarkSettingsButton(mkWindow) {
        const header = mkWindow.querySelector('.ball-head, .mk-head');
        if (!header || header.querySelector('.script-mark-settings')) return;
        const settingsButton = document.createElement('button');
        settingsButton.type = 'button';
        settingsButton.className = 'cfg-x script-mark-settings';
        settingsButton.textContent = '⚙️';
        settingsButton.title = 'Configuración de Mark';
        settingsButton.setAttribute('aria-label', 'Abrir configuración de Mark');
        settingsButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            showMarkModSettings(mkWindow);
        });
        const closeButton = header.querySelector('.cfg-x');
        if (closeButton) closeButton.before(settingsButton);
        else header.appendChild(settingsButton);
    }

    function injectShopEnhancements() {
        document.querySelectorAll('.script-market-window .script-mark-settings').forEach(button => button.remove());
        const mkWindow = findNativeMarkWindow();
        if (!mkWindow) return;

        injectMarkBuyQuantities(mkWindow);
        injectMarkOwnedQuantities(mkWindow);
        injectMarkQualityMultiSelect(mkWindow);
        injectMarkSettingsButton(mkWindow);
        
        // 1. Sell Tab: Locks & Intercept Sell
        const isSellTab = !!Array.from(mkWindow.querySelectorAll('.mk-tab'))
            .find(t => t.classList.contains('on') && /\b(?:Sell|Vender)\b/i.test(t.textContent));
        if (isSellTab) {
            mkWindow.querySelectorAll('.mk-srow-head').forEach(row => {
                if (row.querySelector('.mk-lock')) return;
                const priceSpan = row.querySelector('.mk-price');
                const nameEl = row.querySelector('.mk-name');
                const itemName = nameEl ? nameEl.textContent.trim() : '';
                if (priceSpan) {
                    const lockBtn = document.createElement('button');
                    lockBtn.type = 'button';
                    const initLocked = isSellLocked(itemName);
                    lockBtn.className = `mk-lock${initLocked ? ' on' : ''}`;
                    lockBtn.title = initLocked ? 'Desbloquear — permitir la venta' : 'Bloquear — proteger de la venta';
                    lockBtn.setAttribute('aria-label', initLocked ? 'Desbloquear objeto' : 'Bloquear objeto');
                    lockBtn.innerHTML = initLocked ? '🔒' : '🔓';
                    
                    if (initLocked) {
                        row.classList.add('locked');
                        const cb = row.querySelector('input.mk-check');
                        if (cb) {
                            if (cb.checked) cb.click();
                            cb.setAttribute('disabled', '');
                        }
                    }

                    lockBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const isLocked = row.classList.toggle('locked');
                        lockBtn.className = `mk-lock${isLocked ? ' on' : ''}`;
                        lockBtn.title = isLocked ? 'Desbloquear — permitir la venta' : 'Bloquear — proteger de la venta';
                        lockBtn.setAttribute('aria-label', isLocked ? 'Desbloquear objeto' : 'Bloquear objeto');
                        lockBtn.innerHTML = isLocked ? '🔒' : '🔓';
                        
                        if (isLocked) addSellLock(itemName); else removeSellLock(itemName);
                        
                        const cb = row.querySelector('input.mk-check');
                        if (cb) {
                            if (isLocked) {
                                if (cb.checked) cb.click();
                                cb.setAttribute('disabled', '');
                            } else {
                                cb.removeAttribute('disabled');
                            }
                        }
                    });
                    
                    row.appendChild(lockBtn);
                }
            });
            
            // Hijack Select All to respect our custom locks
            const sellSelectAll = mkWindow.querySelector('button.mk-selall');
            if (sellSelectAll && !sellSelectAll.dataset.sellLockIntercepted) {
                sellSelectAll.addEventListener('click', (e) => {
                    e.stopImmediatePropagation();
                    e.stopPropagation();

                    const allRows = Array.from(mkWindow.querySelectorAll('.mk-srow-head'));
                    const unlockedRows = allRows.filter(r => !r.classList.contains('locked'));
                    
                    const anyUnchecked = unlockedRows.some(r => {
                        const cb = r.querySelector('input.mk-check');
                        return cb && !cb.checked;
                    });

                    unlockedRows.forEach(r => {
                        const cb = r.querySelector('input.mk-check');
                        if (cb) {
                            if (anyUnchecked && !cb.checked) cb.click();
                            else if (!anyUnchecked && cb.checked) cb.click();
                        }
                    });
                    
                    sellSelectAll.textContent = anyUnchecked ? '☑ Deseleccionar todo' : '☐ Seleccionar todo';
                }, true); // Important: capture phase!
                sellSelectAll.dataset.sellLockIntercepted = 'true';
            }
            
            // Intercept Sell CTA via event delegation on the sellbar
            const sellBar = mkWindow.querySelector('.mk-sellbar');
            if (sellBar && !sellBar.dataset.sellIntercepted) {
                let sellConfirmed = false;
                sellBar.addEventListener('click', (e) => {
                    const sellBtn = e.target.closest('button.mk-sell');
                    if (!sellBtn || sellBtn.disabled) return;
                    
                    // If we already confirmed, let it through
                    if (sellConfirmed) {
                        sellConfirmed = false;
                        return;
                    }
                    
                    const confirmList = getSellConfirmItems();
                    const selectedToConfirm = [];
                    mkWindow.querySelectorAll('.mk-srow-head').forEach(row => {
                        const cb = row.querySelector('input.mk-check');
                        if (cb && cb.checked) {
                            const nameEl = row.querySelector('.mk-name');
                            const itemName = nameEl ? nameEl.textContent.trim() : '';
                            if (confirmList.includes(itemName)) {
                                selectedToConfirm.push(itemName);
                            }
                        }
                    });
                    
                    if (selectedToConfirm.length > 0) {
                        e.stopImmediatePropagation();
                        e.preventDefault();
                        showSellConfirm(selectedToConfirm, (confirmed) => {
                            if (confirmed) {
                                sellConfirmed = true;
                                sellBtn.click();
                            }
                        });
                    }
                }, true); // capture phase – runs before React's handler
                sellBar.dataset.sellIntercepted = 'true';
            }
        }
        
        const isPokeTab = !!Array.from(mkWindow.querySelectorAll('.mk-tab')).find(t => t.classList.contains('on') && t.textContent.includes('Pokémon'));
        if (isPokeTab) {
            const selectAllBtn = mkWindow.querySelector('button.mk-selall');
            if (selectAllBtn && !selectAllBtn.dataset.intercepted) {
                selectAllBtn.addEventListener('click', () => {
                    if (!isGuardLegendaryActive()) return;
                    let ticks = 0;
                    const interval = setInterval(() => {
                        mkWindow.querySelectorAll('.mk-srow-head').forEach(row => {
                            const rarity = getPokemonRarity(row);
                            const forbidden = ['lendária', 'mítica', 'divina'];
                            if (rarity && forbidden.some(r => rarity.includes(r))) {
                                const cb = row.querySelector('input.mk-check');
                                if (cb && cb.checked) cb.click();
                            }
                        });
                        ticks++;
                        if (ticks > 5) clearInterval(interval);
                    }, 20);
                });
                selectAllBtn.dataset.intercepted = 'true';
            }
        }
    }

    let lastHuntSnapshot = null;
    let currentHuntSnapshot = null;
    let lastCatchTimestamp = null;
    let ballsAtLastCatch = 0;
    let capturesCount = 0;
    let lastHuntStartTime = null;
    let currentHuntStartTime = Date.now();
    let huntHistory = readStoredJSON(STORAGE_HA_HISTORY, []);
    if (!Array.isArray(huntHistory)) huntHistory = [];

    function parseHuntDuration(text) {
        const value = String(text || '');
        if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value.trim())) {
            return value.trim().split(':').map(Number).reduce((total, part) => (total * 60) + part, 0);
        }
        const hours = Number(value.match(/(\d+)\s*h/)?.[1] || 0);
        const minutes = Number(value.match(/(\d+)\s*m/)?.[1] || 0);
        const seconds = Number(value.match(/(\d+)\s*s/)?.[1] || 0);
        return (hours * 3600) + (minutes * 60) + seconds;
    }

    function getCurrentHuntLocation() {
        const location = document.querySelector('.phud-tloc')?.textContent?.trim() || '';
        const parts = location.split(/[·•]/).map(part => part.trim()).filter(Boolean);
        return parts.at(-1) || location || '';
    }

    function saveHuntSession(snapshot, startedAt) {
        if (!snapshot || Date.now() - startedAt < 3000 || (!snapshot.defeated && !snapshot.xpGained && !snapshot.balance)) return false;
        huntHistory.unshift({ ...snapshot, startedAt, endedAt: Date.now() });
        huntHistory = huntHistory.slice(0, 20);
        localStorage.setItem(STORAGE_HA_HISTORY, JSON.stringify(huntHistory));
        return true;
    }

    function formatNumber(num) {
        return new Intl.NumberFormat('es-ES').format(num);
    }

    // La calidad es el multiplicador numérico oficial devuelto por el juego.
    // Los rangos y colores siguen la presentación de JustPokédex para que el valor
    // sea legible sin perder la precisión del multiplicador.
    function getPokemonQualityInfo(multiplier) {
        const value = Number(multiplier);
        if (!Number.isFinite(value)) return null;
        if (value < 1.0) return { label: 'Débil', color: '#9e9e9e' };
        if (value < 1.1) return { label: 'Común', color: '#a8a8a8' };
        if (value < 1.3) return { label: 'Poco común', color: '#5ed7b9' };
        if (value < 1.5) return { label: 'Rara', color: '#69b7ff' };
        if (value < 1.7) return { label: 'Épica', color: '#d985ff' };
        if (value < 2.0) return { label: 'Legendaria', color: '#f1c644' };
        if (value < 3.0) return { label: 'Mítica', color: '#ff6680' };
        if (value < 4.0) return { label: 'Ancestral', color: '#ff9800' };
        return { label: 'Divina', color: '#00bcd4' };
    }

    function formatPokemonQuality(multiplier) {
        const info = getPokemonQualityInfo(multiplier);
        const value = Number(multiplier);
        return info ? `${info.label} ×${value.toFixed(2)}` : null;
    }

    function formatPokemonQualityWithPotential(multiplier, ivTotal, isShiny = false) {
        const quality = formatPokemonQuality(multiplier);
        const potential = getPokemonPotentialPercent(multiplier, ivTotal, isShiny);
        if (!quality) return 'Calidad —';
        const info = getPokemonQualityInfo(multiplier);
        return `${info.label}${potential === null ? '' : ` ${potential}%`} ×${Number(multiplier).toFixed(2)}`;
    }

    function getCaptureIvTotal(capture, row) {
        const directValues = [capture?.ivTotal, capture?.totalIv, capture?.iv, capture?.growth];
        for (const candidate of directValues) {
            if (Number.isFinite(Number(candidate))) return Number(candidate);
            if (candidate && typeof candidate === 'object') {
                const total = Object.values(candidate).reduce((sum, value) => sum + (Number(value) || 0), 0);
                if (total > 0) return total;
            }
        }

        const ivText = row?.textContent?.match(/\bIV\s*:?\s*(\d+(?:[.,]\d+)?)\s*(?:\/\s*192)?/i)?.[1];
        return ivText ? Number(ivText.replace(',', '.')) : null;
    }

    // Las capturas salvajes normales tienen un límite de ×1,8; únicamente los Pokémon
    // shiny y de crianza alcanzan Mítica/Ancestral/Divina (de ×2,0 a ×4,0).
    // Una calidad superior a 1,8 demuestra por sí sola que no procede de una captura normal.
    const WILD_QUALITY_CEILING = 1.8;
    const SPECIAL_QUALITY_CEILING = 4.0;
    function getPokemonQualityCeiling(multiplier, isShiny) {
        const quality = Number(multiplier);
        return (isShiny || quality > WILD_QUALITY_CEILING) ? SPECIAL_QUALITY_CEILING : WILD_QUALITY_CEILING;
    }

    // Índice de potencial: la calidad pesa más que los IV (75/25), ya que, según la
    // Poképedia oficial (/pokepedia/systems/power), interviene dos veces en la fórmula
    // real de poder (exponente por estadística y multiplicador final), mientras que
    // los IV solo se suman linealmente dentro de cada estadística.
    // 0 % = 0 IV y ×0,80; 100 % = 192 IV y el límite de calidad del Pokémon
    // (×1,8 para capturas salvajes normales y ×4,0 para shiny/crianza).
    const POTENTIAL_QUALITY_WEIGHT = 0.75;
    function getPokemonPotentialPercent(multiplier, ivTotal, isShiny = false) {
        if (!preferenceEnabled(STORAGE_SHOW_QUALITY_POTENTIAL)) return null;
        const quality = Number(multiplier);
        const iv = Number(ivTotal);
        if (!Number.isFinite(quality) || !Number.isFinite(iv)) return null;
        const qualityCeiling = getPokemonQualityCeiling(quality, isShiny);
        const normalizedQuality = (Math.min(qualityCeiling, Math.max(0.8, quality)) - 0.8) / (qualityCeiling - 0.8);
        const normalizedIv = Math.min(192, Math.max(0, iv)) / 192;
        const weighted = normalizedQuality * POTENTIAL_QUALITY_WEIGHT + normalizedIv * (1 - POTENTIAL_QUALITY_WEIGHT);
        return Math.min(100, Math.max(0, Math.round(weighted * 100)));
    }

    function getPokemonQualityTitle(multiplier, ivTotal, isShiny = false) {
        const value = Number(multiplier);
        const formatted = formatPokemonQuality(value);
        const potential = getPokemonPotentialPercent(value, ivTotal, isShiny);
        if (!formatted) return '';
        const qualityCeiling = getPokemonQualityCeiling(value, isShiny);
        return potential === null
            ? `Calidad: ${formatted}`
            : `Potencial: ${potential}% (IV ${Number(ivTotal).toFixed(1)}/192 y calidad ${Number(multiplier).toFixed(2)}×; máximo: 192 IV y ×${qualityCeiling.toFixed(1)})`;
    }

    function normalizePartyPokemonName(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\bshiny\b/gi, '')
            .replace(/[^a-z0-9]/gi, '')
            .toLowerCase();
    }

    function enhancePartyQuality(pokemonList = latestPokemon) {
        const buttons = Array.from(document.querySelectorAll('div.phud-party > button.phud-mon'));
        if (!buttons.length) return;

        const teamPokemon = Array.isArray(pokemonList)
            ? pokemonList.filter(pokemon => pokemon?.team).sort((a, b) => Number(a.slot ?? 99) - Number(b.slot ?? 99))
            : [];

        if (!teamPokemon.length) return;

        buttons.forEach((button, index) => {
            const nameElement = button.querySelector('.phud-mon-name, .phud-name, [class*="name"]') || button;
            const visibleName = normalizePartyPokemonName(nameElement.textContent);
            const pokemon = teamPokemon.find(entry => normalizePartyPokemonName(entry.name) === visibleName) || teamPokemon[index];
            const oldBadge = button.querySelector('.script-party-quality');
            const ivTotal = getCaptureIvTotal(pokemon, null);
            const qualityInfo = getPokemonQualityInfo(pokemon?.quality);
            const potential = getPokemonPotentialPercent(pokemon?.quality, ivTotal, pokemon?.shiny);

            if (!pokemon || !qualityInfo || potential === null) {
                oldBadge?.remove();
                return;
            }

            const badge = oldBadge || document.createElement('span');
            badge.className = 'script-party-quality';
            badge.textContent = `${potential}%`;
            badge.style.color = qualityInfo.color;
            badge.title = getPokemonQualityTitle(pokemon.quality, ivTotal, pokemon?.shiny);
            if (!oldBadge) nameElement.appendChild(badge);
        });
    }

    let huntAnalyzerRenderRefreshPending = false;
    function refreshHuntAnalyzerGameRender() {
        if (huntAnalyzerRenderRefreshPending || document.hidden) return;
        if (!document.querySelector('.ha-window:not(.ha-compare-modal)')) return;
        huntAnalyzerRenderRefreshPending = true;
        setTimeout(() => {
            try {
                const event = new Event('visibilitychange');
                Object.defineProperty(event, 'piwQolRenderRefresh', { value: true });
                document.dispatchEvent(event);
            } finally {
                huntAnalyzerRenderRefreshPending = false;
            }
        }, 80);
    }

    document.addEventListener('visibilitychange', event => {
        if (!event.piwQolRenderRefresh && !document.hidden) refreshHuntAnalyzerGameRender();
    });
    window.addEventListener('focus', refreshHuntAnalyzerGameRender);

    function showCompareModal() {
        const curr = currentHuntSnapshot || { defeated: 0, timeText: '0s', balance: 0, balHour: 0, xpHour: 0, killsHour: 0, xpGained: 0, locName: 'Ninguna' };
        const last = lastHuntSnapshot || huntHistory[0] || { defeated: 0, timeText: '0s', balance: 0, balHour: 0, xpHour: 0, killsHour: 0, xpGained: 0, locName: 'Ninguna' };

        const cmp = (a, b) => {
            if (a > b) return ['ha-compare-winner', 'ha-compare-loser'];
            if (b > a) return ['ha-compare-loser', 'ha-compare-winner'];
            return ['', ''];
        };

        const formatTitle = (ts, loc) => {
            let res = loc ? loc : 'Hunt';
            if (ts) {
                const d = new Date(ts);
                res += ` (${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')})`;
            }
            return res;
        };
        const lastTitle = formatTitle(lastHuntStartTime || last.startedAt, last.locName);
        const currTitle = formatTitle(currentHuntStartTime, curr.locName);

        const [balLast, balCurr] = cmp(last.balance, curr.balance);
        const [balhLast, balhCurr] = cmp(last.balHour, curr.balHour);
        const [xpLast, xpCurr] = cmp(last.xpHour, curr.xpHour);
        const [killsLast, killsCurr] = cmp(last.killsHour, curr.killsHour);
        const [xpgLast, xpgCurr] = cmp(last.xpGained, curr.xpGained);

        const formatBal = (val) => val < 0 ? `-$${formatNumber(Math.abs(val))}` : `$${formatNumber(val)}`;

        const backdrop = document.createElement('div');
        backdrop.className = 'ha-compare-backdrop';
        backdrop.innerHTML = `
            <div class="ha-window ha-compare-modal" style="position: relative; box-shadow: 0 12px 32px rgba(0,0,0,0.8);">
                <div class="ha-title">
                    <span>⚖️ Comparación de hunts</span>
                    <button class="ha-x ha-compare-close" aria-label="Close" type="button">×</button>
                </div>
                <div style="padding: 12px;">
                    <table class="ha-compare-table">
                        <tr><th>Métrica</th><th>${escapeHTML(lastTitle)}</th><th>${escapeHTML(currTitle)}</th></tr>
                        <tr><td>💰 Balance Total</td><td class="${balLast}">${formatBal(last.balance)}</td><td class="${balCurr}">${formatBal(curr.balance)}</td></tr>
                        <tr><td>📉 Balance/h</td><td class="${balhLast}">${formatBal(last.balHour)}</td><td class="${balhCurr}">${formatBal(curr.balHour)}</td></tr>
                        <tr><td>🌟 XP Gained</td><td class="${xpgLast}">${formatNumber(last.xpGained)}</td><td class="${xpgCurr}">${formatNumber(curr.xpGained)}</td></tr>
                        <tr><td>✨ XP/h</td><td class="${xpLast}">${formatNumber(last.xpHour)}</td><td class="${xpCurr}">${formatNumber(curr.xpHour)}</td></tr>
                        <tr><td>⚔️ Kills/h</td><td class="${killsLast}">${formatNumber(last.killsHour)}</td><td class="${killsCurr}">${formatNumber(curr.killsHour)}</td></tr>
                        <tr><td>⏱️ Tempo</td><td>${last.timeText}</td><td>${curr.timeText}</td></tr>
                        <tr><td>💀 Defeated</td><td>${last.defeated}</td><td>${curr.defeated}</td></tr>
                    </table>
                    <div style="margin-top:12px;border-top:1px solid #263b4c;padding-top:10px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <b style="color:#dce7f1;flex:1;">Historial reciente</b>
                            <button class="ha-sbtn ha-history-clear" type="button">Borrar historial</button>
                        </div>
                        <div class="ha-history-list" style="display:grid;gap:6px;margin-top:8px;max-height:150px;overflow:auto;">
                            ${huntHistory.length ? huntHistory.slice(0, 10).map(session => `
                                <div style="display:grid;grid-template-columns:1fr auto auto;gap:10px;background:#101d27;border-radius:6px;padding:7px 9px;color:#aebdca;font-size:12px;">
                                    <span>${escapeHTML(session.locName || 'Hunt')}</span>
                                    <span>${formatBal(session.balance || 0)}</span>
                                    <span>${formatNumber(session.xpGained || 0)} XP</span>
                                </div>
                            `).join('') : '<span style="color:#718096;font-size:12px;">Todavía no se ha completado ninguna sesión.</span>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        backdrop.querySelector('.ha-history-clear').addEventListener('click', async () => {
            if (!await showScriptConfirm('¿Borrar todo el historial guardado del Hunt Analyzer?', {
                title: 'Borrar historial',
                confirmLabel: 'Apagar'
            })) return;
            huntHistory = [];
            lastHuntSnapshot = null;
            localStorage.removeItem(STORAGE_HA_HISTORY);
            backdrop.querySelector('.ha-history-list').innerHTML = '<span style="color:#718096;font-size:12px;">Todavía no se ha completado ninguna sesión.</span>';
        });

        // Arrastre mediante puntero: funciona con ratón y pantallas táctiles.
        let isDragging = false, startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
        const modal = backdrop.querySelector('.ha-compare-modal');
        const titleBar = modal.querySelector('.ha-title');
        
        titleBar.addEventListener('pointerdown', e => {
            if (e.target.closest('button')) return;
            const rect = modal.getBoundingClientRect();
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialLeft = rect.left;
            initialTop = rect.top;
            modal.style.setProperty('left', `${rect.left}px`, 'important');
            modal.style.setProperty('top', `${rect.top}px`, 'important');
            modal.style.transform = 'none';
            titleBar.setPointerCapture?.(e.pointerId);
            e.preventDefault();
        });
        const handlePointerMove = e => {
            if (!isDragging) return;
            const maxLeft = Math.max(0, window.innerWidth - modal.offsetWidth);
            const maxTop = Math.max(0, window.innerHeight - modal.offsetHeight);
            modal.style.setProperty('left', `${Math.min(maxLeft, Math.max(0, initialLeft + e.clientX - startX))}px`, 'important');
            modal.style.setProperty('top', `${Math.min(maxTop, Math.max(0, initialTop + e.clientY - startY))}px`, 'important');
        };
        const handlePointerUp = () => { isDragging = false; };
        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);

        backdrop.querySelector('.ha-compare-close').addEventListener('click', () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
            backdrop.remove();
        });
    }

    function trackHuntAnalyzer() {
        const haWindow = document.querySelector('.ha-window:not(.ha-compare-modal)');
        if (!haWindow) return;
        refreshHuntAnalyzerGameRender();

        const getCardVal = (idx) => {
            const card = haWindow.querySelectorAll('.ha-card b')[idx];
            return card ? parseInt(card.textContent.replace(/[^0-9]/g, ''), 10) || 0 : 0;
        };
        const defeated = getCardVal(0);
        const timeText = haWindow.querySelectorAll('.ha-card b')[1]?.textContent || '0s';
        const xpGained = getCardVal(2);
        
        const balanceNode = haWindow.querySelector('.ha-balance b');
        let balance = 0;
        if (balanceNode) {
            balance = parseInt(balanceNode.textContent.replace(/−/g, '-').replace(/[.]/g, '').replace(/[^0-9-]/g, ''), 10) || 0;
        }

        const catchCard = haWindow.querySelector('.ha-catch b');
        const currentCatch = catchCard ? parseInt(catchCard.textContent.replace(/[^0-9]/g, ''), 10) || 0 : 0;
        
        let currentBalls = 0;
        const supplyCard = haWindow.querySelector('.ha-supply small');
        if (supplyCard) {
            const match = supplyCard.textContent.match(/(\d+)\s+balls/);
            if (match) currentBalls = parseInt(match[1], 10);
        }

        const locName = getCurrentHuntLocation() || currentHuntSnapshot?.locName || '';
        const durationSeconds = parseHuntDuration(timeText);
        const locationChanged = Boolean(
            currentHuntSnapshot?.locName && locName && currentHuntSnapshot.locName !== locName
        );
        const countersReset = Boolean(
            currentHuntSnapshot && (
                defeated < currentHuntSnapshot.defeated ||
                durationSeconds < (currentHuntSnapshot.durationSeconds || 0)
            )
        );
        const isReset = locationChanged || countersReset;
        
        if (isReset) {
            const completedSnapshot = { ...currentHuntSnapshot };
            if (saveHuntSession(completedSnapshot, currentHuntStartTime)) {
                lastHuntSnapshot = completedSnapshot;
            }
            capturesCount = 0;
            lastCatchTimestamp = null;
            ballsAtLastCatch = 0;
            lastHuntStartTime = currentHuntStartTime;
            currentHuntStartTime = Date.now();
        }

        if (!currentHuntSnapshot || isReset) {
            capturesCount = currentCatch;
        } else if (currentCatch > capturesCount) {
            capturesCount = currentCatch;
            lastCatchTimestamp = Date.now();
            ballsAtLastCatch = currentBalls;
        }

        const ratesNode = haWindow.querySelector('.ha-rates');
        let balHour = 0, xpHour = 0, killsHour = 0;
        if (ratesNode) {
            const spans = ratesNode.querySelectorAll('span:not(.ha-catch-stats)');
            if (spans[0]) balHour = parseInt(spans[0].textContent.replace(/−/g, '-').replace(/[.]/g, '').replace(/[^0-9-]/g, ''), 10) || 0;
            if (spans[1]) xpHour = parseInt(spans[1].textContent.replace(/[.]/g, '').replace(/[^0-9]/g, ''), 10) || 0;
            if (spans[2]) killsHour = parseInt(spans[2].textContent.replace(/[.]/g, '').replace(/[^0-9]/g, ''), 10) || 0;

            let catchStats = ratesNode.querySelector('.ha-catch-stats');
            if (!catchStats) {
                catchStats = document.createElement('span');
                catchStats.className = 'ha-rate ha-catch-stats';
                ratesNode.appendChild(catchStats);
            }
            if (lastCatchTimestamp) {
                const diffMs = Date.now() - lastCatchTimestamp;
                const diffM = Math.floor(diffMs / 60000);
                const timeStr = diffM > 0 ? `hace ${diffM}m` : 'ahora';
                const dateStr = new Date(lastCatchTimestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                const ballsSpent = Math.max(0, ballsAtLastCatch - currentBalls);
                const newText = `🔴 Última captura: ${dateStr} (${timeStr}) • ${ballsSpent} Poké Balls`;
                if (catchStats.textContent !== newText) {
                    catchStats.textContent = newText;
                }
                catchStats.classList.remove('hidden');
            } else {
                const newText = `🔴 Ninguna captura en esta hunt`;
                if (catchStats.textContent !== newText) {
                    catchStats.textContent = newText;
                }
                catchStats.classList.remove('hidden');
            }
        }

        const snapshot = { defeated, timeText, durationSeconds, balance, balHour, xpHour, killsHour, xpGained, locName };
        currentHuntSnapshot = snapshot;

        const oldToggle = haWindow.querySelector('.ha-title .ha-btn-toggle-view');
        if (oldToggle) oldToggle.remove();

        // Apply persisted compact state on first injection
        if (!haWindow.dataset.haInitialized) {
            if (isHaCompact()) haWindow.classList.add('ha-compact');
            haWindow.dataset.haInitialized = 'true';
        }

        // Apply persisted drops visibility
        const drops = haWindow.querySelector('.ha-drops');
        if (drops && !haWindow.dataset.haDropsInit) {
            if (isHaDropsVisible()) drops.classList.add('show-drops');
            haWindow.dataset.haDropsInit = 'true';
        }

        let actionArea = haWindow.querySelector('.ha-script-actions');
        let isNewActionArea = false;
        if (!actionArea) {
            actionArea = document.createElement('div');
            actionArea.className = 'ha-script-actions';
            isNewActionArea = true;

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'ha-sbtn btn-toggle-view';
            toggleBtn.innerHTML = haWindow.classList.contains('ha-compact') ? '⤢ Expandir' : '⤡ Reduzir';
            toggleBtn.type = 'button';
            toggleBtn.addEventListener('click', () => {
                const isCompact = haWindow.classList.toggle('ha-compact');
                toggleBtn.innerHTML = isCompact ? '⤢ Expandir' : '⤡ Reduzir';
                setHaCompact(isCompact);
            });

            const dropBtn = document.createElement('button');
            dropBtn.className = 'ha-sbtn btn-show-drops';
            dropBtn.innerHTML = '📦 Drops';
            dropBtn.type = 'button';
            dropBtn.addEventListener('click', () => {
                const dropsEl = haWindow.querySelector('.ha-drops');
                if (dropsEl) {
                    const visible = dropsEl.classList.toggle('show-drops');
                    setHaDropsVisible(visible);
                }
            });

            const compareBtn = document.createElement('button');
            compareBtn.className = 'ha-sbtn btn-compare';
            compareBtn.innerHTML = '⚖️ Comparar';
            compareBtn.type = 'button';
            compareBtn.addEventListener('click', showCompareModal);

            actionArea.appendChild(toggleBtn);
            actionArea.appendChild(dropBtn);
            if (preferenceEnabled(STORAGE_COMPARE_WINDOW)) actionArea.appendChild(compareBtn);
        }
        if (!preferenceEnabled(STORAGE_COMPARE_WINDOW)) actionArea.querySelector('.btn-compare')?.remove();

        // El título nativo permanece arriba y las acciones justo debajo.
        const haTitle = haWindow.querySelector(':scope > .ha-title, :scope > h3, :scope > .ha-head, :scope > .ha-header')
            || haWindow.querySelector('.ha-title, h3, .ha-head, .ha-header');
        if (haTitle) {
            if (haTitle.nextElementSibling !== actionArea) haTitle.after(actionArea);
        } else if (isNewActionArea) {
            haWindow.prepend(actionArea);
        }
    }

    function enhanceInventoryWindow() {
        const inventoryWindow = document.querySelector('.inv-window');
        if (!inventoryWindow) return;
        inventoryWindow.classList.add('script-resizable-inventory');

        const namedBackdrop = inventoryWindow.closest(
            '.win-backdrop, .modal-backdrop, .window-backdrop, .overlay, [class*="backdrop"]'
        );
        if (namedBackdrop && namedBackdrop !== inventoryWindow) {
            namedBackdrop.classList.add('script-inventory-backdrop');
            return;
        }

        let ancestor = inventoryWindow.parentElement;
        while (ancestor && ancestor !== document.body) {
            const style = getComputedStyle(ancestor);
            const rect = ancestor.getBoundingClientRect();
            if (style.position === 'fixed' && rect.width >= innerWidth * 0.8 && rect.height >= innerHeight * 0.8) {
                ancestor.classList.add('script-inventory-backdrop');
                break;
            }
            ancestor = ancestor.parentElement;
        }
    }

    // Capture Log: la calidad se dibuja con ::after a partir de data-attributes.
    // La asociación prioriza datos nativos de la propia fila, después un historial local
    // registrado al capturar y solo usa la colección actual como respaldo.
    function capturePokemonId(pokemon) {
        const value = pokemon?.capturedId ?? pokemon?.captureId ?? pokemon?.id ?? pokemon?.instanceId ?? pokemon?.uid;
        return value === undefined || value === null || value === '' ? '' : String(value);
    }

    function capturePokemonSpeciesId(pokemon) {
        const value = pokemon?.speciesId ?? pokemon?.pokeId ?? pokemon?.pokemonId ?? pokemon?.creatureId;
        return value === undefined || value === null || value === '' ? '' : String(value);
    }

    function capturePokemonName(pokemon) {
        return String(pokemon?.name ?? pokemon?.pokemonName ?? pokemon?.pokeName ?? pokemon?.creatureName ?? '').trim();
    }

    function captureQualityValue(pokemon) {
        const value = Number(pokemon?.quality ?? pokemon?.qualityMultiplier ?? pokemon?.qualityMult);
        return Number.isFinite(value) && value >= 0.5 && value <= 5 ? value : null;
    }

    function captureTimestampValue(...sources) {
        const keys = ['capturedAt', 'caughtAt', 'captureTime', 'createdAt', 'acquiredAt', 'timestamp', 'time', 'serverNow'];
        for (const source of sources) {
            if (!source || typeof source !== 'object') continue;
            for (const key of keys) {
                const raw = source[key];
                if (raw === undefined || raw === null || raw === '') continue;
                if (typeof raw === 'number' && Number.isFinite(raw)) {
                    const ms = raw < 1e12 ? raw * 1000 : raw;
                    if (ms > 946684800000) return ms;
                }
                const parsed = Date.parse(String(raw));
                if (Number.isFinite(parsed)) return parsed;
            }
        }
        return null;
    }

    function captureDescriptor(pokemon, fallbackTime = null) {
        if (!pokemon || typeof pokemon !== 'object') return null;
        const quality = captureQualityValue(pokemon);
        if (quality === null) return null;
        const ivTotal = getCaptureIvTotal(pokemon, null);
        const name = capturePokemonName(pokemon);
        const id = capturePokemonId(pokemon);
        if (!name && !id) return null;
        return {
            id,
            speciesId: capturePokemonSpeciesId(pokemon),
            name,
            ivTotal: Number.isFinite(Number(ivTotal)) ? Number(ivTotal) : null,
            quality,
            shiny: Boolean(pokemon?.shiny ?? pokemon?.isShiny),
            level: Number.isFinite(Number(pokemon?.level)) ? Number(pokemon.level) : null,
            capturedAt: captureTimestampValue(pokemon) || fallbackTime || Date.now()
        };
    }

    function findCaptureDescriptorDeep(root, { rowName = '', rowIv = null, maxDepth = 4 } = {}) {
        if (!root || typeof root !== 'object') return null;
        const queue = [{ value: root, depth: 0 }];
        const seen = new WeakSet();
        let inspected = 0;
        let best = null;
        let bestScore = -1;
        let bestSignature = '';
        let ambiguousBest = false;

        while (queue.length && inspected < 180) {
            const { value, depth } = queue.shift();
            if (!value || typeof value !== 'object' || seen.has(value)) continue;
            if (typeof Node !== 'undefined' && value instanceof Node) continue;
            seen.add(value);
            inspected += 1;

            const descriptor = captureDescriptor(value);
            if (descriptor) {
                const normalizedName = normalizePartyPokemonName(descriptor.name);
                let score = 1;
                if (rowName && normalizedName) {
                    if (!rowName.includes(normalizedName)) score = -100;
                    else score += 5;
                }
                if (rowIv !== null && Number.isFinite(Number(descriptor.ivTotal))) {
                    if (Number(descriptor.ivTotal) !== Number(rowIv)) score = -100;
                    else score += 5;
                }
                if (descriptor.id) score += 2;
                const signature = `${descriptor.id}|${normalizePartyPokemonName(descriptor.name)}|${descriptor.ivTotal}|${descriptor.quality}`;
                if (score > bestScore) {
                    best = descriptor;
                    bestScore = score;
                    bestSignature = signature;
                    ambiguousBest = false;
                } else if (score === bestScore && signature !== bestSignature) {
                    ambiguousBest = true;
                }
            }

            if (depth >= maxDepth) continue;
            let entries = [];
            try { entries = Object.entries(value); } catch { continue; }
            for (const [key, child] of entries.slice(0, 50)) {
                if (!child || typeof child !== 'object') continue;
                if (['return', 'child', 'sibling', 'stateNode', '_owner'].includes(key)) continue;
                queue.push({ value: child, depth: depth + 1 });
            }
        }
        return bestScore >= 0 && !ambiguousBest ? best : null;
    }

    function parseCaptureRowTimestamp(row) {
        const text = String(row?.textContent || '');
        const match = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*,?\s*(\d{1,2}):(\d{2})\b/);
        if (!match) return null;
        const now = new Date();
        let year = match[3] ? Number(match[3]) : now.getFullYear();
        if (year < 100) year += 2000;
        let timestamp = new Date(year, Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), 0, 0).getTime();
        if (!match[3] && timestamp > now.getTime() + 2 * 86400000) {
            timestamp = new Date(year - 1, Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), 0, 0).getTime();
        }
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    function saveCaptureQualityHistory() {
        captureQualityHistory = captureQualityHistory
            .filter(entry => entry && Number.isFinite(Number(entry.quality)))
            .sort((a, b) => Number(b.capturedAt || 0) - Number(a.capturedAt || 0))
            .slice(0, CAPTURE_QUALITY_HISTORY_LIMIT);
        try {
            localStorage.setItem(STORAGE_CAPTURE_QUALITY_HISTORY, JSON.stringify(captureQualityHistory));
        } catch (error) {
            console.warn('[PIW-QOL] No se pudo guardar el histórico de calidad de capturas:', error);
        }
    }

    function rememberCaptureQualityEntry(entry) {
        if (!entry || !Number.isFinite(Number(entry.quality))) return null;
        const normalized = {
            id: String(entry.id || ''),
            speciesId: String(entry.speciesId || ''),
            name: String(entry.name || '').trim(),
            ivTotal: Number.isFinite(Number(entry.ivTotal)) ? Number(entry.ivTotal) : null,
            quality: Number(entry.quality),
            shiny: Boolean(entry.shiny),
            level: Number.isFinite(Number(entry.level)) ? Number(entry.level) : null,
            capturedAt: Number.isFinite(Number(entry.capturedAt)) ? Number(entry.capturedAt) : Date.now()
        };
        if (!normalized.id && !normalized.name) return null;

        const sameIndex = captureQualityHistory.findIndex(current => {
            if (normalized.id && current.id && String(current.id) === normalized.id) return true;
            const sameName = normalizePartyPokemonName(current.name) === normalizePartyPokemonName(normalized.name);
            const sameIv = Number(current.ivTotal) === Number(normalized.ivTotal);
            const sameQuality = Math.abs(Number(current.quality) - normalized.quality) < 0.0001;
            const closeTime = Math.abs(Number(current.capturedAt || 0) - normalized.capturedAt) <= 20000;
            return sameName && sameIv && sameQuality && closeTime;
        });
        if (sameIndex >= 0) {
            const current = captureQualityHistory[sameIndex];
            const unchanged = String(current.id || '') === normalized.id
                && String(current.speciesId || '') === normalized.speciesId
                && String(current.name || '') === normalized.name
                && Number(current.ivTotal) === Number(normalized.ivTotal)
                && Math.abs(Number(current.quality) - normalized.quality) < 0.0001
                && Boolean(current.shiny) === normalized.shiny
                && Number(current.level) === Number(normalized.level)
                && Math.abs(Number(current.capturedAt || 0) - normalized.capturedAt) <= 1000;
            if (unchanged) return current;
            captureQualityHistory.splice(sameIndex, 1);
        }
        captureQualityHistory.unshift(normalized);
        saveCaptureQualityHistory();
        return normalized;
    }

    function purgePendingCaptureResults() {
        const cutoff = Date.now() - CAPTURE_PENDING_MAX_AGE_MS;
        pendingCaptureResults = pendingCaptureResults.filter(entry => Number(entry?.at || 0) >= cutoff);
    }

    function purgeRecentPokemonAdditions() {
        const cutoff = Date.now() - CAPTURE_RECENT_ADDITION_MAX_AGE_MS;
        recentPokemonAdditions = recentPokemonAdditions.filter(entry =>
            Number(entry?.seenAt || 0) >= cutoff
            && entry?.descriptor
            && Number.isFinite(Number(entry.descriptor.quality))
        );
    }

    function rememberRecentPokemonAdditions(previousList, nextList) {
        purgeRecentPokemonAdditions();
        // La primera hidratación después de un refresh no representa capturas nuevas.
        if (!Array.isArray(previousList) || !Array.isArray(nextList)) return;

        const previousIds = new Set(previousList.map(capturePokemonId).filter(Boolean));
        const seenIds = new Set(recentPokemonAdditions.map(entry => String(entry?.descriptor?.id || '')).filter(Boolean));
        const seenAt = Date.now();

        for (const pokemon of nextList) {
            const id = capturePokemonId(pokemon);
            if (!id || previousIds.has(id) || seenIds.has(id)) continue;
            const descriptor = captureDescriptor(pokemon, seenAt);
            if (!descriptor) continue;
            recentPokemonAdditions.push({ seenAt, descriptor });
            seenIds.add(id);

            // `pokes` solo mantiene un buffer transitorio. No persistimos cualquier
            // ID nuevo porque también puede aparecer por depósito, breeding u otras
            // acciones que NO son capturas. La persistencia se hace únicamente desde
            // `poke-delta` asociado a un catch-result exitoso, o desde el fallback de
            // reconciliación mientras exista una captura exitosa pendiente.
        }
        purgeRecentPokemonAdditions();
    }

    function recentCaptureAdditionKey(entry, index = 0) {
        const descriptor = entry?.descriptor || {};
        return descriptor.id
            ? `id:${descriptor.id}`
            : `recent:${index}:${Number(entry?.seenAt || descriptor.capturedAt || 0)}`;
    }

    function findRecentCaptureDescriptor(rowName, rowIv, rowTimestamp, usedKeys) {
        purgeRecentPokemonAdditions();
        const candidates = recentPokemonAdditions
            .map((entry, index) => ({ entry, index, descriptor: entry?.descriptor }))
            .filter(candidate => {
                const descriptor = candidate.descriptor;
                if (!descriptor || !Number.isFinite(Number(descriptor.quality))) return false;
                const name = normalizePartyPokemonName(descriptor.name);
                if (rowName && name && !rowName.includes(name)) return false;
                if (Number.isFinite(Number(rowIv))
                    && Number.isFinite(Number(descriptor.ivTotal))
                    && Number(descriptor.ivTotal) !== Number(rowIv)) return false;
                const key = recentCaptureAdditionKey(candidate.entry, candidate.index);
                if (usedKeys.has(key)) return false;
                if (Number.isFinite(Number(rowTimestamp))) {
                    const seenAt = Number(candidate.entry.seenAt || descriptor.capturedAt || 0);
                    const minuteStart = Number(rowTimestamp);
                    const minuteEnd = minuteStart + 60000;
                    const inMinute = seenAt >= minuteStart && seenAt < minuteEnd;
                    const closeEnough = Math.abs(seenAt - minuteStart) <= CAPTURE_ROW_MATCH_MAX_DELTA_MS;
                    if (!inMinute && !closeEnough) return false;
                }
                return true;
            })
            .sort((a, b) => Number(b.entry.seenAt || 0) - Number(a.entry.seenAt || 0));

        if (!candidates.length) return null;

        let chosen = null;
        if (Number.isFinite(Number(rowTimestamp))) {
            const minuteStart = Number(rowTimestamp);
            const minuteEnd = minuteStart + 60000;
            const sameMinute = candidates.filter(candidate => {
                const seenAt = Number(candidate.entry.seenAt || candidate.descriptor.capturedAt || 0);
                return seenAt >= minuteStart && seenAt < minuteEnd;
            });
            if (sameMinute.length) {
                chosen = sameMinute[0];
            } else {
                const ranked = candidates
                    .map(candidate => ({
                        ...candidate,
                        delta: Math.abs(Number(candidate.entry.seenAt || candidate.descriptor.capturedAt || 0) - minuteStart)
                    }))
                    .sort((a, b) => a.delta - b.delta);
                if (ranked.length === 1 || ranked[0].delta < ranked[1].delta) chosen = ranked[0];
            }
        } else if (candidates.length === 1) {
            chosen = candidates[0];
        }

        if (!chosen) return null;
        usedKeys.add(recentCaptureAdditionKey(chosen.entry, chosen.index));
        return {
            ...chosen.descriptor,
            capturedAt: Number(chosen.entry.seenAt || chosen.descriptor.capturedAt || Date.now())
        };
    }

    function captureLogRowsFingerprint(rows) {
        return rows.slice(0, 4).map((row, index) => {
            const text = String(row?.textContent || '').replace(/\s+/g, ' ').trim();
            return `${index}:${text}`;
        }).join('||') + `|count:${rows.length}`;
    }

    function scheduleCaptureLogFreshSync() {
        if (captureLogSyncPromise) return captureLogSyncPromise;
        captureLogSyncPromise = (async () => {
            for (const delay of CAPTURE_LOG_SYNC_DELAYS_MS) {
                if (delay) await new Promise(resolve => setTimeout(resolve, delay));
                await refreshLatestPokemon(true).catch(() => []);
                enhanceCaptureLogQuality(latestPokemon, { skipFreshSync: true });
            }
        })().finally(() => {
            captureLogSyncPromise = null;
        });
        return captureLogSyncPromise;
    }

    function scheduleBackgroundCaptureSync() {
        // No depende del DOM ni de que Capture Log exista. Cada señal de captura
        // programa varias instantáneas breves porque el alta del Pokémon puede llegar
        // unas décimas después del catch-result.
        CAPTURE_BACKGROUND_SYNC_DELAYS_MS.forEach(delay => {
            setTimeout(() => {
                refreshLatestPokemon(true)
                    .then(() => {
                        resolvePendingCapturesFromRecentAdditions();
                    })
                    .catch(() => {});
            }, delay);
        });
    }

    function captureMatchScore(hint, pokemon) {
        if (!hint) return 0;
        let score = 0;
        const hintId = String(hint.id || '');
        const pokemonId = capturePokemonId(pokemon);
        if (hintId && pokemonId) score += hintId === pokemonId ? 20 : -20;
        const hintSpecies = String(hint.speciesId || '');
        const pokemonSpecies = capturePokemonSpeciesId(pokemon);
        if (hintSpecies && pokemonSpecies) score += hintSpecies === pokemonSpecies ? 6 : -6;
        const hintName = normalizePartyPokemonName(hint.name);
        const pokemonName = normalizePartyPokemonName(capturePokemonName(pokemon));
        if (hintName && pokemonName) score += hintName === pokemonName ? 8 : -8;
        if (Number.isFinite(Number(hint.ivTotal))) {
            const pokemonIv = getCaptureIvTotal(pokemon, null);
            if (Number.isFinite(Number(pokemonIv))) score += Number(hint.ivTotal) === Number(pokemonIv) ? 8 : -8;
        }
        return score;
    }

    function pendingAdditionScore(pending, addition) {
        const descriptor = addition?.descriptor;
        if (!descriptor) return -Infinity;
        const age = Math.abs(Number(addition.seenAt || 0) - Number(pending?.at || 0));
        if (!Number.isFinite(age) || age > CAPTURE_RECENT_ADDITION_MAX_AGE_MS) return -Infinity;
        if (!pending?.descriptor) return 0;
        return captureMatchScore(pending.descriptor, descriptor);
    }

    function resolvePendingCapturesFromRecentAdditions() {
        purgePendingCaptureResults();
        purgeRecentPokemonAdditions();
        if (!pendingCaptureResults.length || !recentPokemonAdditions.length) return;

        const unresolved = [];
        for (const pending of pendingCaptureResults) {
            const ranked = recentPokemonAdditions
                .map((addition, index) => ({ addition, index, score: pendingAdditionScore(pending, addition) }))
                .filter(candidate => Number.isFinite(candidate.score) && candidate.score > -20)
                .sort((a, b) => b.score - a.score || Math.abs(a.addition.seenAt - pending.at) - Math.abs(b.addition.seenAt - pending.at));

            let chosen = null;
            if (pending.descriptor) {
                if (ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score)) chosen = ranked[0];
            } else if (ranked.length === 1) {
                chosen = ranked[0];
            } else if (ranked.length > 1) {
                // Sin datos del catch-result solo aceptamos una adición inequívocamente
                // más cercana en el tiempo; nunca elegimos un Pokémon al azar.
                const firstDelta = Math.abs(ranked[0].addition.seenAt - pending.at);
                const secondDelta = Math.abs(ranked[1].addition.seenAt - pending.at);
                if (firstDelta + 1000 < secondDelta) chosen = ranked[0];
            }

            if (!chosen) {
                unresolved.push(pending);
                continue;
            }

            const descriptor = { ...chosen.addition.descriptor, capturedAt: pending.at };
            rememberCaptureQualityEntry(descriptor);
            recentPokemonAdditions.splice(chosen.index, 1);
        }
        pendingCaptureResults = unresolved;
    }

    function rememberCaptureResult(message) {
        purgePendingCaptureResults();
        purgeRecentPokemonAdditions();
        if (message?.success !== true) return false;

        const at = captureTimestampValue(message) || Date.now();
        const descriptor = findCaptureDescriptorDeep(message, { maxDepth: 5 });
        if (descriptor) {
            descriptor.capturedAt = captureTimestampValue(message, descriptor) || at;
            rememberCaptureQualityEntry(descriptor);
        }

        pendingCaptureResults.push({
            at,
            descriptor,
            speciesName: String(message?.speciesName || descriptor?.name || '').trim()
        });
        // Respaldo para clientes donde `pokes` pueda adelantarse al resultado.
        resolvePendingCapturesFromRecentAdditions();
        return true;
    }

    // El auditor del juego confirma que, tras un catch-result exitoso, el servidor
    // envía un `poke-delta` con el Pokémon capturado COMPLETO: ID, IV y Quality.
    // Esta es la fuente canónica para Capture Log; no requiere abrir la ventana,
    // comparar listas completas ni adivinar por nombre + IV.
    function rememberCapturedPokemonDelta(message) {
        const pokemon = message?.poke;
        const descriptor = captureDescriptor(pokemon, Date.now());
        if (!descriptor) return false;

        purgePendingCaptureResults();
        const descriptorName = normalizePartyPokemonName(descriptor.name);
        const descriptorSpeciesId = String(descriptor.speciesId || '');

        let pendingIndex = -1;
        for (let index = pendingCaptureResults.length - 1; index >= 0; index -= 1) {
            const pending = pendingCaptureResults[index];
            const pendingName = normalizePartyPokemonName(pending?.speciesName || pending?.descriptor?.name || '');
            const pendingSpeciesId = String(pending?.descriptor?.speciesId || '');
            const nameMatches = !pendingName || !descriptorName || pendingName === descriptorName;
            const speciesMatches = !pendingSpeciesId || !descriptorSpeciesId || pendingSpeciesId === descriptorSpeciesId;
            if (nameMatches && speciesMatches) {
                pendingIndex = index;
                break;
            }
        }

        // Un poke-delta también puede usarse para otros cambios de Pokémon.
        // Sin un catch-result exitoso pendiente no lo tratamos como captura.
        if (pendingIndex < 0) return false;

        const pending = pendingCaptureResults.splice(pendingIndex, 1)[0];
        descriptor.capturedAt = Number(pending?.at) || Date.now();
        rememberCaptureQualityEntry(descriptor);

        // Mantener el buffer reciente ayuda a pintar una ventana que ya estuviera
        // abierta sin esperar al siguiente `pokes`.
        purgeRecentPokemonAdditions();
        const seenAt = Date.now();
        const existingRecent = recentPokemonAdditions.findIndex(entry =>
            String(entry?.descriptor?.id || '') === String(descriptor.id || '')
        );
        const recentEntry = { seenAt, descriptor: { ...descriptor } };
        if (existingRecent >= 0) recentPokemonAdditions.splice(existingRecent, 1, recentEntry);
        else recentPokemonAdditions.push(recentEntry);

        // Actualizar también la instantánea local sin solicitar los ~400 Pokémon.
        if (Array.isArray(latestPokemon)) {
            const id = capturePokemonId(pokemon);
            const currentIndex = latestPokemon.findIndex(current => capturePokemonId(current) === id);
            if (currentIndex >= 0) latestPokemon[currentIndex] = pokemon;
            else latestPokemon = [...latestPokemon, pokemon];
            lastPokemonRefreshAt = Date.now();
        }

        setTimeout(() => {
            enhancePartyQuality();
            enhanceCaptureLogQuality();
        }, 0);
        return true;
    }

    function reconcileCapturedPokemon(previousList, nextList) {
        purgePendingCaptureResults();
        // Fallback únicamente: normalmente el `poke-delta` ya habrá consumido la captura.
        if (!pendingCaptureResults.length || !Array.isArray(nextList)) return;

        const previousIds = new Set((Array.isArray(previousList) ? previousList : []).map(capturePokemonId).filter(Boolean));
        let added = Array.isArray(previousList)
            ? nextList.filter(pokemon => {
                const id = capturePokemonId(pokemon);
                return id && !previousIds.has(id) && captureQualityValue(pokemon) !== null;
            })
            : [];

        if (added.length) {
            const unresolved = [];
            for (const pending of pendingCaptureResults) {
                if (!added.length) { unresolved.push(pending); continue; }
                let chosenIndex = -1;
                if (pending.descriptor) {
                    const ranked = added
                        .map((pokemon, index) => ({ index, score: captureMatchScore(pending.descriptor, pokemon) }))
                        .sort((a, b) => b.score - a.score);
                    if (ranked.length && ranked[0].score >= 0 && (ranked.length === 1 || ranked[0].score > ranked[1].score)) {
                        chosenIndex = ranked[0].index;
                    }
                } else if (added.length === 1) {
                    chosenIndex = 0;
                }

                if (chosenIndex < 0) { unresolved.push(pending); continue; }
                const pokemon = added.splice(chosenIndex, 1)[0];
                const descriptor = captureDescriptor(pokemon, pending.at);
                if (descriptor) {
                    descriptor.capturedAt = pending.at;
                    rememberCaptureQualityEntry(descriptor);
                }
            }
            pendingCaptureResults = unresolved;
        }

        // Segundo intento usando el buffer de adiciones, necesario cuando los eventos
        // `pokes` y `catch-result` llegan en el orden contrario.
        resolvePendingCapturesFromRecentAdditions();
    }

    async function refreshLatestPokemon(force = false) {
        const now = Date.now();
        if (!force && Array.isArray(latestPokemon) && latestPokemon.length && now - lastPokemonRefreshAt < 30000) {
            return latestPokemon;
        }
        if (pokemonRefreshPromise) return pokemonRefreshPromise;

        pokemonRefreshPromise = (async () => {
            const socketReady = await waitForGameSocket(3000);
            if (!socketReady) return Array.isArray(latestPokemon) ? latestPokemon : [];
            const list = await requestGameEvent('pokes', 'pokes-get', null, 3000).catch(() => []);
            if (Array.isArray(list) && list.length) {
                latestPokemon = list;
                lastPokemonRefreshAt = Date.now();
                setTimeout(() => {
                    enhancePartyQuality();
                    enhanceCaptureLogQuality(list);
                }, 0);
            }
            return Array.isArray(latestPokemon) ? latestPokemon : [];
        })().finally(() => {
            pokemonRefreshPromise = null;
        });
        return pokemonRefreshPromise;
    }

    function findNativeCaptureDescriptor(row, rowName, rowIv) {
        const roots = [];
        for (const key of Object.keys(row || {})) {
            if (key.startsWith('__reactProps$')) roots.push(row[key]);
            if (key.startsWith('__reactFiber$')) {
                let fiber = row[key];
                for (let depth = 0; fiber && depth < 6; depth += 1, fiber = fiber.return) {
                    if (fiber.memoizedProps) roots.push(fiber.memoizedProps);
                    if (fiber.pendingProps && fiber.pendingProps !== fiber.memoizedProps) roots.push(fiber.pendingProps);
                }
            }
        }
        for (const root of roots) {
            const descriptor = findCaptureDescriptorDeep(root, { rowName, rowIv, maxDepth: 4 });
            if (descriptor) return descriptor;
        }
        return null;
    }

    function findStoredCaptureDescriptor(rowName, rowIv, rowTimestamp, usedKeys) {
        const candidates = captureQualityHistory.map((entry, index) => ({ entry, index })).filter(({ entry }) => {
            if (!entry || !Number.isFinite(Number(entry.quality))) return false;
            const name = normalizePartyPokemonName(entry.name);
            if (rowName && name && !rowName.includes(name)) return false;
            if (Number.isFinite(Number(rowIv)) && Number.isFinite(Number(entry.ivTotal)) && Number(entry.ivTotal) !== Number(rowIv)) return false;
            const key = entry.id ? `id:${entry.id}` : `idx:${index}:${entry.capturedAt}`;
            return !usedKeys.has(key);
        });
        if (!candidates.length) return null;

        let chosen = null;
        if (Number.isFinite(Number(rowTimestamp))) {
            const minuteStart = Number(rowTimestamp);
            const minuteEnd = minuteStart + 60000;
            const sameMinute = candidates
                .filter(candidate => Number(candidate.entry.capturedAt || 0) >= minuteStart && Number(candidate.entry.capturedAt || 0) < minuteEnd)
                .sort((a, b) => Number(b.entry.capturedAt || 0) - Number(a.entry.capturedAt || 0));

            // El Capture Log está ordenado de más reciente a más antiguo. Si hay varias
            // capturas iguales dentro del mismo minuto, usedKeys hace que se consuman
            // en ese mismo orden sin confundirlas.
            if (sameMinute.length) {
                chosen = sameMinute[0];
            } else {
                const ranked = candidates
                    .map(candidate => ({
                        ...candidate,
                        delta: Math.abs(Number(candidate.entry.capturedAt || 0) - minuteStart)
                    }))
                    .filter(candidate => candidate.delta <= CAPTURE_ROW_MATCH_MAX_DELTA_MS)
                    .sort((a, b) => a.delta - b.delta);
                if (ranked.length === 1 || (ranked.length > 1 && ranked[0].delta < ranked[1].delta)) {
                    chosen = ranked[0];
                }
            }

            // Si la fila tiene hora y ningún registro reciente coincide, NO hacemos
            // fallback a un historial antiguo con el mismo nombre + IV.
            if (!chosen) return null;
        } else if (candidates.length === 1) {
            chosen = candidates[0];
        }

        if (!chosen) return null;
        const key = chosen.entry.id ? `id:${chosen.entry.id}` : `idx:${chosen.index}:${chosen.entry.capturedAt}`;
        usedKeys.add(key);
        return chosen.entry;
    }

    function findOwnedCaptureDescriptor(owned, rowName, rowIv, rowTimestamp) {
        const matches = owned.filter(pokemon => {
            const name = normalizePartyPokemonName(capturePokemonName(pokemon));
            const iv = getCaptureIvTotal(pokemon, null);
            return name && rowName.includes(name) && Number(iv) === Number(rowIv) && captureQualityValue(pokemon) !== null;
        });
        if (matches.length === 1) return captureDescriptor(matches[0], rowTimestamp || Date.now());
        if (matches.length > 1 && Number.isFinite(Number(rowTimestamp))) {
            const timed = matches.map(pokemon => ({ pokemon, timestamp: captureTimestampValue(pokemon) }))
                .filter(entry => Number.isFinite(Number(entry.timestamp)))
                .map(entry => ({ ...entry, delta: Math.abs(Number(entry.timestamp) - Number(rowTimestamp)) }))
                .filter(entry => entry.delta <= 120000)
                .sort((a, b) => a.delta - b.delta);
            if (timed.length === 1 || (timed.length > 1 && timed[0].delta < timed[1].delta)) {
                return captureDescriptor(timed[0].pokemon, timed[0].timestamp);
            }
        }
        return null;
    }

    function clearCaptureQualityRow(row) {
        row.classList.remove('script-capture-quality-row');
        delete row.dataset.scriptCaptureQuality;
        delete row.dataset.scriptCaptureQualitySource;
        row.style.removeProperty('--script-capture-quality-color');
    }

    function enhanceCaptureLogQuality(pokemonList = latestPokemon, { skipFreshSync = false } = {}) {
        const owned = Array.isArray(pokemonList) ? pokemonList : [];
        const windows = Array.from(document.querySelectorAll('[role="dialog"],.win-window,.window,[class*="window"]'))
            .filter(element => /capture\s*log|registro\s+de\s+capturas?/i.test(String(element.textContent || '').slice(0, 1200)));
        if (!windows.length) return;

        if (!owned.length) {
            refreshLatestPokemon(false).catch(() => {});
        }

        let shouldFreshSync = false;

        windows.forEach(windowElement => {
            windowElement.classList.add('script-capture-log-window');
            const rows = Array.from(windowElement.querySelectorAll('tr,li,[class*="row"]'))
                .filter(row => /IV\s*:?\s*\d+/i.test(row.textContent || ''));

            const fingerprint = captureLogRowsFingerprint(rows);
            const previousState = captureLogWindowState.get(windowElement);
            if (!skipFreshSync && (!previousState || previousState.fingerprint !== fingerprint)) {
                shouldFreshSync = true;
            }
            captureLogWindowState.set(windowElement, { fingerprint, rowCount: rows.length, seenAt: Date.now() });

            const usedRecentKeys = new Set();
            const usedHistoryKeys = new Set();

            rows.forEach(row => {
                const ivTotal = getCaptureIvTotal(null, row);
                const rowName = normalizePartyPokemonName(row.textContent || '');
                const rowTimestamp = parseCaptureRowTimestamp(row);

                let descriptor = findNativeCaptureDescriptor(row, rowName, ivTotal);
                let source = 'native';

                if (descriptor) {
                    descriptor.capturedAt = rowTimestamp || descriptor.capturedAt;
                    rememberCaptureQualityEntry(descriptor);
                } else {
                    descriptor = findRecentCaptureDescriptor(rowName, ivTotal, rowTimestamp, usedRecentKeys);
                    source = 'recent';
                    if (descriptor) rememberCaptureQualityEntry(descriptor);
                }

                if (!descriptor) {
                    descriptor = findStoredCaptureDescriptor(rowName, ivTotal, rowTimestamp, usedHistoryKeys);
                    source = 'history';
                }

                if (!descriptor) {
                    descriptor = findOwnedCaptureDescriptor(owned, rowName, ivTotal, rowTimestamp);
                    source = 'owned';
                    if (descriptor && rowTimestamp) {
                        descriptor.capturedAt = rowTimestamp;
                        rememberCaptureQualityEntry(descriptor);
                    }
                }

                if (!descriptor || !Number.isFinite(Number(descriptor.quality))) {
                    clearCaptureQualityRow(row);
                    return;
                }

                const quality = Number(descriptor.quality);
                const info = getPokemonQualityInfo(quality);
                if (!info) {
                    clearCaptureQualityRow(row);
                    return;
                }
                const potential = getPokemonPotentialPercent(quality, ivTotal, descriptor.shiny);
                row.dataset.scriptCaptureQuality = `Q ×${quality.toFixed(2)}${potential === null ? '' : ` · ${potential}%`}`;
                row.dataset.scriptCaptureQualitySource = source;
                row.style.setProperty('--script-capture-quality-color', info.color);
                row.classList.add('script-capture-quality-row');
            });
        });

        // La aparición/cambio de filas del Capture Log es ahora una señal primaria de
        // captura. Pedimos varias instantáneas frescas para cubrir el pequeño desfase
        // entre la fila visual y la incorporación real del Pokémon a `pokes`.
        if (shouldFreshSync) {
            scheduleCaptureLogFreshSync().catch(() => {});
        }
    }

    // Ventana nativa «Mercado Global» del juego (distinta de la versión portátil
    // creada por este script): cada fila es .mkt2-trow.clickable y la celda
    // .mkt2-tc--meta contiene el nivel, los IV y un span con «color:» en línea
    // que incluye «<Tier> ×<calidad>». Se recalcula en cada ciclo porque el juego
    // puede reutilizar las filas al cambiar de página u ordenación.
    function enhanceNativeGlobalMarketQuality() {
        const metaCells = document.querySelectorAll('.mkt2-trow.clickable .mkt2-tc--meta');
        if (!metaCells.length) return;
        if (!preferenceEnabled(STORAGE_SHOW_QUALITY_POTENTIAL)) {
            metaCells.forEach(meta => meta.querySelector('.script-gm-potential')?.remove());
            return;
        }
        metaCells.forEach(meta => {
            const qualitySpan = meta.querySelector('span[style*="color"]');
            const oldBadge = qualitySpan?.querySelector('.script-gm-potential');
            // Lee únicamente los nodos de texto originales del juego e ignora nuestro
            // indicador, que de otro modo alteraría textContent y rompería la expresión
            // regular, provocando un bucle de eliminación y recreación.
            const rawQualityText = qualitySpan
                ? Array.from(qualitySpan.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('')
                : '';
            const qualityMatch = rawQualityText.match(/(\d+(?:[.,]\d+)?)\s*$/);
            const ivMatch = meta.textContent.match(/IV\s*(\d+)/i);
            if (!qualitySpan || !qualityMatch || !ivMatch) { oldBadge?.remove(); return; }
            const quality = Number(qualityMatch[1].replace(',', '.'));
            const ivTotal = Number(ivMatch[1]);
            const nameText = meta.closest('.mkt2-trow')?.querySelector('.mkt2-tc--name')?.textContent || '';
            const isShiny = /^\s*shiny\b/i.test(nameText);
            const potential = getPokemonPotentialPercent(quality, ivTotal, isShiny);
            if (potential === null) { oldBadge?.remove(); return; }
            const badgeText = ` (${potential}%)`;
            if (oldBadge) {
                if (oldBadge.textContent !== badgeText) oldBadge.textContent = badgeText;
                return;
            }
            // Usa el color exacto aplicado por el juego al tier (qualitySpan.style.color)
            // en lugar del mapa interno, para que el indicador coincida con el color real.
            const badge = document.createElement('span');
            badge.className = 'script-gm-potential';
            badge.style.cssText = `font-weight:800;color:${qualitySpan.style.color};`;
            badge.textContent = badgeText;
            qualitySpan.appendChild(badge);
        });
    }

    function removeLegacyPokedexEnhancements() {
        localStorage.removeItem('script_dex_filter_v1');
        localStorage.removeItem('script_dex_sort_value_v1');
        localStorage.removeItem('script_flint_sell_route_v1');
        document.querySelectorAll('.dex-script-controls').forEach(element => element.remove());
        document.querySelectorAll('.dex-cell[class~="dex-hidden"]').forEach(element => element.classList.remove('dex-hidden'));
    }

    function runDOMEnhancements() {
        injectUtilityDockButtons();
        if (document.querySelector('.cfg-window')) injectConfigTab();
        applyChatState();
        injectHuntShopLauncher();
        if (findNativeMarkWindow() && isMarkEnhancementsActive()) injectShopEnhancements();
        if (document.querySelector('.ball-window')) injectHuntBallEnhancements(document.querySelector('.ball-window'));
        if (document.querySelector('.ha-window:not(.ha-compare-modal)')) trackHuntAnalyzer();
        if (document.querySelector('.inv-window')) enhanceInventoryWindow();
        enhancePartyQuality();
        enhanceCaptureLogQuality();
        enhanceNativeGlobalMarketQuality();
    }

    let domCheckTimeout = null;
    const observer = new MutationObserver(() => {
        if (domCheckTimeout) return;
        domCheckTimeout = setTimeout(() => {
            domCheckTimeout = null;
            runDOMEnhancements();
        }, 150);
    });

    function initializeDOMEnhancements() {
        removeLegacyPokedexEnhancements();
        observer.observe(document.body, { childList: true, subtree: true });
        runDOMEnhancements();

        // El juego puede crear o reemplazar el dock después de cargar la página.
        // Estos reintentos solo restauran Tiendas/Depósito cuando faltan.
        [300, 900, 1800, 3500].forEach(delay => {
            setTimeout(injectUtilityDockButtons, delay);
        });

        // Hidrata la colección también tras una recarga completa. Esto hace que las
        // mejoras de Quality no dependan de que ocurra una nueva captura para recibir
        // el primer evento `pokes`.
        [500, 1800, 4500].forEach(delay => {
            setTimeout(() => refreshLatestPokemon(false).catch(() => {}), delay);
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeDOMEnhancements, { once: true });
    } else {
        initializeDOMEnhancements();
    }
    console.info(`[PIW-QOL ES] v${SCRIPT_BUILD} cargado · Quality de capturas se registra en segundo plano aunque Capture Log esté cerrado.`);
})();

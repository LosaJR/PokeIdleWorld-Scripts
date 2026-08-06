// ==UserScript==
// @name         Poke Idle World - Quality of Life (PIW-QOL ES)
// @namespace    http://tampermonkey.net/
// @version      9.10.24
// @description  Mejoras de calidad de vida en español, sin modificar el mapa y con candados de venta configurables.
// @author       Desjunior (JulianoCLI)
// @match        https://poke.idleworld.online/play
// @grant        none
// @run-at       document-start
// @require      https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js
// @updateURL    https://raw.githubusercontent.com/LosaJR/PokeIdleWorld-Scripts/main/dist/piw-qol-es.meta.js
// @downloadURL  https://raw.githubusercontent.com/LosaJR/PokeIdleWorld-Scripts/main/dist/piw-qol-es.user.js
// ==/UserScript==

(function () {
    'use strict';

    const baseURL = 'https://raw.githubusercontent.com/LosaJR/PokeIdleWorld-Scripts/main/dist/piw-qol-es-parts';
    let encoded = '';

    try {
        for (let index = 1; index <= 9; index += 1) {
            const part = String(index).padStart(2, '0');
            const request = new XMLHttpRequest();
            request.open('GET', `${baseURL}/part${part}.b64?v=9.10.24`, false);
            request.send(null);
            if (request.status < 200 || request.status >= 300) {
                throw new Error(`No se pudo cargar el bloque ${part} (HTTP ${request.status}).`);
            }
            encoded += request.responseText.replace(/\s+/g, '');
        }

        if (typeof pako?.ungzip !== 'function') {
            throw new Error('El descompresor no está disponible.');
        }

        const compressed = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
        const source = new TextDecoder().decode(pako.ungzip(compressed));
        (0, eval)(source);
    } catch (error) {
        console.error('[PIW-QOL] No se pudo cargar el paquete 9.10.24.', error);
    }
})();

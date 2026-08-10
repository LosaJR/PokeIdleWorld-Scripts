from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return (ROOT / path).read_text(encoding='utf-8')


def save(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def need_replace(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f'{label}: no se encontró el texto esperado')
    return text.replace(old, new, 1)


def need_sub(text, pattern, repl, label, flags=0):
    if isinstance(repl, str) and repl in text:
        return text
    next_text, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{label}: patrón no encontrado o ambiguo ({count})')
    return next_text


def bump_all(text, old, new, label, minimum=1):
    if new in text and old not in text:
        return text
    count = text.count(old)
    if count < minimum:
        raise RuntimeError(f'{label}: solo {count} coincidencias de {old}')
    return text.replace(old, new)


def prepend_changelog(path, heading, body):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if heading in text:
        return
    lines = text.splitlines()
    if not lines or not lines[0].startswith('# '):
        raise RuntimeError(f'{path}: cabecera no reconocida')
    rest = '\n'.join(lines[1:]).lstrip('\n')
    out = lines[0] + '\n\n' + heading + '\n\n' + body.strip() + '\n'
    if rest:
        out += '\n' + rest.rstrip() + '\n'
    p.write_text(out, encoding='utf-8')


# ---------------------------------------------------------------------------
# Hunt Intelligence 1.1.27
# ---------------------------------------------------------------------------
hunt_path = 'src/pokegrid-hunt-intelligence.user.js'
h = load(hunt_path)
h = bump_all(h, '1.1.26', '1.1.27', 'Hunt versión', 8)
h = bump_all(h, 'V1126', 'V1127', 'Hunt guardas', 5)

helper_old = r'''  function rowExpectedKphForCalibration(row) {
    if (Number.isFinite(Number(row?.expectedKphAverage)) && Number(row.expectedKphAverage) > 0) {
      return Number(row.expectedKphAverage);
    }
    if (row?.levelingSample !== true && Number.isFinite(Number(row?.expectedKph)) && Number(row.expectedKph) > 0) {
      return Number(row.expectedKph);
    }
    return 0;
  }
'''
helper_new = helper_old + r'''
  function rowExpectedXphForCalibration(row) {
    if (Number.isFinite(Number(row?.expectedXphAverage)) && Number(row.expectedXphAverage) > 0) {
      return Number(row.expectedXphAverage);
    }
    if (row?.levelingSample !== true && Number.isFinite(Number(row?.expectedXph)) && Number(row.expectedXph) > 0) {
      return Number(row.expectedXph);
    }
    return 0;
  }
'''
h = need_replace(h, helper_old, helper_new, 'Hunt helper XP')
h = need_replace(h, "    let factor = 1;\n    let kph = 0;", "    let factor = 1;\n    let xpFactor = 1;\n    let kph = 0;", 'Hunt variable xpFactor')

xp_old = r'''      const currentMultiplier = (vipActive?VIP_MULT:1)*(dailyBoosted?DAILY_MULT:1);
      if (finite(expectedXph) > 0) {
        baseXph = Math.max(0, finite(expectedXph) / currentMultiplier * factor);
      } else {
'''
xp_new = r'''      const currentMultiplier = (vipActive?VIP_MULT:1)*(dailyBoosted?DAILY_MULT:1);
      if (finite(expectedXph) > 0) {
        let weightedXpFactor = 0;
        let totalXpWeight = 0;
        for (const row of rows) {
          const expectedXphRow = rowExpectedXphForCalibration(row);
          const rowMultiplier = (row.vipActive?VIP_MULT:1)*(row.dailyBoosted?DAILY_MULT:1);
          const expectedBaseXph = expectedXphRow > 0 ? expectedXphRow / rowMultiplier : 0;
          if (!(expectedBaseXph > 0) || !(finite(row.cleanBaseXph) > 0)) continue;
          const refLevel = rowReferenceLevel(row);
          const distance = Math.max(0, level - refLevel);
          const proximity = clamp(1 - (distance / Math.max(1, levelBand)) * 0.50, 0.50, 1);
          const weight = SAMPLE_WINDOW_SECONDS * proximity;
          const rowXpFactor = clamp(finite(row.cleanBaseXph) / expectedBaseXph, 0.60, 1.60);
          weightedXpFactor += rowXpFactor * weight;
          totalXpWeight += weight;
        }
        xpFactor = totalXpWeight ? weightedXpFactor / totalXpWeight : factor;
        baseXph = Math.max(0, finite(expectedXph) / currentMultiplier * xpFactor);
      } else {
'''
h = need_replace(h, xp_old, xp_new, 'Hunt calibración XP')
h = need_replace(h, "      levelBand,\n      factor,\n      historicalKph,", "      levelBand,\n      factor,\n      speedFactor:factor,\n      xpFactor,\n      historicalKph,", 'Hunt salida factores')

h = need_sub(
    h,
    r"    const isAccessible = hunt => requiredLevel\(hunt\) <= Math\.max\(\n      1,\n      finite\(huntResult\?\.accessLevel, huntAccessLevel\(huntResult\?\.lead\), 1\)\n    \);",
    "    const isAccessible = hunt => requiredLevel(hunt) <= Math.max(\n      1,\n      finite(huntResult?.accessLevel, huntResult?.lead?.level, 1)\n    );",
    'Hunt No capturados'
)

map_old = r'''  function openCollapsedFromMap(){
    panelCollapsed=true;
    activeTab='hunt';
    revealManagedPanel({full:false});
    loadHunt(false);
  }
'''
map_new = r'''  function openCollapsedFromMap(){
    panelCollapsed=true;
    activeTab='hunt';
    if (revealManagedPanel({full:false}) && uiWindow) uiWindow.setMinimized(true);
    loadHunt(false);
  }
'''
h = need_replace(h, map_old, map_new, 'Hunt apertura Mapa')
h = h.replace('XP/h personal', 'XP/h real histórico')
h = h.replace('<div class="pg-u-col">Tu XP/h</div>', '<div class="pg-u-col">Tu XP/h estimada</div>')
save(hunt_path, h)


# ---------------------------------------------------------------------------
# Boss Damage Meter 1.0.6
# ---------------------------------------------------------------------------
boss_path = 'src/pokegrid-boss-damage-meter.user.js'
b = load(boss_path)
b = bump_all(b, '1.0.5', '1.0.6', 'Boss versión', 3)
b = bump_all(b, 'V105', 'V106', 'Boss guardas', 2)
b = need_replace(b, "  const BOSS_BOOT_REFRESH_COUNT = 12;\n", "  const BOSS_BOOT_REFRESH_COUNT = 12;\n  const FINISH_AUTO_CLOSE_MS = 4500;\n", 'Boss timeout cierre')
b = need_replace(b, "  let panelClosedForRun = false;\n", "  let panelClosedForRun = false;\n  let finishCloseTimer = null;\n", 'Boss timer variable')
b = need_replace(b, "    lastFieldSeq = null;\n    panelClosedForRun = false;\n    ensureUi();", "    lastFieldSeq = null;\n    panelClosedForRun = false;\n    if (finishCloseTimer) clearTimeout(finishCloseTimer);\n    finishCloseTimer = null;\n    ensureUi();", 'Boss reinicio timer')

b = need_sub(
    b,
    r"  function finishRun\(outcome = 'won'\) \{.*?\n  \}\n\n  function processFieldInit",
    r'''  function finishRun(outcome = 'won') {
    if (!run || run.outcome) return;
    run.outcome = String(outcome || 'won');
    run.finishedAt = nowMs();
    const finishedAt = run.finishedAt;
    render();
    heartbeat();
    if (finishCloseTimer) clearTimeout(finishCloseTimer);
    finishCloseTimer = setTimeout(() => {
      finishCloseTimer = null;
      if (run?.outcome && run.finishedAt === finishedAt) closePanelForRun();
    }, FINISH_AUTO_CLOSE_MS);
    console.info(`[Boss Damage Meter] Run finalizada: ${run.bossName} · daño ${run.totalDamage}/${run.maxBossHp}.`);
  }

  function processFieldInit''',
    'Boss finishRun',
    re.S
)
b = b.replace('        closable: false,', '        closable: true,', 1)
b = need_replace(b, "      usingBridgeUi = true;\n\n      if (fallback) fallback.remove();", "      usingBridgeUi = true;\n      uiWindow.panel.addEventListener('click', event => {\n        const close = event.target.closest?.('.pg-ui-header .pg-ui-button');\n        if (close?.title === 'Cerrar') panelClosedForRun = true;\n      }, true);\n\n      if (fallback) fallback.remove();", 'Boss X Bridge')
b = need_replace(b, "        <button type=\"button\" data-maximize title=\"Maximizar\">□</button>\n", "        <button type=\"button\" data-maximize title=\"Maximizar\">□</button>\n        <button type=\"button\" data-close title=\"Cerrar\">×</button>\n", 'Boss X fallback')
b = need_replace(b, "    panel.querySelector('[data-maximize]')?.addEventListener('click', event => {\n      event.preventDefault();\n      toggleMaximize(panel);\n    });\n    return panel;", "    panel.querySelector('[data-maximize]')?.addEventListener('click', event => {\n      event.preventDefault();\n      toggleMaximize(panel);\n    });\n    panel.querySelector('[data-close]')?.addEventListener('click', event => {\n      event.preventDefault();\n      closePanelForRun();\n    });\n    return panel;", 'Boss handler X')

open_old = r'''  function openPanel(force = false) {
    ensureUi();
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    if (!force && panelClosedForRun) return;
    if (usingBridgeUi && uiWindow) uiWindow.open();
    else panel.hidden = false;
    render();
  }
'''
open_new = r'''  function closePanelForRun() {
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
'''
b = need_replace(b, open_old, open_new, 'Boss close helper')
b = need_sub(
    b,
    r"    close: \(\) => \{\n      const panel = document\.getElementById\(PANEL_ID\);\n      if \(usingBridgeUi && uiWindow\) uiWindow\.close\(\);\n      else if \(panel\) panel\.hidden = true;\n      panelClosedForRun = true;\n      return true;\n    \},",
    "    close: () => closePanelForRun(),",
    'Boss API close'
)
save(boss_path, b)


# ---------------------------------------------------------------------------
# PIW-QOL ES 9.10.28
# ---------------------------------------------------------------------------
qol_path = 'src/piw-qol-es.user.js'
q = load(qol_path)
q = bump_all(q, '9.10.27', '9.10.28', 'QOL versión', 2)
q = need_replace(q, """        if (message?.type === 'pokes') {
            latestPokemon = message.list || [];
            setTimeout(enhancePartyQuality, 0);
        }
""", """        if (message?.type === 'pokes') {
            latestPokemon = message.list || [];
            setTimeout(() => {
                enhancePartyQuality();
                enhanceCaptureLogQuality();
            }, 0);
        }
""", 'QOL actualización pokes')

css_anchor = r'''        .phud-party > button.phud-mon .script-party-quality {
            display: inline-block !important;
            margin-left: 5px !important;
            font-size: 10px !important;
            font-weight: 800 !important;
            line-height: 1 !important;
            vertical-align: middle !important;
            white-space: nowrap !important;
        }
'''
css_extra = css_anchor + r'''        .script-capture-quality-row { position: relative !important; padding-right: 86px !important; }
        .script-capture-quality-row::after {
            content: attr(data-script-capture-quality);
            position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
            color: var(--script-capture-quality-color, #90cdf4);
            font-size: 10px; font-weight: 900; white-space: nowrap; pointer-events: none;
        }
'''
q = need_replace(q, css_anchor, css_extra, 'QOL CSS Capture Log')

old_capture_pattern = r'''    // El Capture Log se conserva completamente nativo\. Las versiones anteriores
    // añadían o sustituían texto dentro de las filas y eso podía interferir con
    // los filtros y ordenaciones internos por calidad e IV\.
    function removeCaptureLogEnhancements\(\) \{.*?\n    \}
'''
new_capture = r'''    // Capture Log: la calidad se dibuja con ::after a partir de data-attributes.
    // No se inserta texto en los nodos nativos, por lo que filtros y ordenaciones conservan su comportamiento.
    function enhanceCaptureLogQuality(pokemonList = latestPokemon) {
        const owned = Array.isArray(pokemonList) ? pokemonList : [];
        const windows = Array.from(document.querySelectorAll('[role="dialog"],.win-window,.window,[class*="window"]'))
            .filter(element => /capture\s*log|registro\s+de\s+capturas?/i.test(String(element.textContent || '').slice(0, 1200)));
        if (!windows.length) return;

        windows.forEach(windowElement => {
            windowElement.classList.add('script-capture-log-window');
            const rows = Array.from(windowElement.querySelectorAll('tr,li,[class*="row"]'))
                .filter(row => /IV\s*:?\s*\d+/i.test(row.textContent || ''));

            rows.forEach(row => {
                const ivTotal = getCaptureIvTotal(null, row);
                const rowName = normalizePartyPokemonName(row.textContent || '');
                const matches = owned.filter(pokemon => {
                    const name = normalizePartyPokemonName(pokemon?.name);
                    const iv = getCaptureIvTotal(pokemon, null);
                    return name && rowName.includes(name) && Number(iv) === Number(ivTotal);
                });

                if (matches.length !== 1 || !Number.isFinite(Number(matches[0]?.quality))) {
                    row.classList.remove('script-capture-quality-row');
                    delete row.dataset.scriptCaptureQuality;
                    row.style.removeProperty('--script-capture-quality-color');
                    return;
                }

                const pokemon = matches[0];
                const quality = Number(pokemon.quality);
                const info = getPokemonQualityInfo(quality);
                if (!info) return;
                const potential = getPokemonPotentialPercent(quality, ivTotal, pokemon?.shiny);
                row.dataset.scriptCaptureQuality = `Q ×${quality.toFixed(2)}${potential === null ? '' : ` · ${potential}%`}`;
                row.style.setProperty('--script-capture-quality-color', info.color);
                row.classList.add('script-capture-quality-row');
            });
        });
    }
'''
q = need_sub(q, old_capture_pattern, new_capture, 'QOL función Capture Log', re.S)
q = need_replace(q, "        enhancePartyQuality();\n        removeCaptureLogEnhancements();\n        enhanceNativeGlobalMarketQuality();", "        enhancePartyQuality();\n        enhanceCaptureLogQuality();\n        enhanceNativeGlobalMarketQuality();", 'QOL DOM Capture Log')
q = q.replace('selección múltiple en Familia y preset 1,70+ / IV 100+.', 'Capture Log muestra calidad sin alterar filtros nativos.')
save(qol_path, q)


# ---------------------------------------------------------------------------
# Changelogs
# ---------------------------------------------------------------------------
prepend_changelog(
    'changelog/pokegrid-hunt-intelligence.md',
    '## 1.1.27 — 2026-08-10',
    '''- Mapa abre Hunt Intelligence obligatoriamente minimizado; 🧠 abre la ventana desplegada conservando el layout.
- La marca personal separa calibración de kills/h y XP/h; la proyección de XP usa el rendimiento histórico real frente a PIWTools.
- Histórico muestra «XP/h real histórico» y Hunts «Tu XP/h estimada».
- Reparado No capturados (`huntAccessLevel is not defined`).'''
)
prepend_changelog(
    'changelog/pokegrid-boss-damage-meter.md',
    '## 1.0.6 — 2026-08-10',
    '''- Añadido botón X manual en Bridge UI y fallback.
- El cierre manual permanece durante la run actual.
- El resultado final se mantiene 4,5 s y después el medidor se cierra automáticamente.
- Una run nueva limpia el estado de cierre anterior.'''
)
prepend_changelog(
    'changelog/piw-qol-es.md',
    '## 9.10.28 — 2026-08-10',
    '''- Capture Log vuelve a mostrar Quality cuando la captura puede relacionarse de forma inequívoca con los datos del juego.
- El indicador usa `data-*` + `::after`, sin alterar `textContent`, filtros ni ordenaciones nativas.
- Muestra multiplicador de calidad y, si corresponde, porcentaje de potencial.'''
)

chg = ROOT / 'CHANGELOG.md'
ct = chg.read_text(encoding='utf-8')
if 'Hunt Intelligence 1.1.27' not in ct:
    first, *rest = ct.splitlines()
    entries = '''## PokeGrid - Hunt Intelligence 1.1.27 — 2026-08-10

- Apertura minimizada desde Mapa, calibración independiente de velocidad/XP, etiquetas claras y reparación de No capturados.

## PokeGrid - Boss Damage Meter 1.0.6 — 2026-08-10

- X manual, cierre persistente durante la run y autocierre tras el resultado.

## Poke Idle World - Quality of Life (PIW-QOL ES) 9.10.28 — 2026-08-10

- Quality en Capture Log mediante capa visual que no modifica el texto nativo.
'''
    ct = first + '\n\n' + entries.strip() + '\n\n' + '\n'.join(rest).lstrip('\n').rstrip() + '\n'
    chg.write_text(ct, encoding='utf-8')

print('Release 2026-08-10 aplicada correctamente.')

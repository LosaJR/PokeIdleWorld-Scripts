from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path, old, new, expected=1):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f'{path}: esperado {expected} reemplazo(s), encontrados {count}: {old[:90]!r}')
    p.write_text(text.replace(old, new), encoding='utf-8')


def replace_all(path, old, new, minimum=1):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count < minimum:
        raise RuntimeError(f'{path}: esperados al menos {minimum} reemplazos, encontrados {count}: {old!r}')
    p.write_text(text.replace(old, new), encoding='utf-8')
    return count


def prepend_after_title(path, entry):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    lines = text.splitlines()
    if not lines or not lines[0].startswith('# '):
        raise RuntimeError(f'{path}: cabecera de changelog no reconocida')
    marker = entry.splitlines()[0]
    if marker in text:
        raise RuntimeError(f'{path}: ya contiene {marker}')
    rest = '\n'.join(lines[1:]).lstrip('\n')
    next_text = f'{lines[0]}\n\n{entry.strip()}\n'
    if rest:
        next_text += f'\n{rest.rstrip()}\n'
    p.write_text(next_text, encoding='utf-8')


# ---------------------------------------------------------------------------
# Hunt Intelligence 1.1.27
# ---------------------------------------------------------------------------
hunt = 'src/pokegrid-hunt-intelligence.user.js'
replace_all(hunt, '1.1.26', '1.1.27', minimum=8)
replace_all(hunt, 'V1126', 'V1127', minimum=5)

replace(hunt, """  function rowExpectedKphForCalibration(row) {
    if (Number.isFinite(Number(row?.expectedKphAverage)) && Number(row.expectedKphAverage) > 0) {
      return Number(row.expectedKphAverage);
    }
    if (row?.levelingSample !== true && Number.isFinite(Number(row?.expectedKph)) && Number(row.expectedKph) > 0) {
      return Number(row.expectedKph);
    }
    return 0;
  }
""", """  function rowExpectedKphForCalibration(row) {
    if (Number.isFinite(Number(row?.expectedKphAverage)) && Number(row.expectedKphAverage) > 0) {
      return Number(row.expectedKphAverage);
    }
    if (row?.levelingSample !== true && Number.isFinite(Number(row?.expectedKph)) && Number(row.expectedKph) > 0) {
      return Number(row.expectedKph);
    }
    return 0;
  }

  function rowExpectedXphForCalibration(row) {
    if (Number.isFinite(Number(row?.expectedXphAverage)) && Number(row.expectedXphAverage) > 0) {
      return Number(row.expectedXphAverage);
    }
    if (row?.levelingSample !== true && Number.isFinite(Number(row?.expectedXph)) && Number(row.expectedXph) > 0) {
      return Number(row.expectedXph);
    }
    return 0;
  }
""")

replace(hunt, """    let rows = exactRows;
    let matchType = exactRows.length ? 'exacto' : 'calibrado';
    let factor = 1;
    let kph = 0;
    let baseXph = 0;
    let historicalKph = 0;
    let matchMinLevel = level;
    let matchMaxLevel = level;

    if (exactRows.length) {
      historicalKph = exactRows.reduce((sum,row)=>sum+finite(row.kph),0)/exactRows.length;
      baseXph = exactRows.reduce((sum,row)=>sum+finite(row.cleanBaseXph),0)/exactRows.length;
      kph = historicalKph;
    } else {
      const candidates = baseRows.filter(row => {
        const refLevel = rowReferenceLevel(row);
        const expected = rowExpectedKphForCalibration(row);
        return refLevel <= level
          && level - refLevel <= levelBand
          && expected > 0
          && finite(row.kph) > 0;
      });

      if (!candidates.length || !(finite(expectedKph) > 0)) return null;

      rows = candidates;
      matchMinLevel = Math.min(...rows.map(rowReferenceLevel));
      matchMaxLevel = Math.max(...rows.map(rowReferenceLevel));

      let weightedFactor = 0;
      let totalWeight = 0;
      for (const row of rows) {
        const refLevel = rowReferenceLevel(row);
        const distance = Math.max(0, level - refLevel);
        const proximity = clamp(1 - (distance / Math.max(1, levelBand)) * 0.50, 0.50, 1);
        const expected = rowExpectedKphForCalibration(row);
        const rowFactor = clamp(finite(row.kph) / expected, 0.60, 1.60);
        const weight = SAMPLE_WINDOW_SECONDS * proximity;
        weightedFactor += rowFactor * weight;
        totalWeight += weight;
      }

      factor = totalWeight ? weightedFactor / totalWeight : 1;
      kph = Math.max(0, finite(expectedKph) * factor);

      const currentMultiplier = (vipActive?VIP_MULT:1)*(dailyBoosted?DAILY_MULT:1);
      if (finite(expectedXph) > 0) {
        baseXph = Math.max(0, finite(expectedXph) / currentMultiplier * factor);
      } else {
        const avgHistoricalBaseXph = rows.reduce((sum,row)=>sum+finite(row.cleanBaseXph),0)/rows.length;
        const avgHistoricalKph = rows.reduce((sum,row)=>sum+finite(row.kph),0)/rows.length;
        baseXph = avgHistoricalKph > 0 ? avgHistoricalBaseXph * (kph / avgHistoricalKph) : avgHistoricalBaseXph;
      }

      historicalKph = rows.reduce((sum,row)=>sum+finite(row.kph),0)/rows.length;
    }
""", """    let rows = exactRows;
    let matchType = exactRows.length ? 'exacto' : 'calibrado';
    let speedFactor = 1;
    let xpFactor = 1;
    let kph = 0;
    let baseXph = 0;
    let historicalKph = 0;
    let matchMinLevel = level;
    let matchMaxLevel = level;
    const currentMultiplier = (vipActive?VIP_MULT:1)*(dailyBoosted?DAILY_MULT:1);

    if (exactRows.length) {
      historicalKph = exactRows.reduce((sum,row)=>sum+finite(row.kph),0)/exactRows.length;
      baseXph = exactRows.reduce((sum,row)=>sum+finite(row.cleanBaseXph),0)/exactRows.length;
      kph = historicalKph;
      if (finite(expectedKph) > 0) speedFactor = clamp(kph / finite(expectedKph), 0.60, 1.60);
      if (finite(expectedXph) > 0) xpFactor = clamp((baseXph * currentMultiplier) / finite(expectedXph), 0.60, 1.60);
    } else {
      const candidates = baseRows.filter(row => {
        const refLevel = rowReferenceLevel(row);
        const expected = rowExpectedKphForCalibration(row);
        return refLevel <= level
          && level - refLevel <= levelBand
          && expected > 0
          && finite(row.kph) > 0;
      });

      if (!candidates.length || !(finite(expectedKph) > 0)) return null;

      rows = candidates;
      matchMinLevel = Math.min(...rows.map(rowReferenceLevel));
      matchMaxLevel = Math.max(...rows.map(rowReferenceLevel));

      let weightedSpeedFactor = 0;
      let speedWeight = 0;
      let weightedXpFactor = 0;
      let xpWeight = 0;
      for (const row of rows) {
        const refLevel = rowReferenceLevel(row);
        const distance = Math.max(0, level - refLevel);
        const proximity = clamp(1 - (distance / Math.max(1, levelBand)) * 0.50, 0.50, 1);
        const weight = SAMPLE_WINDOW_SECONDS * proximity;

        const expectedKphRow = rowExpectedKphForCalibration(row);
        if (expectedKphRow > 0 && finite(row.kph) > 0) {
          const rowSpeedFactor = clamp(finite(row.kph) / expectedKphRow, 0.60, 1.60);
          weightedSpeedFactor += rowSpeedFactor * weight;
          speedWeight += weight;
        }

        const expectedXphRow = rowExpectedXphForCalibration(row);
        const rowMultiplier = (row.vipActive?VIP_MULT:1)*(row.dailyBoosted?DAILY_MULT:1);
        const expectedBaseXph = expectedXphRow > 0 ? expectedXphRow / rowMultiplier : 0;
        if (expectedBaseXph > 0 && finite(row.cleanBaseXph) > 0) {
          const rowXpFactor = clamp(finite(row.cleanBaseXph) / expectedBaseXph, 0.60, 1.60);
          weightedXpFactor += rowXpFactor * weight;
          xpWeight += weight;
        }
      }

      speedFactor = speedWeight ? weightedSpeedFactor / speedWeight : 1;
      xpFactor = xpWeight ? weightedXpFactor / xpWeight : speedFactor;
      kph = Math.max(0, finite(expectedKph) * speedFactor);

      if (finite(expectedXph) > 0) {
        baseXph = Math.max(0, finite(expectedXph) / currentMultiplier * xpFactor);
      } else {
        const avgHistoricalBaseXph = rows.reduce((sum,row)=>sum+finite(row.cleanBaseXph),0)/rows.length;
        const avgHistoricalKph = rows.reduce((sum,row)=>sum+finite(row.kph),0)/rows.length;
        baseXph = avgHistoricalKph > 0 ? avgHistoricalBaseXph * (kph / avgHistoricalKph) : avgHistoricalBaseXph;
      }

      historicalKph = rows.reduce((sum,row)=>sum+finite(row.kph),0)/rows.length;
    }
""")

replace(hunt, """      levelBand,
      factor,
      historicalKph,
""", """      levelBand,
      factor:speedFactor,
      speedFactor,
      xpFactor,
      historicalKph,
""")

replace(hunt, """    const isAccessible = hunt => requiredLevel(hunt) <= Math.max(
      1,
      finite(huntResult?.accessLevel, huntAccessLevel(huntResult?.lead), 1)
    );
""", """    const isAccessible = hunt => requiredLevel(hunt) <= Math.max(
      1,
      finite(huntResult?.accessLevel, huntResult?.lead?.level, 1)
    );
""")

replace(hunt, """  function openCollapsedFromMap(){
    panelCollapsed=true;
    activeTab='hunt';
    revealManagedPanel({full:false});
    loadHunt(false);
  }
""", """  function openCollapsedFromMap(){
    panelCollapsed=true;
    activeTab='hunt';
    if (revealManagedPanel({full:false}) && uiWindow) uiWindow.setMinimized(true);
    loadHunt(false);
  }
""")

replace_all(hunt, 'XP/h personal', 'XP/h real histórico', minimum=2)
replace(hunt, '<div class="pg-u-col">Tu XP/h</div>', '<div class="pg-u-col">Tu XP/h estimada</div>')

# ---------------------------------------------------------------------------
# Boss Damage Meter 1.0.6
# ---------------------------------------------------------------------------
boss = 'src/pokegrid-boss-damage-meter.user.js'
replace_all(boss, '1.0.5', '1.0.6', minimum=3)
replace_all(boss, 'V105', 'V106', minimum=2)
replace(boss, """  const BOSS_BOOT_REFRESH_MS = 1500;
  const BOSS_BOOT_REFRESH_COUNT = 12;
""", """  const BOSS_BOOT_REFRESH_MS = 1500;
  const BOSS_BOOT_REFRESH_COUNT = 12;
  const FINISH_AUTO_CLOSE_MS = 4500;
""")
replace(boss, """  let panelClosedForRun = false;
  let maximized = false;
""", """  let panelClosedForRun = false;
  let finishCloseTimer = null;
  let maximized = false;
""")
replace(boss, """    lastFieldSeq = null;
    panelClosedForRun = false;
    ensureUi();
""", """    lastFieldSeq = null;
    panelClosedForRun = false;
    if (finishCloseTimer) clearTimeout(finishCloseTimer);
    finishCloseTimer = null;
    ensureUi();
""")
replace(boss, """  function finishRun(outcome = 'won') {
    if (!run || run.outcome) return;
    run.outcome = String(outcome || 'won');
    run.finishedAt = nowMs();
    render();
    heartbeat();
    console.info(`[Boss Damage Meter] Run finalizada: ${run.bossName} · daño ${run.totalDamage}/${run.maxBossHp}.`);
  }
""", """  function finishRun(outcome = 'won') {
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
""")
replace(boss, '        closable: false,', '        closable: true,')
replace(boss, """      usingBridgeUi = true;

      if (fallback) fallback.remove();
""", """      usingBridgeUi = true;
      uiWindow.panel.addEventListener('click', event => {
        const close = event.target.closest?.('.pg-ui-header .pg-ui-button');
        if (close?.title === 'Cerrar') panelClosedForRun = true;
      }, true);

      if (fallback) fallback.remove();
""")
replace(boss, """        <button type="button" data-minimize title="Minimizar">—</button>
        <button type="button" data-maximize title="Maximizar">□</button>
""", """        <button type="button" data-minimize title="Minimizar">—</button>
        <button type="button" data-maximize title="Maximizar">□</button>
        <button type="button" data-close title="Cerrar">×</button>
""")
replace(boss, """    panel.querySelector('[data-maximize]')?.addEventListener('click', event => {
      event.preventDefault();
      toggleMaximize(panel);
    });
    return panel;
""", """    panel.querySelector('[data-maximize]')?.addEventListener('click', event => {
      event.preventDefault();
      toggleMaximize(panel);
    });
    panel.querySelector('[data-close]')?.addEventListener('click', event => {
      event.preventDefault();
      closePanelForRun();
    });
    return panel;
""")
replace(boss, """  function openPanel(force = false) {
    ensureUi();
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    if (!force && panelClosedForRun) return;
    if (usingBridgeUi && uiWindow) uiWindow.open();
    else panel.hidden = false;
    render();
  }
""", """  function closePanelForRun() {
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
""")
replace(boss, """    close: () => {
      const panel = document.getElementById(PANEL_ID);
      if (usingBridgeUi && uiWindow) uiWindow.close();
      else if (panel) panel.hidden = true;
      panelClosedForRun = true;
      return true;
    },
""", """    close: () => closePanelForRun(),
""")

# ---------------------------------------------------------------------------
# PIW-QOL ES 9.10.28 — calidad visual segura en Capture Log
# ---------------------------------------------------------------------------
qol = 'src/piw-qol-es.user.js'
replace_all(qol, '9.10.27', '9.10.28', minimum=2)
replace(qol, """        if (message?.type === 'pokes') {
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
""")
replace(qol, """        .phud-party > button.phud-mon .script-party-quality {
            display: inline-block !important;
            margin-left: 5px !important;
            font-size: 10px !important;
            font-weight: 800 !important;
            line-height: 1 !important;
            vertical-align: middle !important;
            white-space: nowrap !important;
        }
""", """        .phud-party > button.phud-mon .script-party-quality {
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
""")
replace(qol, """    // El Capture Log se conserva completamente nativo. Las versiones anteriores
    // añadían o sustituían texto dentro de las filas y eso podía interferir con
    // los filtros y ordenaciones internos por calidad e IV.
    function removeCaptureLogEnhancements() {
        document.querySelectorAll('.script-capture-quality-extra,.script-quality-badge')
            .forEach(element => element.remove());
        document.querySelectorAll('.script-capture-log-window')
            .forEach(element => element.classList.remove('script-capture-log-window'));
    }
""", """    // Capture Log: la calidad se dibuja con ::after a partir de data-attributes.
    // Así no se inserta texto en los nodos nativos y no se alteran sus filtros ni ordenaciones.
    function enhanceCaptureLogQuality(pokemonList = latestPokemon) {
        const owned = Array.isArray(pokemonList) ? pokemonList : [];
        const windows = Array.from(document.querySelectorAll('[role="dialog"],.win-window,.window,[class*="window"]'))
            .filter(element => /capture\s*log|registro\s+de\s+capturas?/i.test(String(element.textContent || '').slice(0, 1200)));
        if (!windows.length) return;

        windows.forEach(windowElement => {
            windowElement.classList.add('script-capture-log-window');
            const rows = Array.from(windowElement.querySelectorAll('tr,li,[class*="row"]'))
                .filter(row => /\bIV\s*:?\s*\d+/i.test(row.textContent || ''));

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
""")
replace(qol, """        enhancePartyQuality();
        removeCaptureLogEnhancements();
        enhanceNativeGlobalMarketQuality();
""", """        enhancePartyQuality();
        enhanceCaptureLogQuality();
        enhanceNativeGlobalMarketQuality();
""")
replace(qol, """    console.info(`[PIW-QOL ES] v${SCRIPT_BUILD} cargado · selección múltiple en Familia y preset 1,70+ / IV 100+.`);
""", """    console.info(`[PIW-QOL ES] v${SCRIPT_BUILD} cargado · Capture Log muestra calidad mediante una capa visual que no altera filtros nativos.`);
""")

# ---------------------------------------------------------------------------
# Changelogs
# ---------------------------------------------------------------------------
date = '2026-08-10'
prepend_after_title('changelog/pokegrid-hunt-intelligence.md', f'''## 1.1.27 — {date}

- El botón Mapa vuelve a abrir Hunt Intelligence obligatoriamente minimizado; el botón 🧠 abre la ventana desplegada y se conserva el layout del Bridge.
- La marca personal separa ahora calibración de kills/h y calibración de XP/h. La proyección de XP usa la experiencia real histórica frente a PIWTools, mientras loot sigue escalando con la velocidad real.
- Histórico distingue explícitamente «XP/h real histórico» y Hunts muestra «Tu XP/h estimada».
- Corregido No capturados: eliminado el acceso a `huntAccessLevel` fuera de ámbito; usa el `accessLevel` ya calculado por el motor.''')

prepend_after_title('changelog/pokegrid-boss-damage-meter.md', f'''## 1.0.6 — {date}

- Añadido botón X manual tanto en Bridge UI como en la interfaz de respaldo.
- Cerrar manualmente evita que el medidor vuelva a abrirse durante la misma run.
- Al terminar el Boss se conserva brevemente el resultado y el panel se cierra automáticamente.
- Una nueva run limpia el cierre anterior y vuelve a abrir el medidor con normalidad.''')

prepend_after_title('changelog/piw-qol-es.md', f'''## 9.10.28 — {date}

- Capture Log vuelve a mostrar la calidad del Pokémon junto a cada captura cuando puede relacionarla de forma inequívoca con los datos del juego.
- La calidad se renderiza mediante `data-*` y CSS `::after`, sin insertar texto en la fila nativa; así no altera los filtros ni las ordenaciones internas por IV/calidad.
- El indicador incluye el multiplicador de calidad y, si está activado, el porcentaje de potencial.''')

# Changelog general: prepend three release entries after title.
general = ROOT / 'CHANGELOG.md'
text = general.read_text(encoding='utf-8')
entries = f'''## PokeGrid - Hunt Intelligence 1.1.27 — {date}

- Apertura minimizada correcta desde Mapa, calibración independiente de velocidad/XP, etiquetas histórico/proyección más claras y reparación de No capturados.

## PokeGrid - Boss Damage Meter 1.0.6 — {date}

- Cierre manual con X, bloqueo de reapertura durante la misma run y cierre automático tras mostrar el resultado final.

## Poke Idle World - Quality of Life (PIW-QOL ES) 9.10.28 — {date}

- Quality visible de nuevo en Capture Log mediante una capa visual que no modifica el texto nativo usado por filtros y ordenaciones.
'''
if 'Hunt Intelligence 1.1.27' in text or 'Boss Damage Meter 1.0.6' in text or '9.10.28' in text:
    raise RuntimeError('CHANGELOG.md ya contiene alguna release de esta tanda')
first, *rest = text.splitlines()
general.write_text(first + '\n\n' + entries.strip() + '\n\n' + '\n'.join(rest).lstrip('\n').rstrip() + '\n', encoding='utf-8')

# La release se autolimpia: restaura publish.yml y elimina este helper.
workflow = ROOT / '.github/workflows/publish.yml'
workflow_text = workflow.read_text(encoding='utf-8')
block = """      - name: Aplicar release 2026-08-10\n        run: python3 scripts/apply-release-2026-08-10.py\n\n"""
if workflow_text.count(block) != 1:
    raise RuntimeError('No se encontró el bloque temporal en publish.yml')
workflow.write_text(workflow_text.replace(block, ''), encoding='utf-8')
Path(__file__).unlink()
print('Release 2026-08-10 aplicada; helper temporal eliminado.')

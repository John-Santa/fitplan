// Responsive/UI harness for fitplan — HARNESS-01: forces every routine and
// worst-case strings across a matrix of viewports.
// Usage:  BASE=http://localhost:5173/ pnpm check:ui
// See test/README.md for what this checks and how to add a check.
import { chromium } from 'playwright-core'
import { createChecklist, resolveChromiumPath, seedConfig, seedMeasurements, seedSessions } from './lib.mjs'

const BASE = process.env.BASE || 'https://john-santa.github.io/fitplan/'
const OUT = process.env.OUT
const TAP_MIN = 44

// Mirrors src/lib/calc.ts's todayISO() exactly (local date, not UTC) — this
// file stays dependency-light and does not import from src/.
const todayISO = (d = new Date()) => {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Same order as ROUTINES in src/lib/plan.ts (dia1 Pierna, dia2 Empuje, dia3
// Tracción) — mirrored, not imported, same reasoning as todayISO() above.
// ROUT_IDS drives the testid-bound clicks below (start-${id}) instead of
// ordinal button.primary.nth(i), which would silently repoint the moment a
// fourth start button (e.g. "Nadar") appears on the page.
const ROUTS = ['Pierna', 'Empuje', 'Tracción']
const ROUT_IDS = ['dia1', 'dia2', 'dia3']

const VIEWPORTS = [
  { n: '320x568 iPhone SE', w: 320, h: 568, mob: true },
  { n: '360x800 Android', w: 360, h: 800, mob: true },
  { n: '390x844 iPhone 14', w: 390, h: 844, mob: true },
  { n: '844x390 LANDSCAPE', w: 844, h: 390, mob: true },
  { n: '768x1024 Tablet', w: 768, h: 1024, mob: false },
  { n: '1440x900 Desktop', w: 1440, h: 900, mob: false },
  { n: '1200x800 Desktop', w: 1200, h: 800, mob: false },
  { n: '1920x1080 Desktop', w: 1920, h: 1080, mob: false },
]

const { check, report } = createChecklist()

// geometry() runs inside the page via page.evaluate(), which only ships the
// function's own source across — it cannot close over Node-side module
// constants, so the tap-target selector is inlined rather than imported.
//
// Tap-target selector. Includes `summary` and `[role="button"]` for
// forward coverage (no <details>/custom-button-role UI exists in the app
// today, so this adds zero matched elements right now — it just means a
// future <details> or role="button" control won't be silently invisible to
// the 44px floor).
//
// `label` was tried and deliberately left out: this app's <label htmlFor>
// elements are caption text above/beside an input (e.g. "Inicio del
// bloque"), not a standalone control — their paired <input> already passes
// the 44px check on its own (it's separately selected here). Including
// `label` produced 6 failures, one per viewport, all ~15px-tall captions —
// noise from a labeling technicality, not a real tap-target defect, and a
// permanently-red check trains people to ignore it. See test/README.md for
// the reasoning and the exact failures observed.
const geometry = () => {
  const de = document.documentElement
  // `th` is `position: sticky` (§9) so it participates in this selector, but
  // it only re-pins itself while scrolling *within its own table* — it is
  // not floating page chrome the way .tabbar/.timer/.session-head are, and
  // was never part of what this metric was built to measure (it predates
  // this change; the desktop shell just exposed it by adding a check that
  // runs on every tab, including Medidas). Excluding it here changes zero
  // outcomes across every pre-existing check (fitsSetnow only ever runs on
  // ActiveSession, which never renders a <table>).
  const fixed = Array.from(document.querySelectorAll('*'))
    .filter(e => e.tagName !== 'TH' && ['sticky', 'fixed'].includes(getComputedStyle(e).position))
  // A fixed/sticky element only occludes the content if it overlaps the
  // content column horizontally. From 1200px up the tab bar is a
  // full-height rail BESIDE .main, not a band across it; summing its
  // height here would report >100% chrome and a negative usable height.
  const mainBox = document.querySelector('.main')?.getBoundingClientRect() ?? null
  const chrome = Math.round(
    fixed
      .filter(e => {
        if (!mainBox) return true
        const r = e.getBoundingClientRect()
        return r.right > mainBox.left + 1 && r.left < mainBox.right - 1
      })
      .reduce((a, e) => a + e.getBoundingClientRect().height, 0),
  )
  const taps = Array.from(document.querySelectorAll('button,a,input,select,textarea,summary,[role="button"]'))
    .map(e => ({
      t: `${e.tagName}.${(e.className || '').toString().trim().slice(0, 24)}`,
      w: +e.getBoundingClientRect().width.toFixed(1),
      h: +e.getBoundingClientRect().height.toFixed(1),
    }))
    .filter(x => x.h > 0 && x.w > 0)
  const rail = document.querySelector('.rail')
  let railInfo = null
  if (rail) {
    const cells = Array.from(rail.querySelectorAll('button')).map(c => c.getBoundingClientRect())
    railInfo = {
      n: cells.length,
      anchoMin: +Math.min(...cells.map(r => r.width)).toFixed(1),
      alto: +cells[0].height.toFixed(1),
      scrollea: rail.scrollWidth > rail.clientWidth + 1,
    }
  }
  const setnow = document.querySelector('.setnow')
  return {
    overflowX: de.scrollWidth - de.clientWidth,
    chrome,
    pct: Math.round((chrome / window.innerHeight) * 100),
    util: Math.round(window.innerHeight - chrome),
    tapsChicos: taps.filter(x => x.h < 44 || x.w < 44),
    rail: railInfo,
    setnowAlto: setnow ? +setnow.getBoundingClientRect().height.toFixed(1) : null,
    h1s: document.querySelectorAll('h1').length,
    accentInk: getComputedStyle(document.documentElement).getPropertyValue('--accent-ink').trim(),
    navs: document.querySelectorAll('.tabbar').length,
    navButtons: document.querySelectorAll('.tabbar button').length,
    ariaCurrent: document.querySelectorAll('[aria-current="page"]').length,
    navBox: (() => {
      const n = document.querySelector('.tabbar')
      if (!n) return null
      const r = n.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    })(),
    maxP: Math.round(Math.max(0, ...Array.from(document.querySelectorAll('p')).map(e => e.getBoundingClientRect().width))),
    usedPct: mainBox ? Math.round((mainBox.right / window.innerWidth) * 100) : null,
  }
}

let EXE
try {
  EXE = resolveChromiumPath()
} catch (e) {
  console.error(`\n${e.message}\n`)
  process.exit(1)
}

const br = await chromium.launch({ executablePath: EXE })
for (const v of VIEWPORTS) {
  console.log(`\n\x1b[1m===== ${v.n} =====\x1b[0m`)
  const ctx = await br.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 2, isMobile: v.mob, hasTouch: v.mob })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message))
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)

  // Headless Chromium has no notch, so env(safe-area-inset-*) is 0 and the
  // harness would report a pass that a real device would not have. Force
  // the insets of an iPhone with a notch: 21px bottom in landscape, 34px in
  // portrait, 59px top in portrait (0 in landscape).
  const LAND = v.w > v.h
  await p.addStyleTag({
    content: `:root{
    --safe-b: ${LAND ? '21px' : '34px'};
    --safe-t: ${LAND ? '0px' : '59px'};
  }`,
  })
  await p.waitForTimeout(300)

  // ---- nav tabs ----
  for (const tab of ['Inicio', 'Entrenar', 'Medidas', 'Ajustes']) {
    const b = p.locator('.tabbar button', { hasText: tab })
    if (await b.count()) {
      await b.first().click()
      await p.waitForTimeout(450)
    }
    const g = await p.evaluate(geometry)
    const s1 = check(g.overflowX === 0, `${v.n}/${tab}`, `overflowX=${g.overflowX}px`)
    const s2 = check(g.tapsChicos.length === 0, `${v.n}/${tab}`, `taps<44: ${JSON.stringify(g.tapsChicos.slice(0, 3))}`)
    const s3 = check(g.h1s === 1, `${v.n}/${tab}`, `h1 count=${g.h1s}`)
    console.log(`  [${tab.padEnd(8)}] overflowX ${String(g.overflowX).padStart(3)}px ${s1} | taps<44: ${String(g.tapsChicos.length).padStart(2)} ${s2} | h1 ${g.h1s} ${s3}`)

    const desk = v.w >= 1200
    check(g.navs === 1 && g.navButtons === 4, `${v.n}/${tab}/NAV-02`,
      `navs=${g.navs} botones=${g.navButtons}, deben ser 1 y 4 (una sola nav en el DOM)`)
    check(g.ariaCurrent === 1, `${v.n}/${tab}/NAV-03`,
      `hay ${g.ariaCurrent} elementos con aria-current="page", debe haber 1`)
    check(
      desk ? g.navBox.h >= v.h - 1 && g.navBox.w <= 220 : g.navBox.w >= v.w - 1 && g.navBox.h <= 120,
      `${v.n}/${tab}/NAV-01`,
      `nav ${g.navBox.w}x${g.navBox.h} no corresponde a ${desk ? 'riel lateral (alto>=viewport, ancho<=220)' : 'barra inferior (ancho=viewport, alto<=120)'}`,
    )
    check(g.maxP <= 750, `${v.n}/${tab}/READ-01`, `parrafo mas ancho ${g.maxP}px > 750`)
    if (v.w >= 1440 && ['Inicio', 'Medidas', 'Ajustes'].includes(tab)) {
      check(g.maxP >= 600, `${v.n}/${tab}/READ-02`, `parrafo mas ancho ${g.maxP}px < 600`)
    }
    if (desk) {
      const s4 = check(g.usedPct >= (v.w >= 1920 ? 85 : 99), `${v.n}/${tab}/UTIL-01`,
        `usa ${g.usedPct}% del ancho del viewport, minimo ${v.w >= 1920 ? 85 : 99}%`)
      console.log(`    desktop: usedPct ${g.usedPct}% ${s4} | maxP ${g.maxP}px | nav ${g.navBox.w}x${g.navBox.h}`)
    }
    check(g.util > 0, `${v.n}/${tab}/CHROME-01`, `altura util ${g.util}px <= 0 (chrome ${g.chrome}px)`)
  }

  // ---- HARNESS-01: force all three routines ----
  for (let i = 0; i < ROUTS.length; i++) {
    await p.locator('.tabbar button', { hasText: 'Entrenar' }).click()
    await p.waitForTimeout(400)
    const danger = p.locator('button.danger')
    if (await danger.count()) {
      p.once('dialog', d => d.accept())
      await danger.click()
      await p.waitForTimeout(500)
      await p.locator('.tabbar button', { hasText: 'Entrenar' }).click()
      await p.waitForTimeout(400)
    }
    if (i === 0) {
      // ORD-01: the number of start buttons must equal the routine count
      // PLUS the swim card (F1-5's "Nadar" card, `[data-testid="start-swim"]`,
      // is deliberately `button.primary` too, for visual consistency with
      // the three routine cards). This literal (ROUT_IDS.length + 1) is the
      // ONE pre-existing assertion this unit updates on purpose — it is the
      // exact reshuffle test/README.md documented ORD-01 as built to catch
      // ("a future reshuffle... fails loudly here instead of silently
      // exercising the wrong routine"), not a silent behavior change: the
      // testid-bound clicks below are unaffected by the swim card's
      // position, so ORD-01 going from 3->4 here is the intended outcome of
      // adding a fourth start button, not a regression.
      const primCount = await p.locator('button.primary').count()
      check(primCount === ROUT_IDS.length + 1, `${v.n}/ORD-01`,
        `hay ${primCount} botones button.primary en Entrenar, se esperaban ${ROUT_IDS.length + 1} (uno por rutina + Nadar)`)
    }
    const startBtn = p.locator(`[data-testid="start-${ROUT_IDS[i]}"]`)
    if ((await startBtn.count()) === 0) {
      console.log(`  [${ROUTS[i]}] no disponible`)
      continue
    }
    await startBtn.click()
    await p.waitForTimeout(800)
    const g = await p.evaluate(geometry)
    if (!g.rail) {
      console.log(`  [${ROUTS[i]}] sin rail`)
      continue
    }
    const s1 = check(g.rail.anchoMin >= TAP_MIN, `${v.n}/${ROUTS[i]}`, `rail celda ancho ${g.rail.anchoMin}px < ${TAP_MIN}`)
    check(g.rail.alto >= TAP_MIN, `${v.n}/${ROUTS[i]}/RAIL-03`, `rail celda ALTO ${g.rail.alto}px < ${TAP_MIN}`)
    const s2 = check(g.overflowX === 0, `${v.n}/${ROUTS[i]}`, `overflowX=${g.overflowX}px`)
    const fitsSetnow = g.setnowAlto === null || g.util >= g.setnowAlto
    const s3 = check(fitsSetnow, `${v.n}/${ROUTS[i]}`, `setnow ${g.setnowAlto}px no entra en ${g.util}px utiles`)
    console.log(
      `  [${ROUTS[i].padEnd(8)}] ${g.rail.n} ej | celda ${String(g.rail.anchoMin).padStart(5)}px ${s1} | scroll:${g.rail.scrollea ? 'si' : 'no'} | chrome ${g.chrome}px (${g.pct}%) util ${g.util}px | setnow ${g.setnowAlto}px ${s3} | ovf ${g.overflowX} ${s2}`,
    )

    // scrollIntoView must not scroll the document vertically (block:'nearest')
    if (g.rail.n > 1) {
      const before = await p.evaluate(() => {
        window.scrollTo(0, 40)
        return window.scrollY
      })
      await p.locator('.rail button').nth(g.rail.n - 1).click()
      await p.waitForTimeout(500)
      const after = await p.evaluate(() => ({
        y: window.scrollY,
        maxScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }))
      // On a tall desktop viewport, switching to a different exercise's
      // panel can legitimately make the page shorter than the viewport
      // (a different exercise has less content — no `prev` block, fewer
      // set rows). When that happens the browser forces scrollY back to 0
      // itself because there is no longer anything to scroll — that is
      // correct clamping, not scrollIntoView moving the page. Only assert
      // the no-op when the page still had room to stay at `before`.
      if (after.maxScroll >= before - 2) {
        check(Math.abs(after.y - before) < 3, `${v.n}/${ROUTS[i]}/SCROLL`, `scrollIntoView movio el documento ${before}->${after.y}`)
      }
      await p.locator('.rail button').nth(0).click()
      await p.waitForTimeout(400)
    }

    // ---- worst real case: mark a set so the rest timer starts (fixed, ~91px) ----
    const chk = p.getByRole('button', { name: /Marcar serie/ })
    if (await chk.count()) {
      await chk.first().click()
      await p.waitForTimeout(700)
      const t = await p.evaluate(geometry)
      const timerOn = (await p.locator('.timer').count()) > 0
      if (timerOn) {
        const fits = t.setnowAlto === null || t.util >= t.setnowAlto
        const st = check(fits, `${v.n}/${ROUTS[i]}/CON-TIMER`, `setnow ${t.setnowAlto}px no entra en ${t.util}px utiles (chrome ${t.chrome}px = ${t.pct}%)`)
        const so = check(t.overflowX === 0, `${v.n}/${ROUTS[i]}/CON-TIMER`, `overflowX=${t.overflowX}px`)
        console.log(`  [${(ROUTS[i] + ' +timer').padEnd(14)}] chrome ${t.chrome}px (${t.pct}%) util ${t.util}px | setnow ${t.setnowAlto}px ${st} | ovf ${t.overflowX} ${so}`)
      }
    }
  }

  // ---- worst-case hero string ----
  await p.locator('.tabbar button', { hasText: 'Inicio' }).click()
  await p.waitForTimeout(500)
  const hero = await p.evaluate(() => {
    const slab = document.querySelector('.hero .slab') || document.querySelector('.hero')
    if (!slab) return null
    const out = []
    for (const nm of ['Empuje', 'Pierna', 'Tracción']) {
      const o = slab.textContent
      slab.textContent = nm
      out.push({
        nm,
        caja: slab.scrollWidth > slab.clientWidth + 1,
        pagina: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      })
      slab.textContent = o
    }
    return out
  })
  if (hero) {
    for (const c of hero) {
      const s = check(!c.caja && !c.pagina, `${v.n}/hero"${c.nm}"`, `desborda caja:${c.caja} pagina:${c.pagina}`)
      console.log(`  [hero ${c.nm.padEnd(8)}] desborda caja:${String(c.caja).padStart(5)} pagina:${String(c.pagina).padStart(5)} ${s}`)
    }
  }
  if (errs.length) {
    check(false, `${v.n}`, `errores de página: ${errs.join('; ')}`)
    console.log('  \x1b[31mERRORES:\x1b[0m', errs)
  }
  if (OUT) await p.screenshot({ path: `${OUT}/h-${v.w}x${v.h}.png` })
  await ctx.close()
}

// ---- light theme: --accent-ink must be #7a5a00, never pure yellow ----
{
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' })
  const p = await ctx.newPage()
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1000)
  const ink = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-ink').trim())
  const s = check(ink.toLowerCase() === '#7a5a00', 'tema-claro/A11Y', `--accent-ink es ${ink}, deberia ser #7a5a00`)
  console.log(`\n===== TEMA CLARO =====\n  --accent-ink: ${ink} ${s}`)
  await ctx.close()
}

// ---- seedConfig: proves the helper writes config *before* the app reads it ----
// Regression guard for HARNESS-02: without this, every check above only
// ever exercises DEFAULT_CONFIG, because a fresh browser context has empty
// IndexedDB and the app auto-seeds the default on first load. This section
// seeds a deliberately different blockStart/blockEnd, then asserts the
// Ajustes view actually renders that seeded value, not the default.
{
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  const seeded = { blockStart: '2020-01-15', blockEnd: '2020-03-11' }
  await seedConfig(p, seeded, BASE)
  await p.locator('.tabbar button', { hasText: 'Ajustes' }).click()
  await p.waitForTimeout(400)
  const dateInputs = p.locator('input[type="date"]')
  const gotStart = await dateInputs.nth(0).inputValue()
  const gotEnd = await dateInputs.nth(1).inputValue()
  const s1 = check(gotStart === seeded.blockStart, 'seedConfig/Ajustes', `blockStart input = "${gotStart}", esperado "${seeded.blockStart}"`)
  const s2 = check(gotEnd === seeded.blockEnd, 'seedConfig/Ajustes', `blockEnd input = "${gotEnd}", esperado "${seeded.blockEnd}"`)
  console.log(`\n===== SEEDCONFIG =====\n  blockStart: ${gotStart} ${s1} | blockEnd: ${gotEnd} ${s2}`)
  await ctx.close()
}

// ---- desktop measurements table: TBL-00/01/02 ----
// Regression guard for the §17/§19 breakout continuity (ADR-07): needs a
// seeded dataset because a fresh profile only ever has one BASELINE
// measurement, well under the table's 947px intrinsic width — any breakout
// or no-scroll assertion against it would pass vacuously.
{
  const SIX_FULL_ROWS = [
    { date: '2026-06-01', weight: 82.4, fatPct: 24.1, fatMass: 19.9, muscle: 30.8, water: 41.2, waist: 98.0, hip: 101.5, chest: 104.0, neck: 41.5 },
    { date: '2026-06-15', weight: 81.1, fatPct: 23.2, fatMass: 18.8, muscle: 31.1, water: 41.6, waist: 96.8, hip: 100.6, chest: 103.4, neck: 41.2 },
    { date: '2026-06-29', weight: 80.0, fatPct: 22.4, fatMass: 17.9, muscle: 31.4, water: 42.0, waist: 95.6, hip: 99.8, chest: 102.9, neck: 41.0 },
    { date: '2026-07-13', weight: 79.2, fatPct: 21.7, fatMass: 17.2, muscle: 31.7, water: 42.4, waist: 94.5, hip: 99.0, chest: 102.4, neck: 40.8 },
    { date: '2026-07-27', weight: 78.3, fatPct: 21.0, fatMass: 16.4, muscle: 32.0, water: 42.9, waist: 93.4, hip: 98.2, chest: 101.9, neck: 40.6 },
    { date: '2026-08-04', weight: 77.5, fatPct: 20.4, fatMass: 15.8, muscle: 32.3, water: 43.3, waist: 92.3, hip: 97.5, chest: 101.4, neck: 40.4 },
  ]
  for (const w of [1200, 1440, 1920]) {
    const ctx = await br.newContext({ viewport: { width: w, height: 900 } })
    const p = await ctx.newPage()
    await seedMeasurements(p, SIX_FULL_ROWS, BASE)
    await p.locator('.tabbar button', { hasText: 'Medidas' }).click()
    await p.waitForTimeout(500)
    const t = await p.evaluate(() => {
      const wrap = document.querySelector('.tablewrap.wide')
      const tb = wrap?.querySelector('table')
      if (!wrap || !tb) return null
      return {
        scroll: wrap.scrollWidth - wrap.clientWidth,
        tabla: Math.round(tb.getBoundingClientRect().width),
        wrap: Math.round(wrap.getBoundingClientRect().width),
        ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    console.log(`\n===== ${w}px MEDIDAS (sembradas) =====`)
    const s0 = check(t !== null, `${w}px/TBL-01`, 'no se encontro .tablewrap.wide en Medidas')
    console.log(`  encontrado ${s0}`)
    if (t) {
      const s1 = check(t.tabla >= 947, `${w}px/TBL-00`, `la tabla mide ${t.tabla}px, se esperaban >=947 (datos sembrados insuficientes)`)
      const s2 = check(t.scroll <= 0, `${w}px/TBL-01`, `la tabla scrollea ${t.scroll}px (wrap ${t.wrap}px, tabla ${t.tabla}px)`)
      const s3 = check(t.ovf === 0, `${w}px/TBL-02`, `overflowX del documento = ${t.ovf}px`)
      console.log(`  tabla ${t.tabla}px ${s1} | scroll ${t.scroll}px ${s2} | wrap ${t.wrap}px | ovf ${t.ovf}px ${s3}`)
    }
    await ctx.close()
  }
}

// ---- LEGACY-01: the exact pre-change byte shape (no `kind`) must still
// normalize and render — this is the migration proof. Covers
// db.ts:getSessions -> store.tsx:reload -> Train.tsx history end to end. ----
{
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message))
  const legacyRow = {
    id: 'dia1-1',
    routineId: 'dia1',
    date: todayISO(),
    startedAt: Date.now() - 600000,
    finishedAt: Date.now(),
    sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 12, done: true }],
    notes: '',
  }
  await seedSessions(p, [legacyRow], BASE)
  await p.locator('.tabbar button', { hasText: 'Entrenar' }).click()
  await p.waitForTimeout(500)
  const text = await p.evaluate(() => document.querySelector('.tablewrap')?.textContent ?? '')
  const s1 = check(text.includes('Día 1 — Pierna'), 'LEGACY-01/Entrenar', `el historial no muestra "Día 1 — Pierna": "${text.slice(0, 200)}"`)
  const s2 = check(text.includes('960'), 'LEGACY-01/Entrenar', `el historial no muestra el volumen 960 kg: "${text.slice(0, 200)}"`)
  const s3 = check(errs.length === 0, 'LEGACY-01/pageerror', `errores de pagina: ${errs.join('; ')}`)
  console.log(`\n===== LEGACY-01 (sesion heredada sin \`kind\`) =====\n  titulo "Día 1 — Pierna" ${s1} | volumen 960 kg ${s2} | sin pageerror ${s3}`)
  await ctx.close()
}

// ---- LEGACY-02: a corrupt row alongside a valid one must not throw, and
// must drop only the corrupt row — proves the drop rule in normalizeSession. ----
{
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message))
  const validRow = {
    kind: 'strength',
    id: 'dia2-legacy02',
    routineId: 'dia2',
    date: todayISO(),
    startedAt: Date.now() - 600000,
    finishedAt: Date.now(),
    sets: [{ exerciseId: 'chest-press', setIndex: 0, weight: 60, reps: 10, done: true }],
    notes: '',
  }
  const garbageRow = { id: 'roto', nope: true }
  await seedSessions(p, [validRow, garbageRow], BASE)
  await p.locator('.tabbar button', { hasText: 'Entrenar' }).click()
  await p.waitForTimeout(500)
  const rowCount = await p.locator('.tablewrap .list-item').count()
  const s1 = check(rowCount === 1, 'LEGACY-02/Entrenar', `hay ${rowCount} filas de historial, se esperaba 1 (la fila corrupta debe descartarse)`)
  const s2 = check(errs.length === 0, 'LEGACY-02/pageerror', `errores de pagina: ${errs.join('; ')}`)
  console.log(`\n===== LEGACY-02 (fila corrupta + fila valida) =====\n  1 fila de historial ${s1} | sin pageerror ${s2}`)
  await ctx.close()
}

// ---- MIX-01: one finished strength session + one finished swim session,
// same day. The "Volumen" tile must equal the strength volume exactly — not
// a sum with swim, not NaN — and the strength count must stay 1, not 2. This
// is R1, the defect live in production today (weeklyVolume/weeklyCount used
// to filter only by date and finishedAt, never by discipline). ----
{
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  const strengthRow = {
    kind: 'strength',
    id: 'dia1-mix01',
    routineId: 'dia1',
    date: todayISO(),
    startedAt: Date.now() - 1800000,
    finishedAt: Date.now(),
    sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 100, reps: 10, done: true }],
    notes: '',
  }
  // Matches SwimSession from src/types.ts exactly: kind, poolLengthM,
  // blocks: SwimBlock[] ({index, distanceM, timeSec, stroke, done}), rpe.
  const swimRow = {
    kind: 'swim',
    id: 'swim-mix01',
    date: todayISO(),
    startedAt: Date.now() - 1800000,
    finishedAt: Date.now(),
    poolLengthM: 25,
    blocks: [{ index: 0, distanceM: 400, timeSec: 480, stroke: 'freestyle', done: true }],
    rpe: 6,
    notes: '',
  }
  await seedSessions(p, [strengthRow, swimRow], BASE)
  await p.locator('.tabbar button', { hasText: 'Inicio' }).click()
  await p.waitForTimeout(500)
  const tiles = await p.evaluate(() => {
    const read = testId => {
      const el = document.querySelector(`[data-testid="${testId}"] .value`)
      return el ? el.textContent.replace(/\s+/g, '') : null
    }
    return { strengthWork: read('tile-strength-work'), strengthCount: read('tile-strength-count') }
  })
  const s1 = check(tiles.strengthWork === '1000kg', 'MIX-01/Volumen', `tile-strength-work = "${tiles.strengthWork}", esperado "1000kg" (solo la sesion de fuerza, sin sumar natacion, sin NaN)`)
  const s2 = check(tiles.strengthCount === '1', 'MIX-01/Fuerza', `tile-strength-count = "${tiles.strengthCount}", esperado "1" (no debe contar la sesion de natacion)`)
  console.log(`\n===== MIX-01 (1 fuerza + 1 natacion, mismo dia) =====\n  Volumen ${tiles.strengthWork} ${s1} | conteo fuerza ${tiles.strengthCount} ${s2}`)
  await ctx.close()
}

// ---- SWIM-01: a swim day must render a working CTA on Inicio. Before F1-5,
// Home gated the button on `suggested !== null`, and routineForWeekday()
// returns null for a swim day (it only resolves 'training' days) — so a
// swim day rendered a title and note with NO button at all. This seeds a
// weeklyRoutine whose *today* slot is swim (computed in Node, so the check
// is date-independent) and asserts the fix: .card.accent's h2 says
// "Natación" AND a start button exists inside that same card. ----
{
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  const dow = new Date().getDay()
  const restDay = { kind: 'rest', title: '', note: '' }
  const weeklyRoutine = Array.from({ length: 7 }, (_, i) => (i === dow ? { kind: 'swim', title: '', note: 'Piscina municipal' } : restDay))
  await seedConfig(p, { weeklyRoutine }, BASE)
  await p.locator('.tabbar button', { hasText: 'Inicio' }).click()
  await p.waitForTimeout(500)
  const r = await p.evaluate(() => {
    const card = document.querySelector('.card.accent')
    const h2 = card?.querySelector('h2')
    const hasButton = card
      ? Array.from(card.querySelectorAll('button')).some(b => (b.textContent ?? '').includes('Empezar la sesión'))
      : false
    return { found: !!card, h2: h2?.textContent ?? null, hasButton }
  })
  const s1 = check(r.h2 === 'Natación', 'SWIM-01/Inicio', `el h2 de .card.accent dice "${r.h2}", esperado "Natación"`)
  const s2 = check(r.hasButton, 'SWIM-01/Inicio', 'no hay boton de inicio dentro de .card.accent en un dia de natacion (la regresion que se corrige)')
  console.log(`\n===== SWIM-01 (dia de natacion en Inicio) =====\n  h2 "${r.h2}" ${s1} | boton de inicio presente ${r.hasButton} ${s2}`)
  await ctx.close()
}

// ---- SWIM-02: open the swim logger from Entrenar and drive it end to end.
// Two things this proves that nothing else covers:
//   1. SessionShell owns `.session-head`, so ADR-06's
//      `.main:has(.session-head) { display: block }` (styles.css) applies
//      automatically on the swim screen too — asserted here at 1440px,
//      which had ZERO coverage for ANY screen before this check existed.
//   2. R7's fix end to end: filling + marking a block enables "Terminar",
//      and finishing lands a swim row in the history. ----
{
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  await p.locator('.tabbar button', { hasText: 'Entrenar' }).click()
  await p.waitForTimeout(400)
  await p.locator('[data-testid="start-swim"]').click()
  await p.waitForTimeout(600)

  const shell = await p.evaluate(() => {
    const main = document.querySelector('.main')
    return {
      hasHead: !!document.querySelector('.session-head'),
      mainDisplay: main ? getComputedStyle(main).display : null,
    }
  })
  const s1 = check(shell.hasHead, 'SWIM-02/session-head', '.session-head no existe en la pantalla de natacion')
  const s2 = check(shell.mainDisplay === 'block', 'SWIM-02/ADR-06',
    `.main tiene display "${shell.mainDisplay}" a 1440px, se esperaba "block" (.main:has(.session-head), styles.css)`)

  await p.locator('button', { hasText: '+ Agregar bloque' }).click()
  await p.waitForTimeout(300)
  const finishBtn = p.locator('.session-head button.primary', { hasText: 'Terminar' })
  const disabledBefore = await finishBtn.isDisabled()
  const s3 = check(disabledBefore, 'SWIM-02/Terminar', 'Terminar deberia arrancar deshabilitado con un bloque vacio, sin datos cargados')

  await p.locator('.setnow input').nth(0).fill('16')
  await p.locator('.setnow input').nth(1).fill('8:00')
  await p.locator('.setnow .check').click()
  await p.waitForTimeout(300)
  const disabledAfter = await finishBtn.isDisabled()
  const s4 = check(!disabledAfter, 'SWIM-02/Terminar', 'Terminar sigue deshabilitado tras cargar largos+tiempo y marcar el bloque')

  await finishBtn.click()
  await p.waitForTimeout(700)
  const historyText = await p.evaluate(() => document.querySelector('.tablewrap')?.textContent ?? '')
  const s5 = check(historyText.includes('Natación'), 'SWIM-02/Historial', `el historial no muestra una fila de natacion: "${historyText.slice(0, 200)}"`)

  console.log(
    `\n===== SWIM-02 (registrador de natacion, 1440px) =====\n` +
      `  .session-head ${s1} | ADR-06 .main display=block ${s2} | Terminar arranca deshabilitado ${s3} | se habilita al cargar+marcar ${s4} | historial muestra la fila ${s5}`,
  )
  await ctx.close()
}

await br.close()
const ok = report('RESUMEN')
if (!ok) process.exit(1)

// Responsive/UI harness for fitplan — HARNESS-01: forces every routine of the
// active plan and worst-case strings across a matrix of viewports, plus the
// editable-plan scenarios (MIG, PLAN, SHEET, GUIDE, PAIN, LAYOUT).
// Usage:  BASE=http://localhost:5173/ pnpm check:ui
// See test/README.md for what this checks and how to add a check.
import { chromium } from 'playwright-core'
import { createChecklist, readStoreValue, resolveChromiumPath, seedAll, seedConfig, seedMeasurements, seedSessions } from './lib.mjs'

const BASE = process.env.BASE || 'https://john-santa.github.io/fitplan/'
const OUT = process.env.OUT
const TAP_MIN = 44

// Mirrors src/lib/calc.ts's todayISO() exactly (local date, not UTC) — this
// file stays dependency-light and does not import from src/.
const todayISO = (d = new Date()) => {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// The active plan's routines, in the order of DEFAULT_PLAN.routines in
// src/lib/defaultPlan.ts (Dia 1..5 of the "espalda protegida" plan) — mirrored,
// not imported, same reasoning as todayISO() above. The legacy routines
// dia1..dia3 are ARCHIVED by the migration: they have no start button and are
// only exercised by the LEGACY-*/MIG-* scenarios. `id` drives the testid-bound
// clicks (start-${id}) instead of an ordinal button.primary.nth(i), which would
// silently repoint the moment another start button (e.g. "Nadar") moves.
const PLAN_ROUTINES = [
  { id: 'espalda-d1', label: 'Día 1', name: 'Día 1 – Tren inferior A', short: 'Tren inferior A' },
  { id: 'espalda-d2', label: 'Día 2', name: 'Día 2 – Tren superior A', short: 'Tren superior A' },
  { id: 'espalda-d3', label: 'Día 3', name: 'Día 3 – Core, movilidad y cardio', short: 'Core, movilidad y cardio' },
  { id: 'espalda-d4', label: 'Día 4', name: 'Día 4 – Tren inferior B', short: 'Tren inferior B' },
  { id: 'espalda-d5', label: 'Día 5', name: 'Día 5 – Tren superior B', short: 'Tren superior B' },
]
// App tabs, in tab-bar order (src/App.tsx). Guia is not a tab: it opens from Plan.
const TABS = ['Inicio', 'Entrenar', 'Plan', 'Medidas', 'Ajustes']

// Seeded into every viewport context below (F1-6) so SwimProgress's charts
// have real multi-point data instead of the "Sin datos todavia" empty
// state — an empty-state pass would prove nothing about the SVG's actual
// geometry. Two sessions (one with an untimed block, to exercise the same
// "distance counts, pace doesn't" split disciplines.test.ts covers) so the
// Chart <path> actually draws a line, not just a single point.
const SWIM_PROGRESS_SEED = [
  {
    kind: 'swim',
    id: 'swim-progress-1',
    date: '2026-07-20',
    startedAt: Date.parse('2026-07-20T20:00:00'),
    finishedAt: Date.parse('2026-07-20T20:45:00'),
    poolLengthM: 25,
    blocks: [
      { index: 0, distanceM: 400, timeSec: 480, stroke: 'freestyle', done: true },
      { index: 1, distanceM: 200, timeSec: null, stroke: 'mixed', done: true },
    ],
    rpe: 6,
    notes: '',
  },
  {
    kind: 'swim',
    id: 'swim-progress-2',
    date: todayISO(),
    startedAt: Date.now() - 2700000,
    finishedAt: Date.now(),
    poolLengthM: 25,
    blocks: [{ index: 0, distanceM: 600, timeSec: 660, stroke: 'freestyle', done: true }],
    rpe: 7,
    notes: '',
  },
]

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
  // Seeds SWIM_PROGRESS_SEED then navigates with waitUntil:'networkidle',
  // same as the plain p.goto() this replaces (F1-6) — every check below in
  // this viewport's context now has real swim history to exercise, notably
  // SWIM-04 further down.
  await seedSessions(p, SWIM_PROGRESS_SEED, BASE)
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
  for (const tab of TABS) {
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
    check(g.navs === 1 && g.navButtons === TABS.length, `${v.n}/${tab}/NAV-02`,
      `navs=${g.navs} botones=${g.navButtons}, deben ser 1 y ${TABS.length} (una sola nav en el DOM)`)
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

  // ---- HARNESS-01: force every routine of the active plan ----
  for (let i = 0; i < PLAN_ROUTINES.length; i++) {
    const R = PLAN_ROUTINES[i]
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
      // ORD-01: the number of start buttons must equal the active routine
      // count PLUS the swim card (F1-5's "Nadar" card, `[data-testid="start-swim"]`,
      // is deliberately `button.primary` too, for visual consistency with the
      // routine cards). Archived routines (legacy dia1..dia3, and any the
      // person archives) have NO start button, so they must not count here —
      // this is what keeps ORD-01 meaningful now that the routine list comes
      // from the persisted plan instead of a hardcoded constant: it fails
      // loudly if an archived routine leaks a start button or an active one
      // loses its own, instead of silently exercising the wrong routine.
      const primCount = await p.locator('button.primary').count()
      check(primCount === PLAN_ROUTINES.length + 1, `${v.n}/ORD-01`,
        `hay ${primCount} botones button.primary en Entrenar, se esperaban ${PLAN_ROUTINES.length + 1} (uno por rutina activa + Nadar)`)
      for (const legacyId of ['dia1', 'dia2', 'dia3']) {
        const n = await p.locator(`[data-testid="start-${legacyId}"]`).count()
        check(n === 0, `${v.n}/ORD-01`, `la rutina archivada ${legacyId} tiene ${n} boton(es) de inicio, deberia tener 0`)
      }
    }
    const startBtn = p.locator(`[data-testid="start-${R.id}"]`)
    if ((await startBtn.count()) === 0) {
      check(false, `${v.n}/${R.label}`, `no hay boton start-${R.id} en Entrenar`)
      console.log(`  [${R.label}] no disponible`)
      continue
    }
    await startBtn.click()
    await p.waitForTimeout(800)
    const g = await p.evaluate(geometry)
    if (!g.rail) {
      check(false, `${v.n}/${R.label}`, 'la sesion no muestra el riel de ejercicios (.rail)')
      console.log(`  [${R.label}] sin rail`)
      continue
    }
    // WARMUP-01: every routine of the default plan has `warmup: true`, so the
    // rail must start with the "Cal" step (the fixed warm-up) — which also
    // shifts every exercise index by one (the "01" cell is the 2nd button).
    const firstCell = ((await p.locator('.rail button').first().textContent()) ?? '').trim()
    check(firstCell === 'Cal', `${v.n}/${R.label}/WARMUP-01`, `la primera celda del riel dice "${firstCell}", se esperaba "Cal" (calentamiento)`)
    const s1 = check(g.rail.anchoMin >= TAP_MIN, `${v.n}/${R.label}`, `rail celda ancho ${g.rail.anchoMin}px < ${TAP_MIN}`)
    check(g.rail.alto >= TAP_MIN, `${v.n}/${R.label}/RAIL-03`, `rail celda ALTO ${g.rail.alto}px < ${TAP_MIN}`)
    const s2 = check(g.overflowX === 0, `${v.n}/${R.label}`, `overflowX=${g.overflowX}px`)
    const fitsSetnow = g.setnowAlto === null || g.util >= g.setnowAlto
    const s3 = check(fitsSetnow, `${v.n}/${R.label}`, `setnow ${g.setnowAlto}px no entra en ${g.util}px utiles`)
    console.log(
      `  [${R.label.padEnd(8)}] ${g.rail.n} pasos | celda ${String(g.rail.anchoMin).padStart(5)}px ${s1} | scroll:${g.rail.scrollea ? 'si' : 'no'} | chrome ${g.chrome}px (${g.pct}%) util ${g.util}px | setnow ${g.setnowAlto}px ${s3} | ovf ${g.overflowX} ${s2}`,
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
        check(Math.abs(after.y - before) < 3, `${v.n}/${R.label}/SCROLL`, `scrollIntoView movio el documento ${before}->${after.y}`)
      }
      await p.locator('.rail button').nth(0).click()
      await p.waitForTimeout(400)
    }

    // ---- worst real case: mark a set so the rest timer starts (fixed, ~91px) ----
    // The first rail step is the warm-up (no sets), so jump to the first
    // exercise ("01") before looking for "Marcar serie".
    await p.locator('.rail button', { hasText: /^01$/ }).click()
    await p.waitForTimeout(300)
    const chk = p.getByRole('button', { name: /Marcar serie/ })
    if (await chk.count()) {
      await chk.first().click()
      await p.waitForTimeout(700)
      const t = await p.evaluate(geometry)
      const timerOn = (await p.locator('.timer').count()) > 0
      if (timerOn) {
        const fits = t.setnowAlto === null || t.util >= t.setnowAlto
        const st = check(fits, `${v.n}/${R.label}/CON-TIMER`, `setnow ${t.setnowAlto}px no entra en ${t.util}px utiles (chrome ${t.chrome}px = ${t.pct}%)`)
        const so = check(t.overflowX === 0, `${v.n}/${R.label}/CON-TIMER`, `overflowX=${t.overflowX}px`)
        console.log(`  [${(R.label + ' +timer').padEnd(14)}] chrome ${t.chrome}px (${t.pct}%) util ${t.util}px | setnow ${t.setnowAlto}px ${st} | ovf ${t.overflowX} ${so}`)
      }
    }
  }

  // ---- SWIM-04: swim progression view (F1-6), reusing the existing
  // per-viewport geometry() assertions across all 8 VIEWPORTS. The real
  // risk here is Chart.tsx's fixed viewBox="0 0 700 H" surviving the scale
  // down from 700 to 320px without producing horizontal overflow — the same
  // overflowX===0 check already run per-tab above, just aimed at a view no
  // check has ever opened before. Needs SWIM_PROGRESS_SEED (seeded above,
  // before this context's first navigation) so the charts hold real
  // multi-point data instead of the trivially-safe "Sin datos todavia"
  // empty state. ----
  await p.locator('.tabbar button', { hasText: 'Entrenar' }).click()
  await p.waitForTimeout(400)
  // The HARNESS-01 loop above leaves the last routine's session active
  // (it only discards at the START of its next iteration, and there is no
  // next one) — same discard-first pattern that loop uses, or the card
  // list below is not in the DOM and the locator hangs on a 30s timeout
  // instead of a clean check() failure (see "Adding a check" in
  // test/README.md).
  const swimProgDanger = p.locator('button.danger')
  if (await swimProgDanger.count()) {
    p.once('dialog', d => d.accept())
    await swimProgDanger.click()
    await p.waitForTimeout(500)
    await p.locator('.tabbar button', { hasText: 'Entrenar' }).click()
    await p.waitForTimeout(400)
  }
  await p.locator('.card', { hasText: 'Natación' }).locator('button', { hasText: 'Ver progresión' }).click()
  await p.waitForTimeout(500)
  const gp = await p.evaluate(geometry)
  const sp1 = check(gp.overflowX === 0, `${v.n}/SwimProgress/SWIM-04`, `overflowX=${gp.overflowX}px`)
  const sp2 = check(gp.tapsChicos.length === 0, `${v.n}/SwimProgress/SWIM-04`, `taps<44: ${JSON.stringify(gp.tapsChicos.slice(0, 3))}`)
  console.log(`  [SwimProgress] overflowX ${String(gp.overflowX).padStart(3)}px ${sp1} | taps<44: ${String(gp.tapsChicos.length).padStart(2)} ${sp2}`)

  // ---- worst-case hero string ----
  await p.locator('.tabbar button', { hasText: 'Inicio' }).click()
  await p.waitForTimeout(500)
  const hero = await p.evaluate(names => {
    const h = document.querySelector('.hero')
    if (!h) return null
    // The .slab only renders on a training day (Mon-Fri with the default
    // plan). On weekends, inject one so the worst-case strings are still
    // measured instead of the check passing vacuously.
    let slab = h.querySelector('.slab')
    const injected = []
    if (!slab) {
      const br = document.createElement('br')
      slab = document.createElement('span')
      slab.className = 'slab'
      h.append(br, slab)
      injected.push(br, slab)
    }
    const out = []
    for (const nm of names) {
      const o = slab.textContent
      slab.textContent = nm
      out.push({
        nm,
        caja: slab.scrollWidth > slab.clientWidth + 1,
        pagina: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      })
      slab.textContent = o
    }
    injected.forEach(n => n.remove())
    return out
  }, PLAN_ROUTINES.map(r => r.short))
  if (hero) {
    for (const c of hero) {
      const s = check(!c.caja && !c.pagina, `${v.n}/hero"${c.nm}"`, `desborda caja:${c.caja} pagina:${c.pagina}`)
      console.log(`  [hero ${c.nm.slice(0, 12).padEnd(12)}] desborda caja:${String(c.caja).padStart(5)} pagina:${String(c.pagina).padStart(5)} ${s}`)
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

// ---- LEGACY-01: the exact pre-change byte shape (no `kind`, routineId
// 'dia1') must still normalize and render — this is the migration proof. Covers
// db.ts:getSessions -> store.tsx:reload -> Train.tsx history end to end. Since
// the editable plan, 'dia1' is an ARCHIVED routine: this also proves the
// migration kept it (name in the history, exercise names in the detail, and an
// "archivada" card in Entrenar), instead of the session being dropped. ----
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
  const trainText = await p.evaluate(() => document.querySelector('.col-a')?.textContent ?? '')
  const s4 = check(trainText.includes('Día 1 — Pierna') && trainText.includes('archivada'), 'LEGACY-01/archivada',
    `Entrenar no muestra la rutina heredada como "archivada": "${trainText.slice(-200)}"`)
  // Detail: exercise names resolve through the library, not raw ids.
  await p.locator('.tablewrap .list-item').first().click()
  await p.waitForTimeout(400)
  const detail = await p.evaluate(() => document.querySelector('.main')?.textContent ?? '')
  const s5 = check(detail.includes('Día 1 — Pierna') && detail.includes('Prensa de piernas') && !detail.includes('leg-press'), 'LEGACY-01/detalle',
    `el detalle no muestra "Día 1 — Pierna" + "Prensa de piernas" (sin id crudo): "${detail.slice(0, 240)}"`)
  const s3 = check(errs.length === 0, 'LEGACY-01/pageerror', `errores de pagina: ${errs.join('; ')}`)
  console.log(`\n===== LEGACY-01 (sesion heredada sin \`kind\`) =====\n  titulo "Día 1 — Pierna" ${s1} | volumen 960 kg ${s2} | tarjeta archivada ${s4} | detalle con nombres ${s5} | sin pageerror ${s3}`)
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

// ---- LEGACY-03 (S4): a session whose routine is unknown to the plan (never
// existed, or was hard-deleted by an older build) is KEPT and still listed —
// before the editable plan, normalizeStrengthSession dropped it silently. ----
{
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message))
  const orphan = {
    kind: 'strength',
    id: 'huerfana-legacy03',
    routineId: 'rutina-que-ya-no-existe',
    date: todayISO(),
    startedAt: Date.now() - 600000,
    finishedAt: Date.now(),
    sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 50, reps: 10, done: true }],
    notes: '',
  }
  await seedSessions(p, [orphan], BASE)
  await p.locator('.tabbar button', { hasText: 'Entrenar' }).click()
  await p.waitForTimeout(500)
  const rowCount = await p.locator('.tablewrap .list-item').count()
  const s1 = check(rowCount === 1, 'LEGACY-03/Entrenar', `hay ${rowCount} filas de historial, se esperaba 1 (una sesion de rutina desconocida no se descarta)`)
  const s2 = check(errs.length === 0, 'LEGACY-03/pageerror', `errores de pagina: ${errs.join('; ')}`)
  console.log(`\n===== LEGACY-03 (rutina desconocida) =====\n  1 fila de historial ${s1} | sin pageerror ${s2}`)
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
    id: 'espalda-d1-mix01',
    routineId: 'espalda-d1',
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

// =====================================================================
// Editable-plan scenarios (MIG-01, PLAN-01/02, SHEET-01, GUIDE-01, PAIN-01,
// LAYOUT-01). Each one gets its own fresh browser context (= empty
// IndexedDB), so none depends on another's state.
// =====================================================================

const goTab = async (p, name) => {
  await p.locator('.tabbar button', { hasText: name }).click()
  await p.waitForTimeout(400)
}

// Contexts opened by the running scenario, so a thrown error (a missing
// element, a timeout) closes them and is reported as a failed check instead of
// aborting the whole harness run and hiding every scenario after it.
const openCtxs = []
async function scenario(name, fn) {
  try {
    await fn()
  } catch (e) {
    const msg = String(e?.message ?? e).split('\n')[0]
    check(false, `${name}/excepcion`, msg)
    console.log(`\n===== ${name} =====\n  \x1b[31mEXCEPCION\x1b[0m ${msg}`)
  } finally {
    for (const c of openCtxs.splice(0)) await c.close().catch(() => {})
  }
}

// Opens a fresh context on BASE with a pageerror collector. `seed` (optional)
// runs INSTEAD of the plain navigation, for scenarios that need data on disk
// before the app's first boot.
async function openScenario(vp, seed) {
  const ctx = await br.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: 2,
    isMobile: !!vp.mob,
    hasTouch: !!vp.mob,
    colorScheme: vp.colorScheme ?? 'light',
  })
  openCtxs.push(ctx)
  const p = await ctx.newPage()
  p.setDefaultTimeout(10000)
  const errs = []
  p.on('pageerror', e => errs.push(e.message))
  if (seed) await seed(p)
  else await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  return { ctx, p, errs }
}

// Entrenar -> start the routine's session, ready on its first exercise ("01").
async function startSession(p, routineId) {
  await goTab(p, 'Entrenar')
  await p.locator(`[data-testid="start-${routineId}"]`).click()
  await p.waitForTimeout(700)
}
const railStep = (p, label) => p.locator('.rail button', { hasText: new RegExp(`^${label}$`) })
async function gotoStep(p, label) {
  await railStep(p, label).click()
  await p.waitForTimeout(300)
}

const MOBILE = { w: 390, h: 844, mob: true }

// ---- MIG-01: the first boot of this version, on a device that holds the OLD
// shipped config (legacy week Mon/Wed/Fri = dia1..dia3, Tue/Thu swim, Sat walk,
// Sun rest, block 2026-08-04..2026-09-28), legacy dia1 sessions and NO plan
// record. After boot: the plan record exists (legacy routines archived, the 5
// new ones active), the week is Mon-Fri = Dias 1-5, the block is
// 2026-11-16..2027-02-07, and the legacy sessions still show in Entrenar. ----
await scenario('MIG-01', async () => {
  const LEGACY_SWIM_NOTE = '20:00 a 21:00. Cierra el segundo trabajo a las 19:30 y come la fruta o el batido antes de salir. En casa a las 22:30, cena lista para calentar y a dormir a las 23:30.'
  // `git show 4d0c2c0:src/lib/plan.ts` -> DEFAULT_CONFIG, the last shipped
  // config before the editable plan. Inlined on purpose (a fixture, not a
  // mirror of src/): it must not change when the app's default does.
  const OLD_SHIPPED_CONFIG = {
    heightCm: 173,
    blockStart: '2026-08-04',
    blockEnd: '2026-09-28',
    goal: { weight: 76.5, fatPct: 22.2, fatMass: 17.0, muscle: 32.2, water: 43.6, waist: 96.5, hip: 97.5, chest: 102.5, neck: 40.5 },
    weeklyRoutine: [
      { kind: 'rest', title: '', note: 'Estiramiento y caminata liviana. Dedica dos horas a cocinar las cinco cenas de la semana: con cena a las 22:15, esta es la tarea más importante del domingo.' },
      { kind: 'training', routineId: 'dia1', title: '', note: '20:30 en el gimnasio' },
      { kind: 'swim', title: '', note: LEGACY_SWIM_NOTE },
      { kind: 'training', routineId: 'dia2', title: '', note: '20:30 en el gimnasio' },
      { kind: 'swim', title: '', note: LEGACY_SWIM_NOTE },
      { kind: 'training', routineId: 'dia3', title: '', note: '20:30 en el gimnasio' },
      { kind: 'walk', title: '', note: '60 a 75 minutos a la hora que quieras. Dormir 8 h 45.' },
    ],
    poolLengthM: 25,
  }
  const legacySessions = [
    {
      id: 'dia1-mig01-a', routineId: 'dia1', date: '2026-08-10',
      startedAt: Date.parse('2026-08-10T20:30:00'), finishedAt: Date.parse('2026-08-10T21:30:00'),
      sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 12, done: true }], notes: '',
    },
    {
      kind: 'strength', id: 'dia1-mig01-b', routineId: 'dia1', date: '2026-08-17',
      startedAt: Date.parse('2026-08-17T20:30:00'), finishedAt: Date.parse('2026-08-17T21:30:00'),
      sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 85, reps: 12, done: true }], notes: '',
    },
  ]

  const { ctx, p, errs } = await openScenario(MOBILE, pg => seedAll(pg, { config: OLD_SHIPPED_CONFIG, sessions: legacySessions }, BASE))
  const plan = await readStoreValue(p, 'plan')
  const cfg = await readStoreValue(p, 'config')
  const ids = new Map((plan?.routines ?? []).map(r => [r.id, r]))
  const s1 = check(!!plan && Array.isArray(plan.routines), 'MIG-01/plan', 'no hay registro "plan" en IndexedDB tras el arranque')
  const newOk = PLAN_ROUTINES.every(r => ids.has(r.id) && !ids.get(r.id).archived)
  const legacyOk = ['dia1', 'dia2', 'dia3'].every(id => ids.get(id)?.archived === true)
  const s2 = check(newOk && legacyOk, 'MIG-01/rutinas',
    `espalda-d1..5 activas: ${newOk}; dia1..3 archivadas: ${legacyOk} (ids: ${[...ids.keys()].join(',')})`)
  const wk = cfg?.weeklyRoutine ?? []
  const wkOk = PLAN_ROUTINES.every((r, i) => wk[i + 1]?.kind === 'training' && wk[i + 1]?.routineId === r.id) &&
    wk[0]?.kind === 'rest' && wk[6]?.kind === 'rest' && !wk.some(d => d.kind === 'swim' || d.kind === 'walk')
  const s3 = check(wkOk, 'MIG-01/semana', `la semana guardada no es Lun-Vie = Dias 1-5 + fin de semana de descanso: ${JSON.stringify(wk.map(d => d.kind === 'training' ? d.routineId : d.kind))}`)
  const s4 = check(cfg?.blockStart === '2026-11-16' && cfg?.blockEnd === '2027-02-07', 'MIG-01/bloque',
    `bloque guardado ${cfg?.blockStart}..${cfg?.blockEnd}, esperado 2026-11-16..2027-02-07`)

  // UI: Ajustes shows Mon-Fri = Dias 1-5 and the new block dates.
  await goTab(p, 'Ajustes')
  const rows = await p.evaluate(() => Array.from(document.querySelectorAll('summary.list-item')).map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()))
  const dayRows = [['Lunes', 'Día 1'], ['Martes', 'Día 2'], ['Miércoles', 'Día 3'], ['Jueves', 'Día 4'], ['Viernes', 'Día 5']]
  const rowsOk = dayRows.every(([day, title]) => rows.some(r => r.startsWith(day) && r.includes(title)))
  const s5 = check(rowsOk, 'MIG-01/Ajustes-semana', `Ajustes no muestra Lun-Vie = Días 1-5: ${JSON.stringify(rows)}`)
  const dates = p.locator('input[type="date"]')
  const gotStart = await dates.nth(0).inputValue()
  const gotEnd = await dates.nth(1).inputValue()
  const s6 = check(gotStart === '2026-11-16' && gotEnd === '2027-02-07', 'MIG-01/Ajustes-bloque',
    `Ajustes muestra el bloque ${gotStart}..${gotEnd}, esperado 2026-11-16..2027-02-07`)

  // UI: legacy sessions still listed in Entrenar's history.
  await goTab(p, 'Entrenar')
  const rowCount = await p.locator('.tablewrap .list-item').count()
  const histText = await p.evaluate(() => document.querySelector('.tablewrap')?.textContent ?? '')
  const s7 = check(rowCount === 2 && histText.includes('Día 1 — Pierna'), 'MIG-01/historial',
    `el historial muestra ${rowCount} filas (esperadas 2) y "${histText.slice(0, 120)}"`)

  // Idempotent: a second boot rewrites nothing (the plan record is the marker).
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(700)
  const plan2 = await readStoreValue(p, 'plan')
  const cfg2 = await readStoreValue(p, 'config')
  const s8 = check(JSON.stringify(plan2) === JSON.stringify(plan) && JSON.stringify(cfg2) === JSON.stringify(cfg), 'MIG-01/idempotente',
    'el plan o la config cambiaron en el segundo arranque')
  const s9 = check(errs.length === 0, 'MIG-01/pageerror', `errores de pagina: ${errs.join('; ')}`)
  console.log(
    `\n===== MIG-01 (config vieja + sesiones heredadas, sin plan) =====\n` +
      `  plan guardado ${s1} | rutinas (5 activas, 3 archivadas) ${s2} | semana guardada ${s3} | bloque guardado ${s4}\n` +
      `  Ajustes Lun-Vie = Días 1-5 ${s5} | Ajustes bloque ${gotStart}..${gotEnd} ${s6} | historial heredado ${s7} | 2º arranque idempotente ${s8} | sin pageerror ${s9}`,
  )
  await ctx.close()
})

// ---- PLAN-01 (S4/S11): Plan tab -> open "Día 1 – Tren inferior A" -> add an
// exercise from the picker -> reload -> it is still there (persisted in
// IndexedDB, not component state). Also: an exercise already in the routine
// shows disabled with "En la rutina" in the picker. ----
await scenario('PLAN-01', async () => {
  const { ctx, p, errs } = await openScenario(MOBILE)
  await goTab(p, 'Plan')
  await p.locator('.pe-routine', { hasText: 'Día 1 – Tren inferior A' }).click()
  await p.waitForTimeout(400)
  const before = await p.locator('.pe-slot').count()
  await p.getByRole('button', { name: 'Agregar ejercicio', exact: true }).click()
  await p.waitForTimeout(400)
  const picker = p.getByRole('dialog', { name: 'Agregar ejercicio' })
  const s0 = check((await picker.count()) === 1, 'PLAN-01/picker', 'no se abrio el selector "Agregar ejercicio" (role=dialog)')

  // Already in the routine -> disabled + "En la rutina".
  await picker.getByLabel('Buscar').fill('Prensa de piernas')
  await p.waitForTimeout(250)
  const taken = picker.locator('.pe-pick', { hasText: 'Prensa de piernas' }).first()
  const takenDisabled = (await taken.count()) > 0 && (await taken.isDisabled())
  const takenText = (await taken.count()) > 0 ? (await taken.textContent()) ?? '' : ''
  const s1 = check(takenDisabled && takenText.includes('En la rutina'), 'PLAN-01/en-la-rutina',
    `"Prensa de piernas" (ya en el Día 1) deberia estar deshabilitado con "En la rutina": disabled=${takenDisabled}, texto="${takenText.slice(0, 80)}"`)

  // Not in the routine -> pick it.
  await picker.getByLabel('Buscar').fill('Dead bug')
  await p.waitForTimeout(250)
  const fresh = picker.locator('.pe-pick', { hasText: 'Dead bug' }).first()
  const freshEnabled = (await fresh.count()) > 0 && (await fresh.isEnabled())
  const s2 = check(freshEnabled, 'PLAN-01/disponible', '"Dead bug" no esta disponible (habilitado) en el selector')
  if (freshEnabled) await fresh.click()
  await p.waitForTimeout(600)
  const after = await p.locator('.pe-slot').count()
  const s3 = check(after === before + 1, 'PLAN-01/agregado', `la rutina tenia ${before} ejercicios y ahora ${after}, se esperaba ${before + 1}`)
  const s3b = check((await p.getByRole('dialog').count()) === 0, 'PLAN-01/cierra', 'el selector sigue abierto tras elegir el ejercicio')

  // Reload: persisted.
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(700)
  await goTab(p, 'Plan')
  await p.locator('.pe-routine', { hasText: 'Día 1 – Tren inferior A' }).click()
  await p.waitForTimeout(400)
  const reloaded = await p.locator('.pe-slot').count()
  const hasDeadBug = (await p.locator('.pe-slot', { hasText: 'Dead bug' }).count()) === 1
  const s4 = check(reloaded === before + 1 && hasDeadBug, 'PLAN-01/persistido',
    `tras recargar hay ${reloaded} ejercicios (esperados ${before + 1}), "Dead bug" presente: ${hasDeadBug}`)
  const plan = await readStoreValue(p, 'plan')
  const d1 = plan?.routines?.find(r => r.id === 'espalda-d1')
  const inStore = !!d1?.blocks?.some(b => b.slots.some(sl => sl.exerciseId === 'dead-bug'))
  const s5 = check(inStore, 'PLAN-01/indexeddb', 'el registro "plan" en IndexedDB no contiene el slot dead-bug en espalda-d1')
  const s6 = check(errs.length === 0, 'PLAN-01/pageerror', `errores de pagina: ${errs.join('; ')}`)
  console.log(
    `\n===== PLAN-01 (agregar ejercicio y persistir) =====\n` +
      `  selector ${s0} | "En la rutina" deshabilitado ${s1} | disponible ${s2} | agregado ${before}->${after} ${s3} | cierra ${s3b} | persiste tras recargar ${s4} | en IndexedDB ${s5} | sin pageerror ${s6}`,
  )
  await ctx.close()
})

// ---- PLAN-02 (S4/S11): archive a routine -> confirm -> it moves to
// "Archivadas" (not deleted) -> "Deshacer" restores it. ----
await scenario('PLAN-02', async () => {
  const { ctx, p, errs } = await openScenario(MOBILE)
  await goTab(p, 'Plan')
  const target = 'Día 5 – Tren superior B'
  const activeHas = () => p.locator('.pe-list .pe-routine', { hasText: target }).count()
  const archivedSummary = async () => ((await p.locator('details.pe-archived summary').textContent()) ?? '').trim()
  const startSummary = await archivedSummary() // legacy dia1..3 are already archived
  const startN = Number(/\((\d+)\)/.exec(startSummary)?.[1] ?? NaN)

  await p.locator('.pe-routine', { hasText: target }).click()
  await p.waitForTimeout(400)
  await p.getByRole('button', { name: 'Archivar rutina', exact: true }).click()
  await p.waitForTimeout(400)
  const confirm = p.getByRole('dialog', { name: /¿Archivar/ })
  const s0 = check((await confirm.count()) === 1, 'PLAN-02/confirmar', 'archivar no pide confirmacion (role=dialog "¿Archivar …?")')
  await confirm.getByRole('button', { name: 'Archivar rutina', exact: true }).click()
  await p.waitForTimeout(700)

  const s1 = check((await activeHas()) === 0, 'PLAN-02/sale-de-activas', `"${target}" sigue entre las rutinas activas tras archivarla`)
  const midSummary = await archivedSummary()
  const s2 = check(midSummary === `Archivadas (${startN + 1})`, 'PLAN-02/archivadas', `resumen "${midSummary}", esperado "Archivadas (${startN + 1})"`)
  await p.locator('details.pe-archived summary').click()
  await p.waitForTimeout(200)
  const inArchived = (await p.locator('details.pe-archived .pe-slot', { hasText: target }).count()) === 1
  const s3 = check(inArchived, 'PLAN-02/en-archivadas', `"${target}" no aparece dentro de "Archivadas"`)
  const stored = (await readStoreValue(p, 'plan'))?.routines?.find(r => r.id === 'espalda-d5')
  const s4 = check(stored?.archived === true, 'PLAN-02/no-se-borra', 'la rutina archivada no esta en el plan guardado con archived=true (se borro?)')

  await p.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await p.waitForTimeout(700)
  const s5 = check((await activeHas()) === 1, 'PLAN-02/deshacer', `"${target}" no volvio a las rutinas activas tras "Deshacer"`)
  const endSummary = await archivedSummary()
  const s6 = check(endSummary === `Archivadas (${startN})`, 'PLAN-02/deshacer-contador', `resumen "${endSummary}", esperado "Archivadas (${startN})"`)
  const restored = (await readStoreValue(p, 'plan'))?.routines?.find(r => r.id === 'espalda-d5')
  const s7 = check(restored && !restored.archived, 'PLAN-02/deshacer-guardado', 'tras "Deshacer" el plan guardado sigue con la rutina archivada')
  const s8 = check(errs.length === 0, 'PLAN-02/pageerror', `errores de pagina: ${errs.join('; ')}`)
  console.log(
    `\n===== PLAN-02 (archivar y deshacer) =====\n` +
      `  confirma ${s0} | sale de activas ${s1} | "Archivadas (${startN + 1})" ${s2} | dentro de Archivadas ${s3} | guardada, no borrada ${s4} | Deshacer restaura ${s5} | contador ${s6} | guardado ${s7} | sin pageerror ${s8}`,
  )
  await ctx.close()
})

// ---- SHEET-01 (S9/S12): the exercise sheet from a session — a real modal
// (role=dialog), a MuscleWiki link that opens a new tab safely with the
// verified slug, Escape closes it, focus returns to the opener. ----
await scenario('SHEET-01', async () => {
  const { ctx, p, errs } = await openScenario(MOBILE)
  await startSession(p, 'espalda-d1')
  await gotoStep(p, '01') // Prensa de piernas (leg press)
  const opener = p.getByRole('button', { name: /Ver ficha de Prensa de piernas/ }).first()
  await opener.click()
  await p.waitForTimeout(400)
  const dialog = p.getByRole('dialog')
  const s1 = check((await dialog.count()) === 1 && (await dialog.isVisible()), 'SHEET-01/dialogo', 'la ficha no abre un role=dialog visible')
  const modal = await dialog.getAttribute('aria-modal')
  const s1b = check(modal === 'true', 'SHEET-01/aria-modal', `aria-modal="${modal}", esperado "true"`)
  const link = dialog.getByRole('link', { name: /MuscleWiki/ })
  const attrs = (await link.count()) === 1
    ? { target: await link.getAttribute('target'), rel: (await link.getAttribute('rel')) ?? '', href: await link.getAttribute('href') }
    : null
  const s2 = check(attrs?.target === '_blank', 'SHEET-01/target', `target="${attrs?.target}", esperado "_blank"`)
  const s3 = check(/\bnoopener\b/.test(attrs?.rel ?? ''), 'SHEET-01/rel', `rel="${attrs?.rel}" no contiene "noopener"`)
  const s4 = check(attrs?.href === 'https://musclewiki.com/es-es/exercise/machine-leg-press', 'SHEET-01/href',
    `href="${attrs?.href}", esperado "https://musclewiki.com/es-es/exercise/machine-leg-press"`)
  const attribution = ((await dialog.locator('.sheet-attribution').textContent().catch(() => '')) ?? '')
  const s5 = check(attribution.includes('MuscleWiki'), 'SHEET-01/atribucion', `la ficha no muestra la linea de atribucion a MuscleWiki ("${attribution}")`)
  const closeBox = await dialog.getByRole('button', { name: 'Cerrar' }).boundingBox()
  const s6 = check(!!closeBox && closeBox.width >= TAP_MIN && closeBox.height >= TAP_MIN, 'SHEET-01/cerrar-44px',
    `el boton "Cerrar" mide ${closeBox ? `${closeBox.width}x${closeBox.height}` : 'n/a'}, minimo ${TAP_MIN}x${TAP_MIN}`)

  await p.keyboard.press('Escape')
  await p.waitForTimeout(400)
  const s7 = check((await p.getByRole('dialog').count()) === 0, 'SHEET-01/escape', 'Escape no cierra la ficha')
  const focusBack = await opener.evaluate(el => el === document.activeElement)
  const s8 = check(focusBack, 'SHEET-01/foco', 'tras cerrar con Escape el foco no volvio al boton que abrio la ficha')

  // The close button works too.
  await opener.click()
  await p.waitForTimeout(300)
  await p.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
  await p.waitForTimeout(300)
  const s9 = check((await p.getByRole('dialog').count()) === 0, 'SHEET-01/boton-cerrar', 'el boton "Cerrar" no cierra la ficha')
  const s10 = check(errs.length === 0, 'SHEET-01/pageerror', `errores de pagina: ${errs.join('; ')}`)
  console.log(
    `\n===== SHEET-01 (ficha del ejercicio desde la sesion) =====\n` +
      `  role=dialog ${s1} | aria-modal ${s1b} | target=_blank ${s2} | rel noopener ${s3} | href leg press ${s4} | atribucion ${s5} | cerrar>=44px ${s6}\n` +
      `  Escape cierra ${s7} | foco vuelve al opener ${s8} | boton Cerrar ${s9} | sin pageerror ${s10}`,
  )
  await ctx.close()
})

// ---- GUIDE-01 (S10): Plan -> "Guía": the urgent red-flag line is visible, the
// "evitar" table has the 8 rows of L1, "Volver" returns to Plan; and from a
// session the red-flags sheet opens in ONE tap. ----
await scenario('GUIDE-01', async () => {
  const URGENT = 'Pérdida de control de orina o esfínteres, o adormecimiento en la zona genital: esto es urgencia, ve a la clínica ese mismo día.'
  const { ctx, p, errs } = await openScenario(MOBILE)
  await goTab(p, 'Plan')
  await p.getByRole('button', { name: /Guía/ }).click()
  await p.waitForTimeout(500)
  const h1 = ((await p.locator('h1').first().textContent()) ?? '').trim()
  const s0 = check(h1 === 'Guía', 'GUIDE-01/titulo', `el h1 es "${h1}", esperado "Guía"`)
  const urgent = p.locator('.guide-red-flags li.is-urgent')
  const urgentText = (await urgent.count()) === 1 ? ((await urgent.textContent()) ?? '') : ''
  const s1 = check((await urgent.count()) === 1 && (await urgent.isVisible()) && urgentText.includes(URGENT), 'GUIDE-01/urgente',
    `la linea urgente de L1 no esta visible/completa: "${urgentText.slice(0, 120)}"`)
  const avoidRows = await p.locator('section[aria-labelledby="guide-avoid"] tbody tr').count()
  const s2 = check(avoidRows === 8, 'GUIDE-01/evitar', `la tabla "Ejercicios a evitar" tiene ${avoidRows} filas, esperadas 8`)
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const s2b = check(ov === 0, 'GUIDE-01/overflow', `overflowX=${ov}px en la Guia a ${MOBILE.w}px`)
  await p.getByRole('button', { name: /Volver/ }).click()
  await p.waitForTimeout(400)
  const backH1 = ((await p.locator('h1').first().textContent()) ?? '').trim()
  const s3 = check(backH1 === 'Tu plan', 'GUIDE-01/volver', `tras "Volver" el h1 es "${backH1}", esperado "Tu plan"`)

  // In-session: ONE tap on "Señales de alarma" opens the red-flags sheet.
  await startSession(p, 'espalda-d1')
  await p.getByRole('button', { name: /Señales de alarma/ }).click() // the single tap
  await p.waitForTimeout(400)
  const sheet = p.getByRole('dialog')
  const sheetText = (await sheet.count()) === 1 ? ((await sheet.textContent()) ?? '') : ''
  const s4 = check(sheetText.includes(URGENT), 'GUIDE-01/senales-1-toque', `un toque en "Señales de alarma" no muestra la hoja con la linea urgente ("${sheetText.slice(0, 100)}")`)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
  const s5 = check(errs.length === 0, 'GUIDE-01/pageerror', `errores de pagina: ${errs.join('; ')}`)
  console.log(
    `\n===== GUIDE-01 (Guía y señales de alarma) =====\n` +
      `  h1 "Guía" ${s0} | linea urgente visible ${s1} | tabla evitar ${avoidRows} filas ${s2} | sin overflow ${s2b} | Volver -> Plan ${s3} | señales en 1 toque ${s4} | sin pageerror ${s5}`,
  )
  await ctx.close()
})

// ---- PAIN-01 (S7): pain 0-10 per exercise with the traffic-light verdict as
// TEXT. 4/10 -> "Baja peso o rango"; saved with the session and shown under
// "Dolor registrado" in the detail. ----
await scenario('PAIN-01', async () => {
  const { ctx, p, errs } = await openScenario(MOBILE)
  await startSession(p, 'espalda-d1')
  await gotoStep(p, '01') // Prensa de piernas (leg press)
  const pain = p.getByLabel('Dolor de este ejercicio (0–10)').first()
  const verdictText = async () => ((await p.locator('.sp-verdict').first().textContent().catch(() => '')) ?? '').trim()
  const cases = [['1', /bien/i], ['4', /baja peso o rango/i], ['7', /cambia el ejercicio/i]]
  const caseResults = []
  for (const [value, re] of cases) {
    await pain.selectOption(value)
    await p.waitForTimeout(200)
    const t = await verdictText()
    caseResults.push(check(re.test(t) && (await p.locator('.sp-verdict').first().isVisible()), `PAIN-01/veredicto-${value}`, `con dolor ${value} el veredicto dice "${t}", esperado ${re}`))
  }
  await pain.selectOption('4')
  await p.waitForTimeout(200)
  await p.getByRole('button', { name: /Marcar serie/ }).first().click()
  await p.waitForTimeout(400)
  await p.locator('.session-head button.primary', { hasText: 'Terminar' }).click()
  await p.waitForTimeout(800)
  await p.locator('.tablewrap .list-item').first().click()
  await p.waitForTimeout(400)
  const main = await p.evaluate(() => document.querySelector('.main')?.textContent ?? '')
  const s1 = check(main.includes('Dolor registrado') && main.includes('4/10') && /baja peso o rango/i.test(main), 'PAIN-01/detalle',
    `el detalle no muestra "Dolor registrado" con 4/10 y "Baja peso o rango": "${main.slice(0, 260)}"`)
  const s2 = check(errs.length === 0, 'PAIN-01/pageerror', `errores de pagina: ${errs.join('; ')}`)
  console.log(
    `\n===== PAIN-01 (dolor 0–10 con semáforo) =====\n` +
      `  veredicto 1/4/7 ${caseResults.join('/')} | "Dolor registrado" en el detalle ${s1} | sin pageerror ${s2}`,
  )
  await ctx.close()
})

// ---- LAYOUT-01 (S12): at 375x812, light AND dark: no horizontal scroll and no
// visible interactive element under 44x44 on Home, Entrenar, Plan, the routine
// editor, the picker sheet, the Guide, and a Day 3 session (time hold + carry).
// Inline text links inside paragraphs are exempt. Offenders are reported with
// selector + size. ----
await scenario('LAYOUT-01', async () => {
  // Runs inside the page (page.evaluate ships only its own source). When a
  // dialog is open the audit is scoped to it: what sits behind a modal sheet
  // is not reachable.
  const layoutAudit = () => {
    const de = document.documentElement
    const dialog = document.querySelector('[role="dialog"]')
    const root = dialog ?? document
    const shown = e => {
      const r = e.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return false
      const cs = getComputedStyle(e)
      return cs.visibility !== 'hidden' && cs.display !== 'none'
    }
    const exempt = e => e.tagName === 'A' && getComputedStyle(e).display === 'inline' && !!e.closest('p')
    const label = e => {
      const cls = (e.className?.toString() ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.')
      const txt = (e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 28)
      return `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${cls ? `.${cls}` : ''} "${txt}"`
    }
    const small = Array.from(root.querySelectorAll('button,a[href],input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="checkbox"]'))
      .filter(e => shown(e) && !exempt(e))
      .map(e => ({ s: label(e), w: +e.getBoundingClientRect().width.toFixed(1), h: +e.getBoundingClientRect().height.toFixed(1) }))
      .filter(x => x.w < 44 || x.h < 44)
    return {
      overflow: de.scrollWidth - de.clientWidth,
      dialogOverflow: dialog ? dialog.scrollWidth - dialog.clientWidth : 0,
      small,
    }
  }

  for (const scheme of ['light', 'dark']) {
    const { ctx, p, errs } = await openScenario({ w: 375, h: 812, mob: true, colorScheme: scheme })
    const audit = async surface => {
      await p.waitForTimeout(250)
      const r = await p.evaluate(layoutAudit)
      const ok1 = check(r.overflow === 0 && r.dialogOverflow <= 0, `LAYOUT-01/${scheme}/${surface}`, `scroll horizontal: documento ${r.overflow}px, hoja ${r.dialogOverflow}px`)
      const ok2 = check(r.small.length === 0, `LAYOUT-01/${scheme}/${surface}`,
        `${r.small.length} elementos interactivos < ${TAP_MIN}x${TAP_MIN}: ${r.small.slice(0, 6).map(x => `${x.s} ${x.w}x${x.h}`).join(' | ')}`)
      console.log(`  [${scheme.padEnd(5)} ${surface.padEnd(18)}] overflowX ${String(r.overflow).padStart(3)}px ${ok1} | <44px: ${String(r.small.length).padStart(2)} ${ok2}`)
    }
    console.log(`\n===== LAYOUT-01 (375x812, ${scheme}) =====`)

    await goTab(p, 'Inicio')
    await audit('Inicio')
    await goTab(p, 'Entrenar')
    await audit('Entrenar')
    await goTab(p, 'Plan')
    await audit('Plan')
    await p.locator('.pe-routine', { hasText: 'Día 1 – Tren inferior A' }).click()
    await p.waitForTimeout(300)
    await audit('Editor de rutina')
    await p.getByRole('button', { name: 'Agregar ejercicio', exact: true }).click()
    await p.waitForTimeout(300)
    await audit('Selector (hoja)')
    await p.keyboard.press('Escape')
    await p.waitForTimeout(300)
    await p.locator('.pe-back').click()
    await p.waitForTimeout(300)
    await p.getByRole('button', { name: /Guía/ }).click()
    await p.waitForTimeout(400)
    await audit('Guía')
    // Leave through the Guide's own back button: while the Guide overflows
    // horizontally the fixed tab bar can sit off-screen, and a hanging tab click
    // would hide every audit that follows.
    await p.getByRole('button', { name: /Volver/ }).click()
    await p.waitForTimeout(300)

    await startSession(p, 'espalda-d3')
    await audit('Día 3 · calentam.')
    await gotoStep(p, '02') // Plancha lateral: timed hold per side
    await audit('Día 3 · plancha')
    await gotoStep(p, '05') // Caminata de maleta: distance per side
    await audit('Día 3 · maleta')
    await gotoStep(p, '06') // Cardio zona 2: 20-25 min timed block
    await audit('Día 3 · cardio')
    if (errs.length) check(false, `LAYOUT-01/${scheme}/pageerror`, `errores de pagina: ${errs.join('; ')}`)
    await ctx.close()
  }
})

await br.close()
const ok = report('RESUMEN')
if (!ok) process.exit(1)

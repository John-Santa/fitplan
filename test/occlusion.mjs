// Fixed-overlay occlusion probe for the active-session view — checks that
// the current-set block (.setnow) is not covered by the rest timer or the
// tab bar once a set is marked, in both portrait and landscape.
// Usage:  BASE=http://localhost:5173/ pnpm check:occlusion
// See test/README.md for what this checks and how to add a check.
import { chromium } from 'playwright-core'
import { createChecklist, resolveChromiumPath } from './lib.mjs'

const BASE = process.env.BASE || 'https://john-santa.github.io/fitplan/'
const OUT = process.env.OUT
const { check, report } = createChecklist()

let EXE
try {
  EXE = resolveChromiumPath()
} catch (e) {
  console.error(`\n${e.message}\n`)
  process.exit(1)
}

const br = await chromium.launch({ executablePath: EXE })
for (const v of [
  { n: 'LANDSCAPE', w: 844, h: 390, sb: '21px' },
  { n: 'PORTRAIT 390', w: 390, h: 844, sb: '34px' },
]) {
  const ctx = await br.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const p = await ctx.newPage()
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  await p.addStyleTag({ content: `:root{--safe-b:${v.sb}}` })
  await p.locator('.tabbar button', { hasText: 'Entrenar' }).click()
  await p.waitForTimeout(450)
  await p.locator('button.primary').nth(1).click()
  await p.waitForTimeout(800)
  const chk = p.getByRole('button', { name: /Marcar serie/ })
  if (await chk.count()) {
    await chk.first().click()
    await p.waitForTimeout(700)
  }
  // Try to bring the current-set block into view, the way a real user would.
  await p.evaluate(() => document.querySelector('.setnow')?.scrollIntoView({ block: 'center' }))
  await p.waitForTimeout(600)
  const r = await p.evaluate(() => {
    const sn = document.querySelector('.setnow')
    const tm = document.querySelector('.timer')
    const tb = document.querySelector('.tabbar')
    if (!sn) return null
    const s = sn.getBoundingClientRect()
    const t = tm?.getBoundingClientRect()
    const b = tb?.getBoundingClientRect()
    const topObstruction = document.querySelector('.session-head')?.getBoundingClientRect().bottom ?? 0
    const bottomObstruction = Math.min(t?.top ?? innerHeight, b?.top ?? innerHeight)
    // The kg input: is it reachable?
    const kg = sn.querySelector('input')
    const k = kg?.getBoundingClientRect()
    const kgVisible = k ? k.top >= topObstruction - 1 && k.bottom <= bottomObstruction + 1 : null
    return {
      setnow: { top: Math.round(s.top), bottom: Math.round(s.bottom), alto: Math.round(s.height) },
      bandaLibre: { desde: Math.round(topObstruction), hasta: Math.round(bottomObstruction), alto: Math.round(bottomObstruction - topObstruction) },
      setnowTapado: s.top < topObstruction - 1 || s.bottom > bottomObstruction + 1,
      inputKgVisible: kgVisible,
      maxScroll: Math.round(document.documentElement.scrollHeight - innerHeight),
      scrollY: Math.round(window.scrollY),
    }
  })
  console.log(`\n===== ${v.n} ${v.w}x${v.h} (safe-b ${v.sb}) =====`)
  console.log(JSON.stringify(r, null, 2))
  check(r !== null, `${v.n}`, 'no se encontro .setnow en la vista de sesion activa')
  if (r) {
    const s2 = check(!r.setnowTapado, `${v.n}/OCCLUSION`, `el bloque de serie queda tapado (setnow ${JSON.stringify(r.setnow)} vs banda libre ${JSON.stringify(r.bandaLibre)})`)
    const s3 = check(r.inputKgVisible !== false, `${v.n}/OCCLUSION`, 'el input de kg no es alcanzable (tapado por timer o tabbar)')
    console.log(s2 === 'FAIL' ? '  >>> EL BLOQUE DE SERIE QUEDA TAPADO' : '  >>> ok, el bloque de serie queda a la vista')
    console.log(s3 === 'FAIL' ? '  >>> EL INPUT DE KG NO ES ALCANZABLE' : '  >>> input de kg alcanzable')
  }
  if (OUT) await p.screenshot({ path: `${OUT}/occ-${v.w}x${v.h}.png` })
  await ctx.close()
}
await br.close()
const ok = report('RESUMEN')
if (!ok) process.exit(1)

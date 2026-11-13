// El entorno de vitest es 'node': se renderiza a string, sin DOM.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { InstallBanner, UpdateBanner } from './PwaBanners'

describe('InstallBanner', () => {
  it('Android y escritorio: botón Instalar y Ahora no', () => {
    const html = renderToString(<InstallBanner mode="prompt" onInstall={() => {}} onDismiss={() => {}} />)
    expect(html).toContain('Instala MagniFit')
    expect(html).toContain('>Instalar<')
    expect(html).toContain('Ahora no')
  })

  it('iOS: instrucciones de "Añadir a pantalla de inicio" y sin botón Instalar', () => {
    const html = renderToString(<InstallBanner mode="ios" onInstall={() => {}} onDismiss={() => {}} />)
    expect(html).toContain('Añadir a pantalla de inicio')
    expect(html).not.toContain('>Instalar<')
    expect(html).toContain('Entendido')
  })
})

describe('UpdateBanner', () => {
  it('ofrece Actualizar y Más tarde', () => {
    const html = renderToString(<UpdateBanner onUpdate={() => {}} onLater={() => {}} />)
    expect(html).toContain('Hay una versión nueva de MagniFit.')
    expect(html).toContain('Actualizar')
    expect(html).toContain('Más tarde')
  })
})

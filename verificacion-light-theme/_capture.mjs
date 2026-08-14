import { chromium } from 'playwright'
import path from 'node:path'

const BASE = 'http://localhost:8082'
const OUT = 'c:/Users/Lenovo.User/Desktop/EDUARDO/tracklytics/verificacion-light-theme'

async function shoot(page, name, opts = {}) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts })
  console.log('saved', name)
}

async function toggleTo(page, theme) {
  const label = theme === 'dark' ? /cambiar a tema oscuro/i : /cambiar a tema claro/i
  const btn = page.getByRole('button', { name: label })
  if (await btn.count() > 0) {
    await btn.click()
    await page.waitForTimeout(400)
  }
}

async function loginAs(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'load' })
  await page.fill('#email', 'superadmin@demo.tracklytics.com')
  await page.fill('#password', 'Demo12345!')
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })
}

async function main() {
  const browser = await chromium.launch()

  // ── 1. Login — light + dark, 1440px ──
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(`${BASE}/login`, { waitUntil: 'load' })
    // Espera al collage de covers (query de álbumes) antes de capturar.
    await page.locator('img[alt=""]').first().waitFor({ timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(600)
    await shoot(page, '01-login-light-1440')

    // Zoom del hero / collage de covers (mientras el backfill todavía está incompleto)
    const hero = page.locator('img[alt=""]').first().locator('..').locator('..')
    await shoot(page, '05-login-hero-collage-zoom-light', {
      clip: { x: 40, y: 260, width: 400, height: 220 },
    })

    await toggleTo(page, 'dark')
    await shoot(page, '02-login-dark-1440')
    await page.close()
  }

  // ── 2 & 3. Catálogo — light + dark, 1440 y 1920 ──
  for (const width of [1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    page.on('pageerror', (e) => console.log('[pageerror]', e.message))
    await loginAs(page)
    await page.goto(`${BASE}/catalog`, { waitUntil: 'load' })
    // Espera a datos reales, no al skeleton — el subtítulo pasa de
    // "cargando…" a "top N por popularidad" cuando la query resuelve.
    await page.getByText(/top \d+ por popularidad/).waitFor({ timeout: 20000 })
    await page.waitForTimeout(400)
    await shoot(page, `03-catalog-light-${width}`)

    // Reproducir el primer track para poblar el PlayerBar (zoom del botón play)
    if (width === 1440) {
      const firstRow = page.locator('ol[aria-label="Lista de tracks"] li').first()
      await firstRow.waitFor({ timeout: 10000 })
      // El botón play es el primero de `.actions` dentro de la fila (title="Reproducir").
      await firstRow.locator('button[title="Reproducir"]').click()
      const bar = page.locator('[role="region"][aria-label="Reproductor"]')
      await bar.waitFor({ timeout: 10000 })
      await page.waitForTimeout(500)
      const box = await bar.boundingBox()
      if (box) {
        await shoot(page, '04-playerbar-play-button-zoom-light', {
          clip: { x: box.x + box.width / 2 - 120, y: box.y, width: 240, height: box.height },
        })
      } else {
        console.log('[warn] PlayerBar boundingBox null, no se generó el zoom del play button')
      }
    }

    await toggleTo(page, 'dark')
    await shoot(page, `06-catalog-dark-${width}`)
    await page.close()
  }

  // ── 4. Dashboard — light + dark, 1440 y 1920 ──
  for (const width of [1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await loginAs(page)
    await page.goto(`${BASE}/analitica`, { waitUntil: 'load' })
    // Espera a que el KPICard "Tracks" tenga un valor real, no el skeleton.
    await page.getByText('Escala del catálogo').waitFor({ timeout: 20000 })
    await page.locator('text=/^[0-9]/').first().waitFor({ timeout: 20000 })
    await page.waitForTimeout(500)
    await shoot(page, `07-dashboard-light-${width}`)
    await toggleTo(page, 'dark')
    await shoot(page, `08-dashboard-dark-${width}`)
    await page.close()
  }

  await browser.close()
  console.log('done')
}

main().catch((e) => { console.error(e); process.exit(1) })

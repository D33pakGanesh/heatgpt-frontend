import { expect, test, type Page } from '@playwright/test'

async function waitForMap(page: Page) {
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.waitForFunction(() => {
    const map = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement | null
    return Boolean(map && map.width > 0 && map.height > 0)
  })
}

async function renderedLgaPoint(page: Page) {
  await page.waitForFunction(() => {
    const map = (window as any).__heatgptMap
    if (!map?.isStyleLoaded()) return false
    const canvas = map.getCanvas()
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const points = [
      [0.50, 0.50], [0.42, 0.48], [0.58, 0.48], [0.50, 0.40], [0.50, 0.60],
      [0.35, 0.45], [0.65, 0.45], [0.38, 0.62], [0.62, 0.62],
    ]
    return points.some(([x, y]) =>
      map.queryRenderedFeatures([width * x, height * y], { layers: ['lga-fill'] }).length > 0
    )
  })

  return page.evaluate(() => {
    const map = (window as any).__heatgptMap
    const rect = map.getCanvas().getBoundingClientRect()
    const width = map.getCanvas().clientWidth
    const height = map.getCanvas().clientHeight
    const points = [
      [0.50, 0.50], [0.42, 0.48], [0.58, 0.48], [0.50, 0.40], [0.50, 0.60],
      [0.35, 0.45], [0.65, 0.45], [0.38, 0.62], [0.62, 0.62],
    ]
    for (const [x, y] of points) {
      const point = [width * x, height * y]
      const features = map.queryRenderedFeatures(point, { layers: ['lga-fill'] })
      if (features.length) return { x: rect.left + point[0], y: rect.top + point[1] }
    }
    throw new Error('No rendered LGA feature found')
  })
}

async function melbournePoint(page: Page) {
  await page.waitForFunction(() => {
    const map = (window as any).__heatgptMap
    if (!map?.isStyleLoaded() || !(window as any).__heatgptLgaSelectionReady) return false
    const point = map.project([144.9631, -37.8136])
    return map.queryRenderedFeatures(point, { layers: ['lga-fill'] }).some((feature: any) => feature.properties?.lga_id === '24600')
  })

  return page.evaluate(() => {
    const map = (window as any).__heatgptMap
    const rect = map.getCanvas().getBoundingClientRect()
    const point = map.project([144.9631, -37.8136])
    return { x: rect.left + point.x, y: rect.top + point.y }
  })
}

async function clickRenderedLga(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const point = await melbournePoint(page)
    await page.mouse.click(point.x, point.y)
    if (await bodyIncludes(page, 'Melbourne')) return
  }
}

async function tapRenderedLga(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const point = await melbournePoint(page)
    await page.touchscreen.tap(point.x, point.y)
    if (await bodyIncludes(page, 'Melbourne')) return
  }
}

async function bodyIncludes(page: Page, text: string) {
  try {
    await expect(page.locator('body')).toContainText(text, { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

test('loads PMTiles LGAs and supports desktop selection', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop-only mouse test')
  const pmtilesResponses: number[] = []
  page.on('response', response => {
    if (response.url().includes('.pmtiles')) pmtilesResponses.push(response.status())
  })

  await waitForMap(page)
  await expect.poll(() => pmtilesResponses.some(status => status === 206)).toBeTruthy()

  await clickRenderedLga(page)
  await expect(page.locator('body')).toContainText('Melbourne', { timeout: 30_000 })
  await expect(page.locator('.side-panel')).toBeVisible()
  await expect(page.getByText('Summary')).toBeVisible()
})

test('supports mobile touch selection and responsive panels', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile-only touch test')

  await waitForMap(page)
  await tapRenderedLga(page)
  await expect(page.locator('body')).toContainText('Melbourne', { timeout: 30_000 })
  await expect(page.locator('.side-panel')).toBeVisible()
  await expect(page.locator('.side-panel')).toHaveCSS('position', 'fixed')
})

test('basemap and layer controls remain interactive', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Covered by mobile selection test')
  await waitForMap(page)

  await page.getByRole('button', { name: /settings/i }).click()
  await page.getByRole('button', { name: 'Satellite' }).click()
  await page.getByRole('button', { name: 'Hybrid' }).click()
  await page.getByRole('button', { name: 'Street' }).click()

  await clickRenderedLga(page)
  await page.getByRole('button', { name: 'LST Heatmap' }).click()
  await expect(page.getByText(/No satellite data available|LST \(°C\)/).first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'NDVI Vegetation' }).click()
  await expect(page.getByText(/No satellite data available for this period|NDVI/).first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Annual Day' }).click()
  await expect(page.getByText('Seasonal SUHI Variability — 2025')).toBeVisible({ timeout: 30_000 })
})

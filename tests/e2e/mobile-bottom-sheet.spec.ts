import { expect, test, type Page } from '@playwright/test'

async function waitForMap(page: Page) {
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.waitForFunction(() => {
    const map = (window as any).__heatgptMap
    return Boolean(map?.isStyleLoaded?.() && (window as any).__heatgptLgaSelectionReady)
  })
}

async function renderedLgaPoint(page: Page) {
  await page.waitForFunction(() => {
    const map = (window as any).__heatgptMap
    if (!map?.isStyleLoaded()) return false
    const canvas = map.getCanvas()
    const points = [
      [0.50, 0.50], [0.58, 0.48], [0.50, 0.40], [0.50, 0.60],
      [0.35, 0.45], [0.65, 0.45],
    ]
    return points.some(([x, y]) =>
      map.queryRenderedFeatures([canvas.clientWidth * x, canvas.clientHeight * y], { layers: ['lga-fill'] }).length > 0
    )
  })

  return page.evaluate(() => {
    const map = (window as any).__heatgptMap
    const canvas = map.getCanvas()
    const rect = canvas.getBoundingClientRect()
    const points = [
      [0.50, 0.50], [0.58, 0.48], [0.50, 0.40], [0.50, 0.60],
      [0.35, 0.45], [0.65, 0.45],
    ]
    for (const [x, y] of points) {
      const point = [canvas.clientWidth * x, canvas.clientHeight * y]
      const features = map.queryRenderedFeatures(point, { layers: ['lga-fill'] })
      if (features.length) return { x: rect.left + point[0], y: rect.top + point[1] }
    }
    throw new Error('No rendered LGA feature found')
  })
}

async function tapLga(page: Page) {
  const point = await renderedLgaPoint(page)
  await page.touchscreen.tap(point.x, point.y)
  await expect(page.getByTestId('mobile-bottom-sheet')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('mobile-bottom-sheet')).toHaveAttribute('data-mobile-state', 'half')
}

async function expectZoomButtonUsable(page: Page) {
  const zoomBefore = await page.evaluate(() => (window as any).__heatgptMap.getZoom())
  await page.locator('.maplibregl-ctrl-zoom-in').tap()
  await expect.poll(() => page.evaluate(() => (window as any).__heatgptMap.getZoom())).toBeGreaterThan(zoomBefore)
}

test.describe('mobile bottom sheet', () => {
  test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2 })

  test('small portrait phone supports touch selection, sheet states, scrolling, chat focus and map controls', async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 360, height: 740 })
    await waitForMap(page)

    await expectZoomButtonUsable(page)
    await tapLga(page)

    const sheet = page.getByTestId('mobile-bottom-sheet')
    await expect(sheet).toHaveCSS('position', 'fixed')
    await expect(page.getByTestId('mobile-sheet-handle')).toBeVisible()

    await page.getByRole('button', { name: /minimise panel/i }).tap()
    await expect(sheet).toHaveAttribute('data-mobile-state', 'collapsed')
    await expectZoomButtonUsable(page)

    await page.getByTestId('mobile-sheet-handle').tap()
    await expect(sheet).toHaveAttribute('data-mobile-state', 'half')
    await page.getByRole('button', { name: /^expand panel$/i }).tap()
    await expect(sheet).toHaveAttribute('data-mobile-state', 'expanded')

    const content = page.locator('.side-panel-content')
    await content.evaluate(el => { el.scrollTop = el.scrollHeight })
    await expect(page.getByPlaceholder(/Ask about this area's heat data/i)).toBeVisible()
    await page.getByPlaceholder(/Ask about this area's heat data/i).fill('Does the keyboard fit?')
    await expect(page.getByPlaceholder(/Ask about this area's heat data/i)).toBeFocused()
  })

  test('large portrait phone keeps chart content scrollable', async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 430, height: 932 })
    await waitForMap(page)
    await tapLga(page)

    await page.getByRole('button', { name: /^expand panel$/i }).tap()
    const content = page.locator('.side-panel-content')
    await content.evaluate(el => { el.scrollTop = 0 })
    const before = await content.evaluate(el => el.scrollTop)
    await content.hover()
    await page.mouse.wheel(0, 520)
    await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(before)
    await expect(page.getByText(/Temperature Trend|Summary/).first()).toBeVisible()
  })

  test('landscape phone can minimise the panel and use map controls', async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 740, height: 360 })
    await waitForMap(page)
    await tapLga(page)

    await page.getByRole('button', { name: /minimise panel/i }).tap()
    await expect(page.getByTestId('mobile-bottom-sheet')).toHaveAttribute('data-mobile-state', 'collapsed')

    await expectZoomButtonUsable(page)
  })
})

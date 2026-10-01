/* global window */
import { chromium } from 'file:///C:/Users/dddns/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const baseUrl = process.env.CREMORNE_QA_URL || 'http://127.0.0.1:4175'
const uiOnly = process.env.CREMORNE_UI_ONLY === '1'
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ['geolocation'],
  geolocation: { latitude: -37.830347, longitude: 144.994416 },
})
const page = await context.newPage()
const timings = {}
page.on('pageerror', (error) => console.error(`browser-pageerror: ${error.message}`))

try {
  await page.goto(`${baseUrl}/app`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => window.localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })

  await page.locator('.route-experience').waitFor()
  const routeStarted = Date.now()
  await page.getByRole('button', { name: /find guided actions/i }).click()
  await page.getByRole('heading', { name: /choose your route/i }).waitFor()
  timings.routeMatchMs = Date.now() - routeStarted
  if (timings.routeMatchMs > 1000) throw new Error(`Route choices took ${timings.routeMatchMs}ms to appear; the live demo must feel immediate.`)
  const bestFit = page.locator('.choice-list > button').first()
  if (!/Shadow Route C/i.test(await bestFit.innerText())) throw new Error('Mia did not receive Shadow Route C as the best fit.')
  if (!/Why this route/i.test(await page.locator('.route-summary-panel').innerText())) throw new Error('Route explanation was not visible.')
  await page.screenshot({ path: '.tmp-worker-route.png', fullPage: false })

  await page.getByRole('button', { name: /route b · direct/i }).click()
  await page.getByRole('button', { name: /start guidance/i }).click()
  await context.setGeolocation({ latitude: -37.83000, longitude: 144.99570 })
  await page.waitForTimeout(350)
  await context.setGeolocation({ latitude: -37.82920, longitude: 144.99610 })
  await page.waitForTimeout(350)
  await context.setGeolocation({ latitude: -37.82830, longitude: 144.99640 })
  await page.waitForTimeout(350)
  await context.setGeolocation({ latitude: -37.82720, longitude: 144.99675 })
  await page.waitForTimeout(350)
  await page.getByRole('button', { name: /i.ve arrived/i }).click()
  await page.getByRole('button', { name: uiOnly ? /^worse$/i : /^better$/i }).click()
  await page.getByText(/you found another way|next journey starts smarter/i).waitFor()
  const share = page.getByRole('button', { name: /share candidate path/i })
  const sharedCandidate = Boolean(await share.count())
  if (sharedCandidate) {
    await share.click()
    await page.getByText(/candidate path added/i).waitFor()
  }

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('cremorne-outcomes:v1') || '[]'))
  if (!/Route B/i.test(stored[0]?.routeName || '')) throw new Error(`The selected Route B outcome was not retained: ${stored[0]?.routeName || 'unknown route'}`)
  if (uiOnly) {
    await page.getByRole('button', { name: /plan another journey/i }).click()
    await page.getByRole('button', { name: /find guided actions/i }).click()
    const routeB = page.getByRole('button', { name: /route b · direct/i })
    await routeB.click()
    const routeBText = await routeB.innerText()
    if (!/(previously felt|rated this option) worse/i.test(routeBText)) throw new Error(`Personal Memory did not return on the next comparable route match: ${routeBText}`)
  }

  await page.getByRole('button', { name: /find a room/i }).click()
  const roomStarted = Date.now()
  await page.getByRole('button', { name: /^find rooms/i }).click()
  await page.getByText(/best match|best capability match/i).first().waitFor()
  timings.roomMatchMs = Date.now() - roomStarted
  if (timings.roomMatchMs > 1000) throw new Error(`Room choices took ${timings.roomMatchMs}ms to appear; the live demo must feel immediate.`)
  if (await page.getByText(/doesn.t fit/i).count()) throw new Error('Hard room mismatches leaked into the result list.')
  await page.screenshot({ path: '.tmp-worker-room.png', fullPage: false })
  await page.getByRole('button', { name: /^equipment$/i }).click()
  await page.getByLabel(/room experience comment/i).fill('The video display did not connect.')
  await page.getByRole('button', { name: /share room experience/i }).click()
  await page.getByText(/experience saved/i).waitFor()

  if (uiOnly) {
    console.log(JSON.stringify({ timings, routeRanking: 'Shadow Route C', gpsJourney: 'captured locally', roomComment: 'stored locally' }, null, 2))
  } else {
    await page.getByRole('button', { name: /memory loop/i }).click()
    const proofStarted = Date.now()
    await page.getByRole('button', { name: /compare real routes/i }).click()
    await page.getByRole('heading', { name: /route b wins/i }).waitFor()
    timings.liveProofDecisionMs = Date.now() - proofStarted
    await page.getByRole('button', { name: /now add mia/i }).click()
    await page.getByRole('heading', { name: /36 seconds changes/i }).waitFor()
    await page.screenshot({ path: '.tmp-live-proof.png', fullPage: false })
    await page.getByRole('button', { name: /apply memory to the next match/i }).click()
    await page.getByText(/local memory/i).waitFor()

    await page.getByRole('button', { name: /precinct view/i }).click()
    await page.getByRole('heading', { name: /review real outcomes/i }).waitFor()
    await page.getByText(/latest worker outcome/i).waitFor()
    await page.screenshot({ path: '.tmp-evidence-lab.png', fullPage: false })

    console.log(JSON.stringify({
      timings,
      routeRanking: 'Shadow Route C',
      gpsJourney: 'recorded and measured',
      proposedRoute: sharedCandidate ? 'stored for review' : 'trace did not meet distinctness threshold',
      roomComment: 'stored',
      liveProof: 'Decision API driven',
      evidenceLab: 'outcomes loaded',
    }, null, 2))
  }
} finally {
  await browser.close()
}

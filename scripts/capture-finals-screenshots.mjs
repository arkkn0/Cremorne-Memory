import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'file:///C:/Users/dddns/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const baseUrl = process.env.CREMORNE_SCREENSHOT_URL || 'http://127.0.0.1:4175'
const outputDir = path.resolve('docs/finals/screenshots')
await fs.mkdir(outputDir, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })

async function capture(viewport, prefix) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(`${baseUrl}/app`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /find guided actions/i }).click()
  await page.getByRole('heading', { name: /choose your route/i }).waitFor()
  await page.screenshot({ path: path.join(outputDir, `${prefix}-worker-route.png`), fullPage: prefix === 'mobile' })
  await page.getByRole('button', { name: /find a room/i }).click()
  await page.getByRole('button', { name: /^find rooms/i }).click()
  await page.getByText(/best match|needs confirmation/i).first().waitFor()
  await page.screenshot({ path: path.join(outputDir, `${prefix}-worker-room.png`), fullPage: prefix === 'mobile' })
  await page.getByRole('button', { name: /memory loop/i }).click()
  await page.getByRole('button', { name: /compare real routes/i }).click()
  await page.getByRole('button', { name: /now add mia/i }).click()
  await page.getByRole('heading', { name: /36 seconds changes/i }).waitFor()
  await page.screenshot({ path: path.join(outputDir, `${prefix}-live-proof.png`), fullPage: prefix === 'mobile' })
  await page.getByRole('button', { name: /precinct view/i }).click()
  await page.getByRole('heading', { name: /review real outcomes/i }).waitFor()
  await page.screenshot({ path: path.join(outputDir, `${prefix}-evidence-lab.png`), fullPage: prefix === 'mobile' })
  await context.close()
}

try {
  await capture({ width: 1920, height: 1080 }, 'desktop')
  await capture({ width: 390, height: 844 }, 'mobile')
} finally {
  await browser.close()
}

console.log(`Captured current product flows in ${outputDir}`)

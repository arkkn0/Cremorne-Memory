import QRCode from 'qrcode'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const target = process.argv[2]

if (!target) {
  throw new Error('Usage: npm run qr -- https://your-deployment.example')
}

const outputDirectory = new URL('../public/qr/', import.meta.url)
await mkdir(outputDirectory, { recursive: true })

await QRCode.toFile(fileURLToPath(new URL('cremorne-memory-demo.png', outputDirectory)), target, {
  type: 'png',
  width: 1200,
  margin: 2,
  errorCorrectionLevel: 'H',
  color: {
    dark: '#1F2421',
    light: '#FFFAF1',
  },
})

await QRCode.toFile(fileURLToPath(new URL('cremorne-memory-demo.svg', outputDirectory)), target, {
  type: 'svg',
  margin: 2,
  errorCorrectionLevel: 'H',
  color: {
    dark: '#1F2421',
    light: '#FFFAF1',
  },
})

console.log(`QR assets created for ${target}`)

import { readFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

const origin = 'https://kinetiq-dashboard.web.app'
const expected = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
const paths = ['/', '/machines/DEMO-CNC-01/settings']
const assets = [...new Set([...expected.matchAll(/(?:src|href)="\/(assets\/[^"?#]+)"/g)].map((match) => match[1]))]
if (!assets.length) throw new Error('No compiled assets found in the verified build')

async function verify() {
  for (const path of paths) {
    const response = await fetch(origin + path, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    if (!response.ok || (await response.text()).trim() !== expected.trim()) {
      throw new Error(`Deployed HTML does not match the verified build at ${path}`)
    }
    if (!response.headers.get('content-security-policy')?.includes("connect-src 'none'")) {
      throw new Error(`Expected security policy is missing at ${path}`)
    }
  }
  for (const asset of assets) {
    const response = await fetch(`${origin}/${asset}`, { signal: AbortSignal.timeout(15_000) })
    const expectedAsset = await readFile(new URL(`../dist/${asset}`, import.meta.url))
    if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(expectedAsset)) {
      throw new Error(`Deployed asset does not match the verified build: ${asset}`)
    }
  }
}

for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    await verify()
    console.log(`Verified deployed HTML, deep-link fallback, security policy and ${assets.length} initial assets.`)
    break
  } catch (error) {
    if (attempt === 6) throw error
    console.log(`Deployment verification attempt ${attempt} will retry: ${error.message}`)
    await setTimeout(5000)
  }
}

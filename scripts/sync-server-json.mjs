/**
 * Writes a release version into server.json, the file the MCP Registry publishes from.
 * semantic-release calls it (through @semantic-release/exec) before it commits, so server.json is part of the
 * release commit. Usage: node scripts/sync-server-json.mjs <version>
 */

import fs from 'node:fs'

const SERVER_JSON = new URL('../server.json', import.meta.url)
const PACKAGE_JSON = new URL('../package.json', import.meta.url)
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

const version = process.argv[2]

if (version === undefined || !SEMVER.test(version)) {
  console.error(`Expected a version such as 1.2.3, got ${JSON.stringify(version)}`)
  process.exit(1)
}

const server = JSON.parse(fs.readFileSync(SERVER_JSON, 'utf8'))
const { name } = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'))
const npmPackages = (server.packages ?? []).filter(entry => entry.registryType === 'npm' && entry.identifier === name)

if (npmPackages.length === 0) {
  console.error(`server.json lists no npm package named ${name}`)
  process.exit(1)
}

server.version = version

for (const entry of npmPackages) entry.version = version

fs.writeFileSync(SERVER_JSON, `${JSON.stringify(server, null, 2)}\n`)
console.log(`server.json -> ${version}`)

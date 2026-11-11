import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

const result = dotenv.config({ path: fileURLToPath(new URL('../.env.test', import.meta.url)), override: true })
if (result.error) {
  console.error('Create .env.test from .env.test.example and configure a dedicated test database.')
  process.exitCode = 1
} else if (!/_test$/i.test(process.env.DB_NAME || '')) {
  console.error('The integration database name must end in _test; production databases are refused.')
  process.exitCode = 1
} else {
  const testRun = spawnSync(process.execPath, [
    '--test',
    '--test-concurrency=1',
    'test/api.integration.test.js',
    'test/virtual-alerts.test.js',
  ], { stdio: 'inherit', env: process.env })
  process.exitCode = testRun.status ?? 1
}

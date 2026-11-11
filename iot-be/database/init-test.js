import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

const result = dotenv.config({ path: fileURLToPath(new URL('../.env.test', import.meta.url)), override: true })
if (result.error) throw new Error('Create .env.test from .env.test.example before initializing the test database.')
if (!/_test$/i.test(process.env.DB_NAME || '')) {
  throw new Error('The integration database name must end in _test.')
}

await import('./init.js')

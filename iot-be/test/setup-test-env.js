import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

const result = dotenv.config({ path: fileURLToPath(new URL('../.env.test', import.meta.url)), override: true })
if (result.error) throw new Error('Create .env.test from .env.test.example before running integration tests.')
if (!/_test$/i.test(process.env.DB_NAME || '')) {
  throw new Error('Integration tests require a database name ending in _test.')
}

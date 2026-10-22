import { readFile } from 'node:fs/promises'
import mysql from 'mysql2/promise'
import { env } from '../src/config/env.js'

const { name, ...config } = env.db
if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error('DB_NAME may contain only letters, numbers, and underscores.')
const connection = await mysql.createConnection({ ...config, multipleStatements: true })

try {
  const databaseName = `\`${name}\``
  const schema = (await readFile(new URL('./schema.sql', import.meta.url), 'utf8'))
    .replaceAll('smart_room', databaseName)
  const seed = (await readFile(new URL('./seed.sql', import.meta.url), 'utf8'))
    .replaceAll('smart_room', databaseName)
  await connection.query(schema)

  const [modeColumn] = await connection.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ActionHistory' AND COLUMN_NAME = 'mode'`,
    [name],
  )
  if (modeColumn.length) {
    const migration = await readFile(new URL('./migrations/002_drop_actionhistory_mode.sql', import.meta.url), 'utf8')
    await connection.query(migration)
  }

  await connection.query(seed)
  console.log(`Database "${name}" initialized.`)
} finally {
  await connection.end()
}

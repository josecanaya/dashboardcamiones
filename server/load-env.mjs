import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

// .env.local primero: dotenv no pisa variables ya cargadas, así lo local gana.
dotenv.config({ path: path.join(PROJECT_ROOT, '.env.local') })
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') })

export { PROJECT_ROOT }

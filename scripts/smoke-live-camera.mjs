#!/usr/bin/env node
/**
 * Smoke del endpoint de video en vivo (DSS→go2rtc) del server local.
 * Pasa aunque DSS no esté configurado: solo valida que la ruta responde con el shape correcto.
 * Requiere el server arriba: npm run server:truckflow
 */

const PORT = Number(process.env.TRUCKFLOW_LOCAL_SERVER_PORT || 8787)
const BASE = `http://127.0.0.1:${PORT}`

async function main() {
  let res
  try {
    res = await fetch(`${BASE}/api/truckflow/live-camera/status`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    console.error(`FAIL: no hay conexión con ${BASE}. Levantá el server: npm run server:truckflow`)
    console.error(String(e))
    process.exit(1)
  }
  if (res.status !== 200) {
    console.error(`FAIL: /api/truckflow/live-camera/status devolvió HTTP ${res.status}`)
    process.exit(1)
  }
  const body = await res.json()
  const problems = []
  if (typeof body.dssConfigured !== 'boolean') problems.push('dssConfigured debe ser boolean')
  if (typeof body.go2rtcOk !== 'boolean') problems.push('go2rtcOk debe ser boolean')
  if (typeof body.go2rtcBase !== 'string') problems.push('go2rtcBase debe ser string')
  if (problems.length > 0) {
    console.error('FAIL: shape inesperado de /live-camera/status:', problems.join('; '))
    console.error(JSON.stringify(body, null, 2))
    process.exit(1)
  }
  console.log('OK /api/truckflow/live-camera/status:', JSON.stringify(body))
  if (!body.dssConfigured) {
    console.log('Nota: DSS sin configurar (esperado fuera de la PC con VPN). El smoke pasa igual.')
  }
}

await main()

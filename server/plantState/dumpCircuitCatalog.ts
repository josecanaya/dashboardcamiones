/**
 * Loader one-shot: vuelca CIRCUIT_CATALOG a JSON en stdout.
 * Usado por server/plantState/circuitPrefix.mjs (bridge sin deps nuevas).
 */
import { CIRCUIT_CATALOG } from '../../src/etl-core/domain/circuitCatalog.ts'

const out = []
for (const e of Object.values(CIRCUIT_CATALOG)) {
  if (!e.enabledForClassification) continue
  const sequences = []
  if (e.baseSequence?.length) sequences.push([...e.baseSequence])
  for (const s of e.allowedSequences || []) {
    if (s?.length) sequences.push([...s])
  }
  if (!sequences.length) continue
  out.push({ code: e.code, label: e.label, sequences })
}
process.stdout.write(JSON.stringify(out))

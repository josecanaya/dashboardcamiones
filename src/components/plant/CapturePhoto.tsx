import { useState } from 'react'
import { cameraCaptureImageUrl, findCameraCapture } from '../../services/live/plantStateApi'

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

type Photo = { scene: string | null; plate: string | null; caption: string }

/**
 * Botón «Ver foto» + foto de la lectura, pedida al DSS por cámara y hora (no se guarda nada).
 * `at` es la hora operativa del feed; el servidor la corrige a hora real de la cámara.
 */
export function CapturePhoto({
  deviceCode,
  at,
  readPlate,
  buttonClassName = 'tf-activity-feed__btn',
}: {
  deviceCode: string
  at: string
  readPlate: string
  buttonClassName?: string
}) {
  const [photo, setPhoto] = useState<Photo | null | 'loading' | { missing: string }>(null)

  async function load() {
    if (photo && photo !== 'loading' && !('missing' in photo)) return setPhoto(null)
    setPhoto('loading')
    try {
      const look = await findCameraCapture(deviceCode, at, readPlate)
      const cap = look.capture
      if (cap && (cap.sceneFile || cap.plateFile)) {
        const attrs = [cap.vehicleBrand, cap.vehicleColor, cap.vehicleCategory].filter(Boolean)
        setPhoto({
          scene: cap.sceneFile ? cameraCaptureImageUrl(cap.sceneFile) : null,
          plate: cap.plateFile ? cameraCaptureImageUrl(cap.plateFile) : null,
          caption: `DSS · leyó ${cap.plate || '—'} · confianza ${cap.confidence ?? '—'}${attrs.length ? ` · ${attrs.join(' · ')}` : ''}`,
        })
        return
      }
      setPhoto({
        missing: look.error
          ? `No se pudo consultar el DSS: ${look.error}.`
          : `El DSS no tiene una lectura de ${deviceCode} a las ${hora(look.realAt)}.`,
      })
    } catch (e) {
      setPhoto({ missing: e instanceof Error ? e.message : String(e) })
    }
  }

  const shown = photo && photo !== 'loading' && !('missing' in photo)

  return (
    <div>
      <button type="button" className={buttonClassName} onClick={() => void load()} disabled={photo === 'loading'}>
        {photo === 'loading' ? 'Buscando foto…' : shown ? 'Ocultar foto' : 'Ver foto'}
      </button>
      {photo && photo !== 'loading' ? (
        'missing' in photo ? (
          <p className="mt-1.5 text-[10px] text-slate-500">{photo.missing} Buscala en DSS por cámara y hora.</p>
        ) : (
          <div className="mt-1.5 space-y-1">
            {photo.scene ? (
              <a href={photo.scene} target="_blank" rel="noreferrer" title="Abrir en tamaño completo">
                <img className="w-full max-w-[520px] rounded border border-slate-200" src={photo.scene} alt={`Foto de la lectura ${readPlate}`} />
              </a>
            ) : null}
            {photo.plate ? (
              <a href={photo.plate} target="_blank" rel="noreferrer" title="Abrir el recorte en tamaño completo">
                <img className="h-20 w-auto rounded border border-slate-300 bg-white" src={photo.plate} alt={`Recorte de la patente ${readPlate}`} />
              </a>
            ) : null}
            <div className="text-[10px] text-slate-500">{photo.caption}</div>
          </div>
        )
      ) : null}
    </div>
  )
}

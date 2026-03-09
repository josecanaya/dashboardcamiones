import type { IfcCameraCatalogItem } from '../domain/logistics'
import type { SiteId } from '../domain/sites'

function buildSiteCameraCatalog(siteId: SiteId): IfcCameraCatalogItem[] {
  const cameraCodes = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10']
  return cameraCodes.map((code, idx) => ({
    cameraId: `CAM_${code}_${String(idx + 1).padStart(2, '0')}`,
    cameraCode: code,
    displayName: `Camara ${code}`,
    sectorId:
      code === 'S0'
        ? 'INGRESO'
        : code === 'S1'
          ? 'EGRESO'
          : code === 'S2'
            ? 'CALADA'
            : code === 'S4'
              ? 'BALANZA'
              : `SECTOR_${code}`,
    isCritical: ['S0', 'S1', 'S2', 'S4'].includes(code),
    siteId,
  }))
}

export const CAMERA_CATALOG_BY_SITE: Record<SiteId, IfcCameraCatalogItem[]> = {
  ricardone: buildSiteCameraCatalog('ricardone'),
  san_lorenzo: buildSiteCameraCatalog('san_lorenzo'),
  avellaneda: buildSiteCameraCatalog('avellaneda'),
}

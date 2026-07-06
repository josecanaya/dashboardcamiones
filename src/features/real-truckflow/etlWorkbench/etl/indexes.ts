/**
 * Punto de entrada para índices precomputados del ETL (evolución arquitectura).
 * Reexporta helpers existentes sin mover implementación física (Etapa 5 MAP).
 */
export { buildPlateIndex, journeysForFuzzyOcrPrefilter } from '../etlExcelFirstMerge'
export { createPlateMatchCache, plateMatchKindCached } from '../etlPlateMatchCache'

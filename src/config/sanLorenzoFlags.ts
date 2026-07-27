/**
 * Flags de clasificación San Lorenzo.
 *
 * Viven en `config/` (módulo leaf, sin imports) para cortar el ciclo
 * `finalCircuitScoring ↔ etlSanLorenzoSupport`: el scoring solo necesitaba estos flags,
 * mientras que `etlSanLorenzoSupport` necesita tipos del scoring.
 *
 * `etlSanLorenzoSupport` los re-exporta para no romper imports existentes.
 */

/** Activado: refuerzo ejecutivo con evidencia SL en rutas mixtas. */
export const ETL_SL_EXECUTIVE_SUPPORT_ENABLED = true

/** Activado: clasificación SL1 interna (solo journeys exclusivamente San Lorenzo). */
export const ETL_SL_INTERNAL_CLASSIFICATION_ENABLED = true

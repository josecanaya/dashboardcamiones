/** Tiempo máximo para todo `loadPeriod` (red + parse + pipeline hasta commit de estado). */
export const LOAD_PERIOD_GLOBAL_MS = 60_000

/** Umbral API cruda: si hay más eventos que esto, no se ejecuta `buildCleanRealDataset` hasta el botón manual. */
export const LARGE_RAW_EVENTS_THRESHOLD = 5_000

/** Umbral API cruda de alertas para aplazar dataset limpio. */
export const LARGE_RAW_ALERTS_THRESHOLD = 10_000

/** Si el rango supera estas horas, se muestra confirmación antes de llamar a la API. */
export const RANGE_WARNING_HOURS = 12

export interface EventData {
  stationId: string
  label: string
  timestamp: string
  pesoBruto?: number
  pesoTara?: number
  pesoNeto?: number
  humedad?: number
  resultado?: string
  regla?: string
}

export const EVENT_DATA: Record<string, Partial<EventData>> = {
  A: { stationId: "A", label: "Ingreso", timestamp: "08:32:00", regla: "Validar patente" },
  B: { stationId: "B", label: "Balanza 1", timestamp: "08:34:12", pesoBruto: 42500, regla: "Peso > 0" },
  C: { stationId: "C", label: "Calada", timestamp: "08:38:45", humedad: 12.4, regla: "Muestra OK" },
  DEC: { stationId: "DEC", label: "Decisión", timestamp: "08:40:00", resultado: "SI/NO", regla: "Calidad aprobada" },
  D: { stationId: "D", label: "Descarga", timestamp: "08:52:00", pesoTara: 12800, regla: "Tolva destino" },
  E: { stationId: "E", label: "Balanza 2", timestamp: "08:55:20", pesoNeto: 29700, regla: "Verificar neto" },
  F: { stationId: "F", label: "Egreso", timestamp: "08:57:00", regla: "Liberar acceso" },
  G: { stationId: "G", label: "Espera", timestamp: "—", regla: "Tiempo máximo 45 min" },
  H: { stationId: "H", label: "Rechazo", timestamp: "—", resultado: "Derivación", regla: "Registro obligatorio" },
  I: { stationId: "I", label: "Seguridad", timestamp: "—", regla: "Inspección visual" },
  J: { stationId: "J", label: "Contra-muestra", timestamp: "—", regla: "Re-calada" },
  K: { stationId: "K", label: "Re-pesaje", timestamp: "—", regla: "Dif. < 1%" },
  L: { stationId: "L", label: "Destino alt.", timestamp: "—", regla: "Cambio de silo" },
}

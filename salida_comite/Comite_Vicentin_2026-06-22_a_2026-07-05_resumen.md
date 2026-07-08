# Comite de seguridad y eficiencia - Nueva Vicentin Argentina
## Resumen ejecutivo | Periodo 22/06/2026 a 05/07/2026

> Datos calculados con el mismo pipeline ETL del software del repo (etl_transform_v12) sobre
> `data/truckflow/` (eventos/alertas de camara) + `data/Movimientos/` (Movimientos por Contrato, Excel).
> Los tiempos por tramo salen de Truckflow; los volumenes por producto salen del Excel.

## 1. Tamano de la muestra
- **Eventos Truckflow:** 47.514  ·  **Alertas:** 51.615
- **Circuitos reconstruidos:** 5.242  ·  **Clasificados:** 2.029 (39%)  ·  **Incompletos/revision:** 3.213
- **Validos:** 3.202 (completos 1.112, deducidos 1.015)  ·  **Anomalos:** 1.227
- **Coherencia global:** Coherente

## 2. Volumen de movimientos (Excel Movimientos por Contrato)
- **Total movimientos:** 5.906 en 227.1 kilotoneladas.
- **Solidos:** 5.391 movimientos  ·  **Liquidos/aceite:** 515 movimientos.
- **Por planta:** Terminal de Embarque 4.459, San Lorenzo 938, Avellaneda 509.
- **Cobertura Excel:** los Movimientos por Contrato cubren fecha de ingreso 25/06 a 05/07; no hay movimientos de 22 a 24/06 en el Excel (los tiempos de tramo de esos dias salen de Truckflow).

## 3. Circuitos (tiempos totales, Truckflow COMPLETOS)
| Circuito | Descripcion | Viajes | Media (min) | Desvio (min) | Mediana (min) |
|---|---|---|---|---|---|
| R7 | Ricardone -> San Lorenzo (Soja) | 2775 | 232 | 127 | 236 |
| R5 | Volcable 1 (Girasol) | 84 | 211 | 87 | 196 |
| R6 | Volcable 2 (Girasol) | 35 | 404 | 265 | 296 |
| R8 | Recepcion mercaderia liquida | 227 | 359 | 313 | 262 |

## 4. R7 / Soja - tramos principales
- **Calada (preingreso -> calada):** 124 min (n=2015) - principal punto de tension.
- **Espera Balanza (San Lorenzo):** 110 min (n=653).
- **Descarga (balanza in -> egreso SL):** 62 min (n=718).

## 5. Aceite / liquidos
- **515 movimientos** de aceite/liquidos en Excel (40.9 kt).
- Operaciones de plataforma aceite (Excel): 391; capturadas por camara S10 de Truckflow: 0.
- Cohortes liquido: SL San Lorenzo 0, transile externo Ric->SL 0, recepcion liquida Ric 0.
- **Hallazgo:** las plataformas de aceite no tienen punto de camara S10 instrumentado -> trazabilidad de aceite pendiente de cierre de camaras.

## 6. Calidad de evidencia
- Alertas LPR (fallas de lectura de patente): 25.574.
- Alertas operativas: 19.152 (cruzadas contra journeys: 14.228).

## 7. Proximos pasos
1. Cerrar puntos de camara pendientes (S10 aceite / lineas liquidas).
2. Reducir la Espera de Balanza en San Lorenzo (principal componente evitable de R7).
3. Ampliar la muestra de Girasol (R5/R6) y revisar la dispersion de R6.
4. Continuar la calibracion y mejora de lectura de patentes (LPR).
5. Consolidar el cruce Excel <-> Truckflow por contrato y producto.

---
*Advertencias de cobertura:* periodo corregido a 22/06-05/07 (el 21/06 ya estaba en el comite anterior).
Las presentaciones de referencia (`data/ejemplos/`) son PDF, no PPTX; este PPTX reconstruye el estilo, no clona el master original.

# Anexo · Comité de Seguridad: vehículos sin registro (01 al 04/11/2026)

Cómo se arma el informe de **vehículos leídos bien en dos o más puntos que no figuran en ninguna carta de porte,
en las bases del back office ni en la balanza (SGC)**, con su recorrido completo y fotos del DSS. Sirve para
repetirlo con otros días y para sumarlo como anexo al comité.

- Deck publicado (Slides, privado; compartir desde Share): https://claude.ai/artifact/9Yemr5ZDCtYDFqzUwB8NH7
- Scripts: `scripts/seguridad-sin-registro/` (`listar.cjs`, `fotos.mjs`, `recorrido.mjs`).
- Base del reconocedor: `docs/RECONOCEDOR_RECORRIDO_CAPTURA.md` (el replay por capas es el que clasifica).

## Qué queda en el informe

El usuario eligió los casos que le interesan; el resto va a una lámina «fuera del informe» con el motivo.

| Día | Patente | Por qué es caso |
|---|---|---|
| 03/11 | **NXS389** | Iveco con placa naranja 80 / 2794 (baterías con ácido). Primera vez. Ingreso, Preingreso, Balanza 2 egreso; 57 min sin cámaras. |
| 03/11 | **KAP262** | Hyundai con rombo clase 8. Ingreso, Preingreso, **calada de líquidos**, Egreso, Balanza 2. El 02/10 hizo lo mismo con ingreso en balanza (tambores vacíos). |
| 03/11 | **KST146** | Renault volcador. Balanza 1 ingreso 08:57 y Balanza 2 egreso 10:05 sin pesada. |
| 02/11 | **CXV575** | Camión blanco (el DSS dice camioneta). Cruzó las dos balanzas cuatro veces en el día, sin pesada. |
| 04/11 | **FSW142** | Scania R330 de glicerina (29/10 con balanza). 05:45 Preingreso → 07:50 Egreso, sin ingreso. Confirmar si FJW142 (balanza 02 y 03/11) es el mismo. |
| 04/11 | **NAD656** | Mercedes Atego «Servicios Industriales», contratista habitual (10 días). Cruzó las dos balanzas del puerto sin pesada. |

Quedaron fuera del deck por decisión del usuario (estaban en la primera versión): LDL778, AB531CT, MTM450,
RSW086, GIE905.

**No son caso** (motivo, para no volver a investigarlos):

- AH829SU (02/11): estaba en la balanza (glicerina). Era un error del reconocedor, corregido en 9b04c74.
- IFI1A17 (02/11): lectura mala, dos camiones distintos. AI630IL, AI555VZ, IPV201: autos y camionetas
  (cola de particulares). FKE007: camioneta de Prefectura Naval (Bomberos).
- STN749 (04/11): es SUC749, con carta; descargó en el volcable 5.
- LKT119, PEA114, MRV482, AH717AW, AA996WD, LIF292, AH135DG (04/11): aceite de girasol con ingreso en balanza
  ese día; cartas del 05/11; las cámaras los leyeron unas 2 h antes del ingreso (límite del respaldo SGC,
  ver el traspaso de En vivo). RTT977: aceite de soja con ingreso ese día.
- AF522FR (01/11): camión de soja que descarga con carta; **a verificar**, faltan las cartas del 01/11
  (`data/padron/` empieza el 02/11).

## Cómo se hace (paso a paso)

1. **Datos del día completos.** `data/truckflow/<día>/event-list.json` y `alert-list.json`. Si el día se bajó
   mientras corría, está cortado (el 04/11 llegaba hasta las 09:49): volver a bajarlo del TruckFlow
   (`http://100.54.73.142:8090/journey-event/list` y `/alert/list` con `startDate=<día>T00:00:00&endDate=<día>T23:59:59`,
   o `POST /api/truckflow/export-one-day` con el 8787 arriba). Cartas: `data/padron/<día>.json` (vecinos −2..+1).
   Balanza: `data/sgc/<día>/ingresos.json`. Bases: MongoDB local (`backoffice_particulares`, `backoffice_sin_carta`).
2. **Replay por capas** de cada día (MongoDB arriba; tarda 1–2 min por día):
   ```
   node --max-old-space-size=8192 scripts/replay-capas-dia.mjs 2026-11-04 <carpeta>/fin-04
   ```
3. **Listar candidatos:** `node scripts/seguridad-sin-registro/listar.cjs <carpeta> 01 04` → patentes con pasos
   «sin registro» o «leida» en 2 o más nodos distintos.
4. **Descartar lo que tiene registro** aunque el reconocedor no lo vio: buscar la patente y sus parecidas
   (1 carácter) en `data/padron/*.json`, `data/sgc/*/ingresos.json` y `data/movimientos/*/movimientos.json`.
   Típico: carta de otro día, lectura antes del ingreso en balanza, patente mal leída de un camión con carta.
5. **Fotos:** `node scripts/seguridad-sin-registro/fotos.mjs <carpeta>/sinreg-01-04.json <salida> PAT1,PAT2`
   (directo al DSS con `.env`; no necesita el 8787). Mirarlas: el DSS se equivoca de tipo (CXV575 «camioneta»
   es un camión) y las fotos muestran lo importante (placas de mercancía peligrosa, leyendas de empresas,
   vehículos oficiales).
6. **Recorrido completo:** `node scripts/seguridad-sin-registro/recorrido.mjs PATENTE <desde> <hasta> [--dss data/dss-export/<rango>/capturas.csv]`
   → todas las cámaras (feed + alertas, con traseras), lecturas parecidas y, si hay export del DSS, también
   las capturas que el TruckFlow no mandó. Visitas anteriores: `grep -l '"PATENTE"' data/truckflow/*/event-list.json`.
7. **Deck:** una ficha por vehículo (patente, qué pasó, Registro / Cámaras / Qué pedimos, recorrido por
   planta, fotos) y una lámina de recorrido completo (tabla de cámaras + visitas anteriores). Formato de las
   fichas del Comité de Seguridad (`scripts/estado-planta/gen_comite_seguridad.py`, función `ficha`); estilo
   en la memoria «Comité de Seguridad sin kg»: sin pesos.

## Convenciones

- **Hora:** la del sistema de camiones (feed = `occurredAt` + 206 min). La cámara del DSS marca 240 s menos.
- La portería del puerto (SLZSalidaC1/C2) lee en los dos sentidos: la permanencia es un rango observado.
- «Balanza 1 · ingreso» / «Balanza 2 · egreso» = cámaras RicB1Ingreso / RicB2Egreso; pasar por ellas sin
  ingreso en el SGC = «sin pesada».
- Livianos y vehículos oficiales no son caso: van a la cola de candidatos de particulares del back office.

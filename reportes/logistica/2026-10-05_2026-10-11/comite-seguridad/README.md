# Comité de Seguridad Nodo Sur · 05/10 al 11/10/2026

Generado el 12/10 **solo con cámaras** (Excel MovimientosPorContrato disponible hasta 04/10; sin VPN, sin DSS).

## Regenerar

```bash
node --import tsx scripts/estado-planta/comite-seguridad-deteccion.ts 2026-10-05 2026-10-11
python scripts/estado-planta/gen_comite_seguridad.py reportes/logistica/2026-10-05_2026-10-11/comite-seguridad
```

Desde un worktree sin `data/`: `COMITE_DATA_ROOT=<repo principal>/data` y `--import <repo principal>/node_modules/tsx/dist/loader.mjs`.
Las correcciones de En vivo se leen del servidor local (`:8787`); si está apagado, se usa `correcciones-en-vivo.json`.

## Cuando llegue el Excel 05–11/10

Ingerirlo a `data/movimientos/<día>/movimientos.json` y volver a correr los dos comandos. Sin tocar código:

- **Vueltas a Ricardone**: cada candidato pasa a confirmado (sin operación en el puerto en esa visita) o se descarta.
- **Calles**: se completa la columna Excel y aparecen los casos de volcable declarado ≠ calle de la cámara.
- **Camionetas**: se cruzan también contra el Excel del período (hoy el padrón es 27/08–04/10).
- El histórico deja de marcarse como provisorio.

## Fotos de DSS

Con VPN, subir las capturas como assets del deck y listar sus `/_blob/<id>` en `fotos.json`:
`{"BWA132": [["/_blob/…", "20:07", "Calada"], ["/_blob/…", "20:46", "Egreso puerto"], …]}`.

## Resultado al 12/10 (solo cámaras)

| Regla | Resultado | Estado |
|---|---|---|
| Vuelta a Ricardone sin descargar | 1 candidato: BWA132 (09/10, 18 min en el puerto, volcable 3 a las 00:18) | Pendiente Excel + DSS |
| Demoras interplanta > 30 min sin calado en el puerto | 0 (viaje normal 11 min; cercanos: OSL239 49 min pero caló en el puerto; grupo del 05/10 13:15–13:19 en 26–29 min) | Completo |
| Dos calles en la misma visita | 5 (ninguno con el volcable 5) | Completo; columna Excel pendiente |
| Volcable declarado vs calle | — | Pendiente Excel |
| Camionetas/utilitarios con ≥ 10 viajes sin Excel | 50 (16 Ricardone y puerto, 34 solo puerto) | Provisorio (padrón 27/08–04/10) |
| Anexo antigüedad del parque | Sin cambios (Excel 15/05–04/10) | Se recalcula aparte |

## Reglas y validación

Las reglas están documentadas en la cabecera de `comite-seguridad-deteccion.ts`. Se validaron contra 30/09–04/10 (con Excel):
0 vueltas (igual que el comité anterior), VJG112 + los cuatro del 02/10 en interplanta, DAO236 en dos calles. Ajustes que salieron de esa validación:

- La vuelta tiene que entrar **directo** a Ricardone (ingreso o calada) antes de 12 h; si entra por el pre-ingreso es una carga nueva (OJD684 y OKH237 tenían descarga en el Excel).
- Transiles: si después del egreso hay Playa 3 o carga, la salida real no se leyó y el viaje no se mide (UWX998 01/10: cámara 10:01, Excel 10:43).
- `RicCalLiq` no marca líquido: por ahí pasan los transiles de pellet.
- Con la regla actual aparecen además RRE349 (30/09, 38 min, confirmado por el Excel) y GES056 (01/10, transile con la balanza de egreso sin leer). No se pudo validar la detección positiva de vueltas: esta PC no tiene las cámaras crudas del 24–29/09.

Archivos: `datos.json` (todo lo que usa la maqueta), `interplanta.csv`, `vueltas-ricardone.csv`, `patentes-sin-excel.csv` (≥ 3 viajes, con columnas de parecida al Excel y registro de particulares), `deck/project/` (deck.json + slides).

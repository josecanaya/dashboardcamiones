# Pedido a Vicentin: datos para la vista `SGC_PROD.CamionesActivos24horas`

## Resumen

La vista ya nos da, en vivo, quién entró, con qué producto, cuánto pesó y cuándo salió. Para
dejar de depender del Excel *Movimientos por Contrato* nos faltan **seis datos** que el Excel
traía y que **las cámaras no pueden darnos**: la cámara ve una patente pasar por un punto, pero
no ve la carga, los papeles ni la decisión operativa. Son campos del mismo registro: el
`NROINGRESO` de la vista es el «Ingreso» del Excel.

## Los seis datos que necesitamos

| Dato (columna en el Excel) | Por qué no sale de la cámara | Para qué lo usamos |
|---|---|---|
| **Movimiento** (Mov: I / E / IA / EA / DI / DE) | La cámara ve pasar el camión, no si trae o lleva carga. Los pesos lo insinúan recién después de pesar, y no distinguen egreso de despacho. | Separar recepción, egreso y despacho; clasificar el circuito; medir tiempos por tipo de operación. |
| **Plataforma** (Volcable 1–5, Volcable Pto 1–5, Celda 16, Keppler, Silo Chief, Aceite OSL…) | Varios puntos de descarga y carga no tienen cámara (tolvas de pellet, Celdas 09/10/11, Silo Australiano, líquidos, Cargadero). En los volcables con mucho volumen la cámara asigna mal la calle (acierta 47 de 66). | Circuito de cada camión, uso de cada volcable y calle, y demoras por punto de descarga. |
| **Es de vuelta** (transile) | Un transile se ve igual que cualquier camión. Unirlo por patente entre Ricardone y el puerto falla con los errores de lectura de patentes. | Contar los transiles, sus circuitos y su costo de flete. |
| **CTG** | Es el documento de la carga; la cámara solo lee la patente, con errores. | Unir las dos patas del transile y no contar dos veces el mismo movimiento. |
| **Calidad y humedad** (Observación de calidad, Humedad) | No es visible: sale del calado. | Explicar las esperas largas en Playa de Demorados y los rechazos; separar una demora operativa de una de calidad. |
| **Contrato y observaciones** (Contrato, Cliente, Observaciones) | Es información comercial. | Agrupar demoras por cliente y distinguir fasón de producción propia (también decide el circuito de los aceites). |

## Que llegue en vivo

Hoy consultamos la vista cada 2 minutos, pero un camión **aparece recién con su primera pesada**,
no con el alta en Preingreso: vimos demoras de 2 h hasta 23 h. Para el monitoreo en vivo pedimos:

1. Que el camión aparezca **desde el alta** (hoy la vista exige tener un pesaje registrado).
2. Que **no desaparezca** si pasa más de 24 h en planta, como un camión demorado por calidad
   (hoy la ventana es solo por fecha de ingreso).
3. Que incluya los movimientos **sin acoplado, sin contrato o administrativos**: hoy quedan
   afuera, y por eso la vista trae el 72 % de lo que traía el Excel.

## Para hacerlo simple

Cualquiera de estas opciones nos alcanza:

- **Sumar los seis datos a la vista actual.** La vista ya une la tabla `TRANSACCIONDATOS` pero
  no muestra ninguno de sus campos.
- **Darnos lectura sobre el esquema de reportes `SGC_QV`,** si ahí ya está el *Movimientos por
  Contrato*.
- **Pasarnos la lista de columnas de las tablas que usa la vista** (consulta abajo), así pedimos
  cada campo por su nombre.

---

## Anexo técnico

### Definición actual de la vista (leída del catálogo el 15/10/2026)

Se creó el 14/10 a las 17:07 y no se modificó desde entonces. El usuario `bimtrazer_view` solo
tiene `CREATE SESSION` y `SELECT` sobre esta vista. La vista une `TRANSACCION`,
`TRANSACCIONDATOS`, `CONTRATO`, `PRODUCTO`, `PLANTA`, `PESAJEREGISTRO`, `CAMION` y `ACOPLADO`.

| En la vista | Efecto | Cambio sugerido |
|---|---|---|
| `INNER JOIN PESAJEREGISTRO` | Aparece recién con la primera pesada | `LEFT JOIN` |
| `INNER JOIN ACOPLADO` | Quedan afuera los camiones sin acoplado | `LEFT JOIN` |
| `INNER JOIN CONTRATO` (y `PRODUCTO` vía contrato) | Quedan afuera los movimientos sin contrato | `LEFT JOIN` |
| `ADMINISTRATIVO = 0` | Excluye las transacciones administrativas | Traerlo como columna |
| `tx.FECHA BETWEEN SYSDATE - 1 AND SYSDATE` | Desaparece a las 24 h aunque siga en planta | `FECHA` o `FECHASALIDA` en 24 h, o sin salida |
| `PLANTA` = `tx.PLANTA_ID` | Es la planta de destino: el R7 figura como Terminal | Sumar la planta física, si existe |

### Evidencia (15/10/2026)

- Contra el Excel del 14/10 (desde las 09:32), por número de ingreso: 68 de 95 movimientos (72 %).
  Faltan sobre todo residuos, chatarra y productos varios, más algunos granos.
- El alta en el SGC cae alrededor de 1 min después de la lectura de la cámara de Preingreso
  (EQK434: cámara 07:02, SGC 07:03).
- Planta = destino: AC707BY pasó Preingreso de Ricardone a las 07:10, se dio de alta a las 07:12
  como Terminal · Soja y se caló en Ricardone a las 07:55.
- Los transiles están casi parados desde el 07/10: la falta de despachos de Ricardone estos días
  es real.

### Lista de columnas

```sql
SELECT table_name, column_name, data_type, comments
FROM all_tab_columns c
LEFT JOIN all_col_comments m USING (owner, table_name, column_name)
WHERE owner = 'SGC_PROD'
  AND table_name IN ('TRANSACCION','TRANSACCIONDATOS','CONTRATO','PESAJEREGISTRO',
                     'PLANTA','PRODUCTO','CAMION','ACOPLADO')
ORDER BY table_name, column_id;
```

### Acceso

El servidor VPN no publica la ruta a 192.168.15.55: la agregamos a mano y se pierde al reiniciar.
Pedir que la incluyan en las rutas que manda la VPN (puerto 1521 desde 10.8.0.0/24).

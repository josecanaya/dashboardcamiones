# Reconocimiento por capas · 02/11 y 03/11 y 04/11 y 05/11 y 06/11

> **Semana del lunes 02/11 al viernes 06/11 (hasta las 16:55).** Corrida del 06/11 con el código de `automatizacion` (`3253fcf`), sin metadatos (3.2) ni IA (3.4). **El 06/11 no tiene datos del sistema de camiones** (el servidor que los guarda está apagado desde el 05/11 a la tarde): el respaldo SGC resuelve 12 pasos contra ~120 de los otros días y el universo SGC del lote queda vacío, así que sus alertas están infladas. El 06/11 es además un día en curso: los viajes «en curso» son los camiones que todavía están en planta.

## Resumen

| | 02/11 | 03/11 | 04/11 | 05/11 | 06/11* |
|---|---:|---:|---:|---:|---:|
| Pasos | 4.395 | 2.756 | 3.428 | 4.248 | 3.783 |
| Resueltos sin alerta | 96 % | 93 % | 95 % | 96 % | 89 % |
| Alertas (pasos) | 190 | 202 | 174 | 190 | 403 |
| Camiones con carta | 183 | 159 | 218 | 344 | 248 |
| Pasos de esos camiones explicados (cámara + reconstruido + deducido + carta) | 99,9 % | 99,8 % | 99,9 % | 99,9 % | 86 % + 14 % en curso |

* sin SGC y día en curso.

Replay de cada día por el recorrido acordado (`docs/RECONOCEDOR_RECORRIDO_CAPTURA.md`), con `scripts/replay-capas-dia.mjs`. Cada paso (frontal + trasera + repeticiones de un vehículo en un nodo) termina en una sola capa.

## 1 · Dónde terminó cada paso

| Capa | 02/11 | 03/11 | 04/11 | 05/11 | 06/11 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Capa 2 · ¿quién es? (comparación exacta) | 3499 (80 %) | 2065 (75 %) | 2618 (76 %) | 3374 (79 %) | 2797 (74 %) |
| Leída por recorrido de cámaras | 19 (0 %) | 16 (1 %) | 39 (1 %) | 8 (0 %) | 20 (1 %) |
| Capa 3.1 · patentes parecidas, lote y vínculo | 502 (11 %) | 352 (13 %) | 443 (13 %) | 490 (12 %) | 407 (11 %) |
| Capa 3.3 · banco de corregidas | 32 (1 %) | 13 (0 %) | 16 (0 %) | 19 (0 %) | 4 (0 %) |
| Lectura errónea confirmada (ilegible junto a un paso guardado) | 153 (3 %) | 108 (4 %) | 138 (4 %) | 167 (4 %) | 152 (4 %) |
| Capa 4 · alerta | 190 (4 %) | 202 (7 %) | 174 (5 %) | 190 (4 %) | 403 (11 %) |
| **Total de pasos** | **4395** | **2756** | **3428** | **4248** | **3783** |

## 2 · Con qué regla resolvió cada capa

| Capa · regla | 02/11 | 03/11 | 04/11 | 05/11 | 06/11 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 · carta de porte | 2423 | 1123 | 1634 | 2424 | 2159 |
| 2 · base particulares | 739 | 594 | 579 | 599 | 501 |
| 2 · base sin carta | 242 | 211 | 259 | 232 | 125 |
| 2 · respaldo SGC | 95 | 137 | 146 | 119 | 12 |
| leida · recorrido de cámaras | 19 | 16 | 39 | 8 | 20 |
| 3.1 · vinculo | 195 | 120 | 165 | 209 | 139 |
| 3.1 · carta_parecida | 167 | 135 | 139 | 122 | 132 |
| 3.1 · universo | 59 | 41 | 60 | 72 | 65 |
| 3.1 · par_trasera | 49 | 34 | 51 | 59 | 49 |
| 3.1 · cuenta | 31 | 16 | 14 | 23 | 17 |
| 3.1 · doble_lectura | 1 | 6 | 14 | 5 | 5 |
| 3.3 · corregida_antes | 19 | 7 | 8 | 2 | 1 |
| 3.3 · no es camión | 6 | 6 | 6 | 5 | 3 |
| 3.3 · confirmada_antes | 7 | 0 | 2 | 12 | 0 |
| lectura_erronea · repetición de paso guardado | 153 | 108 | 138 | 167 | 152 |
| 4 · lectura ilegible sin asignar | 130 | 119 | 85 | 88 | 91 |
| 4 · sin registro | 26 | 50 | 24 | 43 | 133 |
| 4 · lectura dudosa | 19 | 28 | 49 | 44 | 110 |
| 4 · ilegible en la misma alerta | 15 | 5 | 13 | 7 | 59 |
| 4 · camión de granos sin carta | 0 | 0 | 3 | 8 | 10 |

## 3 · Las correcciones vuelven a la capa 2 contra…

| Base | 02/11 | 03/11 | 04/11 | 05/11 | 06/11 |
| --- | ---: | ---: | ---: | ---: | ---: |
| carta de porte | 409 | 249 | 320 | 336 | 293 |
| base sin carta | 71 | 74 | 76 | 66 | 43 |
| nadie | 18 | 21 | 24 | 82 | 27 |
| base particulares | 34 | 20 | 34 | 21 | 46 |

«nadie»: la patente corregida no está en ninguna base; queda como camión sin registro.

## 4 · Qué quedó suelto (capa 4)

| Motivo | 02/11 | 03/11 | 04/11 | 05/11 | 06/11 |
| --- | ---: | ---: | ---: | ---: | ---: |
| lectura ilegible sin asignar | 130 | 119 | 85 | 88 | 91 |
| sin registro | 26 | 50 | 24 | 43 | 133 |
| ilegible en la misma alerta | 15 | 5 | 13 | 7 | 59 |
| lectura dudosa | 19 | 28 | 49 | 44 | 110 |
| camión de granos sin carta | 0 | 0 | 3 | 8 | 10 |
| **Total** | **190** | **202** | **174** | **190** | **403** |

### Por nodo

| Nodo (planta) | 02/11 | 03/11 | 04/11 | 05/11 | 06/11 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Egreso SL (SL) | 28 | 42 | 32 | 35 | 49 |
| Renova (SL) | 11 | 26 | 23 | 14 | 82 |
| Volcables SL (SL) | 21 | 14 | 21 | 29 | 31 |
| Balanza (Ric) | 30 | 27 | 12 | 28 | 15 |
| Balanza egreso SL (SL) | 13 | 30 | 14 | 15 | 29 |
| Salida 2 (Ric) | 17 | 10 | 15 | 10 | 31 |
| Ingreso (Ric) | 19 | 10 | 12 | 10 | 28 |
| Balanza ingreso SL (SL) | 8 | 5 | 9 | 2 | 39 |
| Ingreso SL (SL) | 9 | 11 | 7 | 5 | 30 |
| Preingreso (Ric) | 6 | 7 | 9 | 11 | 21 |
| Calada (Ric) | 3 | 4 | 5 | 8 | 20 |
| Playa 3 (Ric) | 14 | 6 | 4 | 7 | 8 |
| Carga OSL (Ric) | 9 | 5 | 5 | 6 | 3 |
| Carga y descarga SL (SL) | 1 | 3 | 1 | 6 | 6 |
| Calada SL (SL) |  |  | 5 | 2 | 8 |
| Silo Keppler (Ric) | 1 | 2 |  | 2 | 3 |

### Sin registro el 02/11: 11 patentes, 26 pasos

Patente válida que no está en cartas, bases ni SGC. Las de 2 o más nodos son vehículos reales que recorren la planta.

| Patente | Pasos | Nodos | Primera–última |
|---|---:|---|---|
| CXV575 | 12 | Balanza, Ingreso, Salida 2 | 10:22–15:08 |
| IFI1A17 | 2 | Ingreso, Balanza | 03:12–17:13 |
| AF042JP | 2 | Egreso SL | 06:35–07:25 |
| LPZ703 | 2 | Egreso SL | 11:05–12:12 |
| DOK500 | 2 | Egreso SL | 12:35–14:59 |
| EWL984 | 1 | Preingreso | 00:17–00:17 |
| QLJ322 | 1 | Silo Keppler | 00:59–00:59 |
| LYW022 | 1 | Preingreso | 03:39–03:39 |
| MZJ130 | 1 | Ingreso | 08:40–08:40 |
| ELU998 | 1 | Egreso SL | 05:22–05:22 |
| DBZ307 | 1 | Volcables SL | 22:42–22:42 |

### Lecturas dudosas el 02/11: 19

Hay candidatos, pero ninguno alcanza para asignar solo.

| Hora | Nodo | Leyó | Candidatos |
|---|---|---|---|
| 02:56 | Salida 2 (Ric) | TCL12 | VJG112, AC182JK, TAC436 |
| 13:38 | Ingreso (Ric) | AF708IV | AF798IV, AG496SJ, UUO981 |
| 13:41 | Preingreso (Ric) | AF708IV | AF798IV, AG496SJ, UUO981 |
| 13:52 | Calada (Ric) | AF798IV | AF708IV, AA798TZ, AA672TM |
| 16:28 | Balanza (Ric) | LPZ703 | LPW705, EEW075, HTK722 |
| 16:42 | Salida 2 (Ric) | AF708IV | AF798IV, AG496SJ, UUO981 |
| 20:19 | Carga OSL (Ric) | SWH1701 | TWH091, BHL749, TVH101 |
| 20:40 | Playa 3 (Ric) | JAC0178 | AH091UQ, CRJ139, DTG181 |
| 00:35 | Egreso SL (SL) | EOU97 | EOU772, EOD272, EUV766 |
| 01:39 | Volcables SL (SL) | FTF4654 | GTF854, GTF654, SIF654 |
| 01:45 | Balanza ingreso SL (SL) | AA71520 | MKA520, AA581UQ, KKW150 |
| 03:14 | Egreso SL (SL) | AA71520 | MKA520, AA581UQ, KKW150 |
| 03:30 | Volcables SL (SL) | SHR92 | GMR927, SHN093, SPH945 |
| 03:59 | Ingreso SL (SL) | SNP99 | SNE399, SNE289, SHN093 |
| 05:34 | Ingreso SL (SL) | OR17999 | QRA989, CRJ139, OUO981 |
| 05:54 | Balanza egreso SL (SL) | OD7240 | EOD272, JUQ710, AD872CS |
| 07:01 | Renova (SL) | WP9954 | EPH797, CCD635, EMG070 |
| 12:19 | Renova (SL) | AB70501 | AB700WH, AA875OG, HAQ820 |
| 23:32 | Balanza ingreso SL (SL) | HNG34 | HNE318, WGG348, DNH321 |

### Sin registro el 03/11: 28 patentes, 50 pasos

Patente válida que no está en cartas, bases ni SGC. Las de 2 o más nodos son vehículos reales que recorren la planta.

| Patente | Pasos | Nodos | Primera–última |
|---|---:|---|---|
| AB531CT | 6 | Ingreso SL, Balanza ingreso SL, Renova, Balanza egreso SL, Egreso SL | 08:44–09:45 |
| KAP262 | 5 | Ingreso, Preingreso, Calada, Salida 2, Balanza | 09:51–11:21 |
| KST146 | 5 | Ingreso, Preingreso, Salida 2, Balanza | 08:32–10:05 |
| NXS389 | 3 | Ingreso, Preingreso, Balanza | 14:01–15:05 |
| MTM450 | 4 | Balanza, Egreso SL | 09:55–13:55 |
| LDL778 | 2 | Volcables SL, Egreso SL | 04:04–04:29 |
| AI630IL | 2 | Balanza egreso SL, Egreso SL | 06:55–06:56 |
| AB249DS | 2 | Balanza | 13:01–13:10 |
| LWE929 | 2 | Egreso SL | 09:53–10:10 |
| OQT486 | 1 | Ingreso | 00:58–00:58 |
| QXS713 | 1 | Preingreso | 04:05–04:05 |
| AF211CF | 1 | Balanza | 07:45–07:45 |
| AG714AI | 1 | Balanza | 08:30–08:30 |
| KWD619 | 1 | Balanza | 08:36–08:36 |
| AF511CR | 1 | Balanza | 14:01–14:01 |
| HIP705 | 1 | Calada | 15:05–15:05 |
| VKH406 | 1 | Carga OSL | 22:02–22:02 |
| IOT697 | 1 | Balanza ingreso SL | 00:34–00:34 |
| GXC802 | 1 | Egreso SL | 02:26–02:26 |
| NML819 | 1 | Renova | 07:36–07:36 |
| AD249FJ | 1 | Egreso SL | 08:52–08:52 |
| BQD631 | 1 | Balanza egreso SL | 09:16–09:16 |
| AG189YR | 1 | Egreso SL | 10:24–10:24 |
| ILE014 | 1 | Egreso SL | 11:29–11:29 |
| BBF937 | 1 | Egreso SL | 12:06–12:06 |
| LJB986 | 1 | Egreso SL | 14:54–14:54 |
| FTC550 | 1 | Renova | 20:00–20:00 |
| SLV371 | 1 | Balanza egreso SL | 20:59–20:59 |

### Lecturas dudosas el 03/11: 28

Hay candidatos, pero ninguno alcanza para asignar solo.

| Hora | Nodo | Leyó | Candidatos |
|---|---|---|---|
| 00:10 | Playa 3 (Ric) | LU3901 | EGV380, HNE318, CRJ139 |
| 01:15 | Salida 2 (Ric) | EEI05 | EEW075, EIW151, BQI495 |
| 07:29 | Balanza (Ric) | IMH787 | IWH787, KOU871 |
| 07:35 | Balanza (Ric) | IMH787 | IWH787, KOU871 |
| 10:42 | Ingreso (Ric) | NHB772 | KHB772, GDW647, AC297XI |
| 13:37 | Calada (Ric) | AYL780 | AYJ768, AB650TS, AD964ZL |
| 15:58 | Calada (Ric) | CTW79 | CTW713, IXG529, MMC881 |
| 19:51 | Preingreso (Ric) | EYD058 | LYQ656, EVQ156, MJD070 |
| 20:23 | Carga OSL (Ric) | GZI01 | GZI868, GZT868, AG294KA |
| 00:13 | Balanza egreso SL (SL) | LHE30 | HNE318, LHL423, EYH843 |
| 00:24 | Balanza ingreso SL (SL) | EUF420 | EUD420, EUU420, LUE425 |
| 00:45 | Ingreso SL (SL) | NMT181 | NYT101, NIT101, NYI181 |
| 02:23 | Renova (SL) | EMC07 | NCC287, MCB678, EKC425 |
| 02:25 | Egreso SL (SL) | SB2945 | SPB945, SPH945, DUL425 |
| 04:55 | Ingreso SL (SL) | LVI32 | EVD342, UTS820, VJG112 |
| 05:18 | Balanza egreso SL (SL) | NMT181 | NYT101, NIT101, NYI181 |
| 05:22 | Egreso SL (SL) | NWAP181 | JBX310, BQI495, NYI181 |
| 06:41 | Egreso SL (SL) | AB2208 | AB322UD, AH540BR, BTS626 |
| 06:41 | Egreso SL (SL) | AB2203 | AB322UD, AH540BR, BTS626 |
| 06:52 | Balanza egreso SL (SL) | AI630IL | AB430IE, SZG660, JTH801 |
| 08:26 | Balanza egreso SL (SL) | BAD62 | AD829RY, AD872CS, BTS626 |
| 09:00 | Balanza egreso SL (SL) | DRF28 | DPN282, KOQ228, DGR440 |
| 09:07 | Balanza egreso SL (SL) | DRF28 | DPN282, KOQ228, DGR440 |
| 10:19 | Balanza ingreso SL (SL) | GYE2357 | OKH237, EOI579, AC935LK |
| 12:31 | Renova (SL) | EMG07 | EMD070, EPH797, AE624GL |
| 12:48 | Volcables SL (SL) | AF55073 | FTB573, AE556ZN, AE870JF |
| 12:57 | Egreso SL (SL) | AF55073 | FTB573, AE556ZN, AE870JF |
| 16:20 | Renova (SL) | II1104 | TIE100, AG103DO, SNP211 |

### Sin registro el 04/11: 16 patentes, 24 pasos

Patente válida que no está en cartas, bases ni SGC. Las de 2 o más nodos son vehículos reales que recorren la planta.

| Patente | Pasos | Nodos | Primera–última |
|---|---:|---|---|
| STN749 | 3 | Ingreso, Preingreso, Salida 2 | 01:12–04:52 |
| CCQ063 | 7 | Renova | 02:02–05:33 |
| EGL373 | 1 | Ingreso | 05:41–05:41 |
| DVS998 | 1 | Salida 2 | 08:11–08:11 |
| PQQ1U70 | 1 | Salida 2 | 09:09–09:09 |
| MLK555 | 1 | Balanza | 09:56–09:56 |
| IFR518 | 1 | Preingreso | 12:13–12:13 |
| BVG200 | 1 | Calada | 20:02–20:02 |
| EDP750 | 1 | Balanza egreso SL | 00:27–00:27 |
| ICD135 | 1 | Renova | 11:48–11:48 |
| CJV1M51 | 1 | Balanza egreso SL | 15:17–15:17 |
| AC539YP | 1 | Balanza egreso SL | 15:48–15:48 |
| CVA136 | 1 | Balanza ingreso SL | 17:07–17:07 |
| BNX098 | 1 | Calada SL | 22:45–22:45 |
| MVK630 | 1 | Balanza egreso SL | 23:14–23:14 |
| OOF155 | 1 | Volcables SL | 23:18–23:18 |

### Lecturas dudosas el 04/11: 49

Hay candidatos, pero ninguno alcanza para asignar solo.

| Hora | Nodo | Leyó | Candidatos |
|---|---|---|---|
| 00:08 | Salida 2 (Ric) | HNG34 | MMC881, HRJ444, HEM938 |
| 11:25 | Ingreso (Ric) | AA759DA | AA750BH, KCO877 |
| 12:13 | Salida 2 (Ric) | AA759DA | AA750BH, KCO877 |
| 13:22 | Calada (Ric) | CTW77 | CTW713, KCO877, LVP777 |
| 13:41 | Ingreso (Ric) | AD702VV | AD702WW, AD709VW, GBB093 |
| 13:43 | Calada (Ric) | AYL780 | AYJ768, AB650TS, AD964ZL |
| 13:59 | Ingreso (Ric) | KXY494 | KPY495, KQG451, GBB093 |
| 14:02 | Preingreso (Ric) | KXY494 | KPY495, KQG451, GBB093 |
| 15:58 | Salida 2 (Ric) | AD702VV | AD702WW, AD709VW, GBB093 |
| 18:15 | Calada (Ric) | FYJ562 | FAJ561, FYQ568, CGS882 |
| 18:35 | Salida 2 (Ric) | FYJ562 | FAJ561, FYQ568, CGS882 |
| 18:45 | Preingreso (Ric) | TIU17 | AI178FR, ULU413, AF711DG |
| 22:52 | Calada (Ric) | BSL80 | LXD186, DWK643, BIT440 |
| 00:38 | Volcables SL (SL) | AF4056 | AF405FH, AE405EH, AE138FG |
| 01:08 | Volcables SL (SL) | AD0078 | AD001RG, AI047VW, MJD070 |
| 05:03 | Ingreso SL (SL) | SJS749 | STN749, VSO429, TJE478 |
| 06:43 | Egreso SL (SL) | AB2203 | AG128YL, AH540BR, KPY495 |
| 06:48 | Egreso SL (SL) | AD1137 | AG128YL, AH540BR, VCK738 |
| 07:49 | Egreso SL (SL) | CTW79 | CTW713, IMH787, AA787YC |
| 07:51 | Volcables SL (SL) | NAT101 | NAT181, NYT101, MKT101 |
| 08:32 | Ingreso SL (SL) | EWX794 | LYX784, AE785CS, FSW142 |
| 08:38 | Volcables SL (SL) | SJS749 | STN749, VSO429, TJE478 |
| 08:59 | Balanza egreso SL (SL) | SJS749 | STN749, VSO429, TJE478 |
| 08:59 | Calada SL (SL) | EWX794 | LYX784, AE785CS, FSW142 |
| 09:01 | Balanza ingreso SL (SL) | EWX794 | LYX784, AE785CS, FSW142 |
| 09:01 | Egreso SL (SL) | SJS749 | STN749, VSO429, TJE478 |
| 09:03 | Renova (SL) | EWX794 | LYX784, AE785CS, FSW142 |
| 09:57 | Calada SL (SL) | EWX794 | LYX784, AE785CS, FSW142 |
| 09:58 | Balanza ingreso SL (SL) | EWX794 | LYX784, AE785CS, FSW142 |
| 10:05 | Balanza egreso SL (SL) | EWX794 | LYX784, AE785CS, FSW142 |
| 10:10 | Egreso SL (SL) | EWX794 | LYX784, AE785CS, FSW142 |
| 11:30 | Balanza ingreso SL (SL) | AA75717 | AA767IT, AA717EA, AA787YC |
| 12:09 | Renova (SL) | AH718HW | AH274MW, AH717AW, VCK738 |
| 13:24 | Ingreso SL (SL) | KXY494 | KPY495, MYA819, KEH448 |
| 13:33 | Balanza ingreso SL (SL) | KXY494 | KPY495, MYA819, KEH448 |
| 13:39 | Balanza egreso SL (SL) | KXY494 | KPY495, MYA819, KEH448 |
| 13:43 | Egreso SL (SL) | KXY494 | KPY495, MYA819, KEH448 |
| 16:08 | Ingreso SL (SL) | AD702VV | AD702WW, AD709VW, AD785UY |
| 16:20 | Balanza egreso SL (SL) | DIH46 | DTG256, EMM462, KEH448 |
| 17:37 | Egreso SL (SL) | AD768XB | AE719XB, AA703FC, AH795LV |
| 19:25 | Egreso SL (SL) | AB2203 | GYC220, AA703FC, FKE007 |
| 19:27 | Volcables SL (SL) | ELZ15 | AF719ZS, PLR345, DGY115 |
| 19:56 | Renova (SL) | AG20600 | IXB766, IJC110, AG406UJ |
| 20:13 | Egreso SL (SL) | AD702VV | AD702WW, AD709VW, AD785UY |
| 20:29 | Calada SL (SL) | EEW05 | LYQ656, LCP506, AA875OG |
| 20:57 | Balanza ingreso SL (SL) | FLD104 | EDG101, EAO104, NUD400 |
| 21:27 | Renova (SL) | AC685ON | AC686NV, IXB766, CMF111 |
| 22:55 | Balanza ingreso SL (SL) | FLD104 | EDG101, EAO104, NUD400 |
| 23:32 | Egreso SL (SL) | FOR199 | GQF199, TZN189, ENF949 |

### Sin registro el 05/11: 33 patentes, 43 pasos

Patente válida que no está en cartas, bases ni SGC. Las de 2 o más nodos son vehículos reales que recorren la planta.

| Patente | Pasos | Nodos | Primera–última |
|---|---:|---|---|
| MTM450 | 4 | Balanza, Egreso SL | 10:51–13:08 |
| AB348IO | 3 | Balanza, Playa 3 | 10:48–11:17 |
| SLF772 | 3 | Egreso SL, Renova | 08:46–09:15 |
| OLL595 | 2 | Preingreso, Salida 2 | 09:10–09:12 |
| AH240WO | 2 | Salida 2, Ingreso | 11:14–11:14 |
| AD232IZ | 2 | Ingreso, Preingreso | 23:36–23:41 |
| AN461XN | 1 | Balanza | 06:16–06:16 |
| LCN723 | 1 | Balanza | 06:47–06:47 |
| AI251EH | 1 | Balanza | 06:59–06:59 |
| AF831ID | 1 | Balanza | 07:41–07:41 |
| OYQ767 | 1 | Balanza | 09:46–09:46 |
| AB918MA | 1 | Salida 2 | 10:33–10:33 |
| AC071XK | 1 | Balanza | 12:22–12:22 |
| ILF655 | 1 | Balanza | 13:57–13:57 |
| XFO008 | 1 | Salida 2 | 14:36–14:36 |
| AB531FN | 1 | Balanza | 18:18–18:18 |
| AP383RP | 1 | Balanza | 19:37–19:37 |
| KMA505 | 1 | Preingreso | 22:26–22:26 |
| RWY479 | 1 | Preingreso | 23:39–23:39 |
| UEL794 | 1 | Egreso SL | 00:07–00:07 |
| BXO711 | 1 | Volcables SL | 02:29–02:29 |
| ICF228 | 1 | Balanza egreso SL | 03:11–03:11 |
| MVV023 | 1 | Balanza egreso SL | 05:33–05:33 |
| FMD890 | 1 | Volcables SL | 06:19–06:19 |
| AD017ZL | 1 | Egreso SL | 06:43–06:43 |
| AOZ689 | 1 | Renova | 09:52–09:52 |
| AF986JH | 1 | Egreso SL | 10:11–10:11 |
| ELE085 | 1 | Renova | 11:56–11:56 |
| AE749HF | 1 | Egreso SL | 12:45–12:45 |
| AD002TC | 1 | Renova | 14:39–14:39 |
| AB539LF | 1 | Egreso SL | 16:08–16:08 |
| JWM802 | 1 | Balanza egreso SL | 20:41–20:41 |
| EJL360 | 1 | Ingreso SL | 22:23–22:23 |

### Lecturas dudosas el 05/11: 44

Hay candidatos, pero ninguno alcanza para asignar solo.

| Hora | Nodo | Leyó | Candidatos |
|---|---|---|---|
| 04:24 | Preingreso (Ric) | GEX072 | PEE072, RHZ972, TQR883 |
| 05:34 | Calada (Ric) | LOW07 | EKD733, WWM738, ULE444 |
| 05:37 | Calada (Ric) | GEX072 | PEE072, RHZ972, TQR883 |
| 05:57 | Preingreso (Ric) | GEX072 | PEE072, RHZ972, TQR883 |
| 06:00 | Calada (Ric) | GEX072 | PEE072, RHZ972, TQR883 |
| 06:11 | Salida 2 (Ric) | GEX072 | PEE072, RHZ972, TQR883 |
| 08:11 | Calada (Ric) | AC5220 | AE923ED, MUA720, AGU635 |
| 08:38 | Balanza (Ric) | AF922EU | AE923ED, IZQ583 |
| 10:50 | Calada (Ric) | MB66474 | AD964ZL, NGV003, AG678MX |
| 10:52 | Calada (Ric) | UJG112 | VJG112, JCU215, AD964ZL |
| 10:53 | Calada (Ric) | QP2112 | UJG112, AE251SZ, AF281PC |
| 14:37 | Balanza (Ric) | AB069ID | AB348IO, AB469EB, AB271DR |
| 15:39 | Calada (Ric) | BER228 | BPT228, AB622IB, BHW129 |
| 17:38 | Preingreso (Ric) | AF681QS | AF804QL, AH779NM, AF031GN |
| 20:32 | Ingreso (Ric) | AVA300 | AA350QC, AKF023, VWF587 |
| 23:56 | Ingreso (Ric) | AG830CD | AG902CO, AA330CA, AG923TA |
| 00:36 | Ingreso SL (SL) | GRE440 | OQE440, OOE440, BIT440 |
| 00:49 | Balanza egreso SL (SL) | GVE35 | CCD635, MQF335, MOF325 |
| 01:02 | Volcables SL (SL) | AF24104 | AF711DG, AF243UL, AI241RW |
| 01:18 | Renova (SL) | EMG07 | KRT519, BNX098, AH056AH |
| 01:42 | Volcables SL (SL) | DKHQ214 | DKM091, OKH237, OQE440 |
| 01:52 | Volcables SL (SL) | ITQ50 | BIT440, INQ041, IJU586 |
| 02:37 | Volcables SL (SL) | AI0061 | AI041SD, AI201GV, INQ041 |
| 03:25 | Volcables SL (SL) | PJJ41 | JMJ748, FPB081, BPA054 |
| 06:29 | Renova (SL) | GYQ57 | GYW157, TGY547, BNX098 |
| 07:15 | Renova (SL) | HJ7017 | EPH797, AH859DF, JEO427 |
| 07:49 | Renova (SL) | ION372 | DDN372, DON372, DUN372 |
| 08:27 | Renova (SL) | ER1155 | AE260HD, EFA323, EGV380 |
| 10:29 | Egreso SL (SL) | AF261AQ | AF281PC, AH201CM, AF986JH |
| 10:38 | Volcables SL (SL) | LEG49 | ULE444, HPE048, AE492SE |
| 12:16 | Egreso SL (SL) | MIH376 | NTX876, IJN886, MEE006 |
| 13:24 | Egreso SL (SL) | AH724AD | AH928AB, AH859DF, AI202TC |
| 13:25 | Balanza egreso SL (SL) | AH724AD | AH928AB, AH859DF, AB140YJ |
| 13:27 | Carga y descarga SL (SL) | AH724AD | AH928AB, AH859DF, AB140YJ |
| 13:34 | Balanza egreso SL (SL) | AH724AD | AH928AB, AH859DF, AB140YJ |
| 13:34 | Egreso SL (SL) | AH724AD | AH928AB, AH859DF, AB140YJ |
| 15:30 | Egreso SL (SL) | AF417LL | AF413LL, AH437LL, AF316PR |
| 15:51 | Egreso SL (SL) | ERJ885 | EKJ885, AE857DR, AE999OW |
| 16:30 | Balanza egreso SL (SL) | ION372 | DDN372, DON372, DUN372 |
| 19:22 | Volcables SL (SL) | RP4721 | AB472CS, ABA752, PAI457 |
| 19:46 | Volcables SL (SL) | SCA04 | DCA012, OGA047, GAI805 |
| 21:39 | Balanza egreso SL (SL) | UUL25 | VLZ705, KVP275, EVL715 |
| 22:18 | Volcables SL (SL) | DCA012 | OGA047, OWT012, AD600LV |
| 22:19 | Ingreso SL (SL) | ZX0331 | WEI381, BPI833, LZM344 |

### Sin registro el 06/11: 48 patentes, 133 pasos

Patente válida que no está en cartas, bases ni SGC. Las de 2 o más nodos son vehículos reales que recorren la planta.

| Patente | Pasos | Nodos | Primera–última |
|---|---:|---|---|
| MQM566 | 9 | Ingreso, Preingreso, Salida 2, Egreso SL, Ingreso SL, Calada SL, Balanza ingreso SL, Carga y descarga SL, Balanza egreso SL | 09:06–12:11 |
| AE500WO | 12 | Ingreso, Preingreso, Salida 2, Ingreso SL, Calada SL, Balanza ingreso SL, Carga y descarga SL, Balanza egreso SL | 09:00–13:10 |
| AVJ581 | 8 | Ingreso, Preingreso, Salida 2, Ingreso SL, Balanza ingreso SL, Volcables SL, Balanza egreso SL, Egreso SL | 02:38–11:04 |
| RWY479 | 7 | Calada, Salida 2, Ingreso SL, Balanza ingreso SL, Volcables SL, Balanza egreso SL, Egreso SL | 01:00–05:10 |
| AD232IZ | 7 | Calada, Salida 2, Ingreso SL, Balanza ingreso SL, Volcables SL, Balanza egreso SL, Egreso SL | 01:06–05:11 |
| KMA505 | 7 | Salida 2, Ingreso, Calada, Ingreso SL, Balanza ingreso SL, Balanza egreso SL | 07:49–16:52 |
| AF681QS | 7 | Ingreso, Calada, Salida 2, Ingreso SL, Balanza ingreso SL, Balanza egreso SL | 07:50–16:38 |
| AD595WQ | 7 | Ingreso SL, Calada SL, Balanza ingreso SL, Balanza egreso SL, Egreso SL | 07:37–16:06 |
| AI469CT | 5 | Ingreso SL, Balanza ingreso SL, Renova, Balanza egreso SL, Egreso SL | 09:26–12:24 |
| AI205AY | 5 | Ingreso, Preingreso, Calada, Salida 2 | 06:17–08:23 |
| AA171DA | 4 | Calada, Playa 3, Balanza, Salida 2 | 07:42–11:30 |
| NWV854 | 4 | Ingreso SL, Balanza ingreso SL, Balanza egreso SL, Egreso SL | 01:56–02:12 |
| LVV530 | 4 | Ingreso SL, Balanza ingreso SL, Balanza egreso SL, Egreso SL | 05:00–07:57 |
| EWJ342 | 4 | Balanza ingreso SL, Volcables SL, Balanza egreso SL, Egreso SL | 06:47–09:23 |
| NML819 | 3 | Preingreso, Calada, Salida 2 | 06:04–08:02 |
| AA174DA | 3 | Ingreso, Preingreso, Salida 2 | 06:57–07:37 |
| AF937IB | 3 | Egreso SL, Balanza egreso SL | 15:23–15:30 |
| EDQ878 | 2 | Preingreso, Salida 2 | 03:36–06:11 |
| DJP028 | 2 | Calada, Balanza ingreso SL | 05:43–10:26 |
| FJN030 | 2 | Ingreso, Salida 2 | 08:31–10:22 |
| AA986HF | 1 | Salida 2 | 00:31–00:31 |
| SCJ6I14 | 1 | Calada | 02:20–02:20 |
| BQD631 | 1 | Calada | 02:32–02:32 |
| IYI952 | 1 | Calada | 02:41–02:41 |
| ILR651 | 1 | Balanza | 06:30–06:30 |
| NFL955 | 1 | Balanza | 06:44–06:44 |
| ICE146 | 1 | Balanza | 06:57–06:57 |
| HCO327 | 1 | Balanza | 07:06–07:06 |
| JYU269 | 1 | Balanza | 09:04–09:04 |
| LUZ255 | 1 | Balanza | 11:46–11:46 |
| IMH181 | 1 | Balanza | 15:41–15:41 |
| HPW190 | 1 | Balanza ingreso SL | 00:18–00:18 |
| TDC004 | 1 | Balanza ingreso SL | 00:34–00:34 |
| AD099AY | 1 | Volcables SL | 00:39–00:39 |
| FFB901 | 1 | Ingreso SL | 00:56–00:56 |
| EMH688 | 1 | Ingreso SL | 01:46–01:46 |
| FFA295 | 1 | Balanza ingreso SL | 01:53–01:53 |
| BNA281 | 1 | Balanza ingreso SL | 05:13–05:13 |
| VJG804 | 1 | Renova | 08:19–08:19 |
| MSI910 | 1 | Egreso SL | 09:59–09:59 |
| OBF932 | 1 | Egreso SL | 10:14–10:14 |
| JBF982 | 1 | Egreso SL | 10:28–10:28 |
| WBF934 | 1 | Egreso SL | 10:29–10:29 |
| ROS3T10 | 1 | Renova | 11:39–11:39 |
| AD406SH | 1 | Egreso SL | 15:02–15:02 |
| ID606SH | 1 | Egreso SL | 15:06–15:06 |
| IPK959 | 1 | Egreso SL | 15:44–15:44 |
| DOU018 | 1 | Renova | 15:51–15:51 |

### Lecturas dudosas el 06/11: 110

Hay candidatos, pero ninguno alcanza para asignar solo.

| Hora | Nodo | Leyó | Candidatos |
|---|---|---|---|
| 00:00 | Preingreso (Ric) | AG830CD | AG902CO, AA330CA, AG923TA |
| 00:44 | Salida 2 (Ric) | IJD94 | IHO984, TNJ019, HFD941 |
| 01:06 | Carga OSL (Ric) | GZI01 | GJO015, KGQ228, SZU043 |
| 01:27 | Calada (Ric) | DF3003 | CFK006, AF130KP, AD360MF |
| 01:32 | Calada (Ric) | AG830CD | AG902CO, AA330CA, AG923TA |
| 01:38 | Salida 2 (Ric) | AG830CD | AG902CO, AA330CA, AG923TA |
| 03:20 | Calada (Ric) | LU3901 | EGV380, AB398KI, AH829DN |
| 05:14 | Preingreso (Ric) | HHH881 | HHZ891, HHO984, AH361YD |
| 07:38 | Calada (Ric) | HHH881 | HHZ891, HHO984, AH361YD |
| 07:48 | Salida 2 (Ric) | AF681QS | AF804QL, AH779NM, AF031GN |
| 07:51 | Salida 2 (Ric) | HHH881 | HHZ891, HHO984, AH361YD |
| 08:29 | Salida 2 (Ric) | AI008BO | AG103DO, AI308DN, AI423DE |
| 08:40 | Ingreso (Ric) | AG815BD | AG815FI, AG815YP, AI315BY |
| 08:43 | Silo Keppler (Ric) | GI0402 | AIH662, GHO245, AA171DA |
| 08:53 | Ingreso (Ric) | AI206KN | AI286PA, AI308DN, AG815BD |
| 08:56 | Preingreso (Ric) | AI206KN | AI286PA, AI308DN, AG815BD |
| 09:01 | Salida 2 (Ric) | AI206KN | AI286PA, AI308DN, AG815BD |
| 09:07 | Ingreso (Ric) | LZA483 | LZV033, KZA683, AG873YJ |
| 09:18 | Preingreso (Ric) | LZA483 | LZV033, KZA683, AG873YJ |
| 09:27 | Playa 3 (Ric) | AC19711 | AI651US, VNA879, ICE146 |
| 09:28 | Salida 2 (Ric) | LZA483 | LZV033, KZA683, AG873YJ |
| 09:53 | Preingreso (Ric) | VJG112 | CFG112, VAI992, AG815FI |
| 10:16 | Salida 2 (Ric) | VJG112 | CFG112, VAI992, AG815FI |
| 10:42 | Ingreso (Ric) | LYX784 | EKX731, LLZ838 |
| 10:44 | Preingreso (Ric) | LYX784 | EKX731, LLZ838 |
| 10:50 | Salida 2 (Ric) | LYX784 | EKX731, LLZ838 |
| 11:02 | Ingreso (Ric) | AA177DA | AA677DJ, AA174DA, AA171DA |
| 11:05 | Calada (Ric) | AA177DA | AA677DJ, AA174DA, AA171DA |
| 12:17 | Ingreso (Ric) | AB470QT | AC406QT |
| 12:20 | Preingreso (Ric) | AB470QT | AC406QT |
| 12:20 | Playa 3 (Ric) | 924XHAT | AE766XQ, AI651US, ICE146 |
| 12:34 | Salida 2 (Ric) | AB470QT | AC406QT |
| 12:35 | Ingreso (Ric) | AE453HZ | AE513HZ |
| 12:38 | Preingreso (Ric) | AE453HZ | AE513HZ |
| 14:04 | Balanza (Ric) | MTM450 | MSN054, AH831XA, AE197HX |
| 14:12 | Ingreso (Ric) | EQZ192 | EUZ192, FUZ192, OLZ492 |
| 14:17 | Preingreso (Ric) | EQZ192 | EUZ192, FUZ192, OLZ492 |
| 14:23 | Calada (Ric) | AE453HZ | AE513HZ |
| 00:43 | Egreso SL (SL) | ECL370 | EJL360, EXF800, LZM344 |
| 00:43 | Volcables SL (SL) | CF0079 | CKF069, CFK006, FDO218 |
| 01:18 | Volcables SL (SL) | BT8546 | DKM546, BNI284, OIY954 |
| 01:47 | Ingreso SL (SL) | AG830CD | AG902CO, AA330CA, AB886TO |
| 02:03 | Ingreso SL (SL) | RC77019 | ROP788, CAH774, AG419KW |
| 02:05 | Balanza ingreso SL (SL) | ACA963 | AGR963, AG923TA, AG830CD |
| 03:52 | Volcables SL (SL) | AI1681 | AI101HX, AI263XP, AI058IM |
| 03:57 | Balanza ingreso SL (SL) | OUP690 | OUP680, OUP630, OLP630 |
| 04:03 | Balanza ingreso SL (SL) | FDD911 | HFD941, FFB901, LTF084 |
| 04:30 | Volcables SL (SL) | OLP630 | OUP630, OUP680, DLP334 |
| 04:38 | Volcables SL (SL) | TCY61 | KCY113, MCB631, BEY614 |
| 04:42 | Balanza egreso SL (SL) | OUP690 | OUP680, OUP630, OLP630 |
| 04:44 | Volcables SL (SL) | DVS878 | OVS674, OJV576, DTV755 |
| 04:45 | Balanza ingreso SL (SL) | WH2582 | EWH682, JWE262, IWM581 |
| 04:47 | Balanza ingreso SL (SL) | AG830CD | AG902CO, AA330CA, AB886TO |
| 05:22 | Volcables SL (SL) | AG830CD | AG902CO, AA330CA, AB886TO |
| 05:32 | Egreso SL (SL) | ECH18 | CHR107, EHN104, CFG112 |
| 05:34 | Balanza egreso SL (SL) | AG830CD | AG902CO, AA330CA, AB886TO |
| 05:39 | Egreso SL (SL) | AG830CD | AG902CO, AA330CA, AB886TO |
| 05:53 | Balanza ingreso SL (SL) | AD360MP | AD360MF, AD788NP, AB886TP |
| 07:46 | Renova (SL) | JZW72 | LOQ416, JWE262, PJD728 |
| 08:08 | Egreso SL (SL) | DRF28 | DNH321, HDD726, EFA323 |
| 09:09 | Ingreso SL (SL) | AI206KN | AI308DN, AI286PA, AD250NG |
| 09:14 | Balanza ingreso SL (SL) | AI206KN | AI308DN, AI286PA, AD250NG |
| 09:35 | Egreso SL (SL) | AE372UI | AE882UD, AF532VJ, AI370ZR |
| 09:45 | Egreso SL (SL) | LZA483 | KZA683, AE506AI, AC026RV |
| 09:46 | Egreso SL (SL) | LZA483 | KZA683, AA703FC, GJL143 |
| 09:50 | Ingreso SL (SL) | LZA483 | KZA683, LAU467, LEQ188 |
| 10:12 | Calada SL (SL) | LZA483 | KZA683, LAU467, LEQ188 |
| 10:19 | Balanza ingreso SL (SL) | LZA483 | KZA683, LAU467, LEQ188 |
| 10:29 | Ingreso SL (SL) | AA516AQ | AA541AA, AF591JQ, AA543NP |
| 10:31 | Balanza ingreso SL (SL) | LGS586 | EBS566, LEQ188, MQM566 |
| 10:36 | Renova (SL) | AI206KN | AI308DN, AI286PA, AD250NG |
| 10:37 | Ingreso SL (SL) | AA516AQ | AA541AA, AF591JQ, AA543NP |
| 10:41 | Ingreso SL (SL) | AF878VQ | AE878VO, AE879OO, AF681QS |
| 10:41 | Balanza ingreso SL (SL) | AA516AQ | AA541AA, AF591JQ, AA543NP |
| 10:54 | Balanza ingreso SL (SL) | AF878VQ | AE878VO, AE879OO, AF681QS |
| 10:58 | Egreso SL (SL) | AF734XO | AC731XT, AE814FQ, AB343CG |
| 11:05 | Ingreso SL (SL) | LYX784 | EKX731, BEY774, NVX871 |
| 11:08 | Renova (SL) | AF878VQ | AE878VO, AE879OO, AF681QS |
| 11:24 | Balanza ingreso SL (SL) | LYX784 | EKX731, BEY774, EXU131 |
| 11:24 | Balanza ingreso SL (SL) | LYX784 | EKX731, BEY774, NVX871 |
| 11:24 | Balanza egreso SL (SL) | AA516AQ | AA541AA, AF591JQ, AA543NP |
| 11:26 | Egreso SL (SL) | AA516AQ | AA541AA, AF591JQ, AA543NP |
| 11:38 | Ingreso SL (SL) | AB470QT | AC406QT, AC417CO, AA174DA |
| 11:45 | Egreso SL (SL) | AE372UI | AE882UD, AF591JQ, AG803AO |
| 11:51 | Balanza ingreso SL (SL) | AB470QT | AC406QT, AC417CO, AA174DA |
| 12:01 | Carga y descarga SL (SL) | LZA483 | KZA683, LAU467, LEQ188 |
| 12:07 | Balanza egreso SL (SL) | AB470QT | AC406QT, AC417CO, AA174DA |
| 12:09 | Egreso SL (SL) | AB470QT | AC406QT, AC417CO, AA174DA |
| 12:15 | Balanza egreso SL (SL) | AI206KN | AI308DN, AI286PA, AD250NG |
| 12:28 | Ingreso SL (SL) | AB646GZ | AD605CZ, AD643GA, AB601OZ |
| 12:33 | Balanza ingreso SL (SL) | AB646GZ | AD605CZ, AD643GA, AB601OZ |
| 12:34 | Ingreso SL (SL) | ION372 | DUN372, DON372, GYW157 |
| 12:39 | Balanza egreso SL (SL) | LZA483 | KZA683, LAU467, LEQ188 |
| 12:41 | Balanza egreso SL (SL) | AF878VQ | AE878VO, AE879OO, AF681QS |
| 12:42 | Ingreso SL (SL) | AB470QT | AC406QT, AC417CO, AA174DA |
| 12:43 | Egreso SL (SL) | AF878VQ | AE878VO, AE879OO, AF681QS |
| 12:45 | Egreso SL (SL) | AE878VO | AF878VQ, AE879OO, AE882UD |
| 12:52 | Renova (SL) | AB646GZ | AD605CZ, AD643GA, AB601OZ |
| 13:22 | Calada SL (SL) | AB470QT | AC406QT, AC417CO, AA174DA |
| 13:24 | Balanza ingreso SL (SL) | AB470QT | AC406QT, AC417CO, AA174DA |
| 13:54 | Renova (SL) | LYX784 | EKX731, BEY774, NVX871 |
| 13:55 | Balanza ingreso SL (SL) | AB470QT | AC406QT, AC417CO, AA174DA |
| 14:12 | Carga y descarga SL (SL) | AB470QT | AC406QT, AC417CO, AA174DA |
| 14:23 | Egreso SL (SL) | AE848XX | AE848CX, AE849JD, AE506AI |
| 14:25 | Balanza egreso SL (SL) | AB646GZ | AD605CZ, AD643GA, AB601OZ |
| 14:28 | Egreso SL (SL) | AB646GZ | AD605CZ, AD643GA, AB601OZ |
| 15:20 | Balanza egreso SL (SL) | LYX784 | EKX731, BEY774, NVX871 |
| 15:45 | Balanza egreso SL (SL) | AB470QT | AC406QT, AC417CO, AA174DA |
| 16:25 | Egreso SL (SL) | AI206KN | AI308DN, AI286PA, AD250NG |
| 16:28 | Egreso SL (SL) | LYX784 | EKX731, BEY774, NVX871 |

## 5 · El lote: viajes esperados y sus pasos

Cada viaje que se esperaba (por carta de porte, base sin carta o SGC) y el estado de sus pasos: leído por cámara, reconstruido con una captura asignada por el vínculo, deducido (sin captura, entre dos lecturas), en curso o faltante.

| Universo: cartas de porte | 02/11 | 03/11 | 04/11 | 05/11 | 06/11 |
| --- | ---: | ---: | ---: | ---: | ---: |
| viajes | 183 | 159 | 218 | 344 | 248 |
| camara | 1397 (86 %) | 1190 (87 %) | 1643 (87 %) | 2619 (87 %) | 1635 (79 %) |
| reconstruido | 132 (8 %) | 82 (6 %) | 137 (7 %) | 198 (7 %) | 104 (5 %) |
| deducido | 68 (4 %) | 68 (5 %) | 91 (5 %) | 145 (5 %) | 40 (2 %) |
| por carta | 10 (1 %) | 9 (1 %) | 11 (1 %) | 16 (1 %) | 0 (0 %) |
| en curso | 19 (1 %) | 18 (1 %) | 16 (1 %) | 13 (0 %) | 281 (14 %) |
| falta | 1 (0 %) | 3 (0 %) | 1 (0 %) | 3 (0 %) | 2 (0 %) |

| Universo: base sin carta | 02/11 | 03/11 | 04/11 | 05/11 | 06/11 |
| --- | ---: | ---: | ---: | ---: | ---: |
| viajes | 37 | 29 | 34 | 37 | 22 |
| camara | 157 (81 %) | 102 (68 %) | 168 (79 %) | 146 (76 %) | 88 (69 %) |
| reconstruido | 23 (12 %) | 26 (17 %) | 20 (9 %) | 28 (15 %) | 19 (15 %) |
| deducido | 10 (5 %) | 7 (5 %) | 20 (9 %) | 12 (6 %) | 9 (7 %) |
| en curso | 0 (0 %) | 0 (0 %) | 2 (1 %) | 3 (2 %) | 6 (5 %) |
| falta | 4 (2 %) | 16 (11 %) | 4 (2 %) | 2 (1 %) | 5 (4 %) |

| Universo: SGC | 02/11 | 03/11 | 04/11 | 05/11 | 06/11 |
| --- | ---: | ---: | ---: | ---: | ---: |
| viajes | 12 | 11 | 12 | 12 | 0 |
| camara | 78 (76 %) | 50 (86 %) | 64 (76 %) | 56 (71 %) | 0 (—) |
| reconstruido | 4 (4 %) | 1 (2 %) | 3 (4 %) | 4 (5 %) | 0 (—) |
| deducido | 20 (20 %) | 7 (12 %) | 12 (14 %) | 14 (18 %) | 0 (—) |
| en curso | 0 (0 %) | 0 (0 %) | 1 (1 %) | 0 (0 %) | 0 (—) |
| falta | 0 (0 %) | 0 (0 %) | 4 (5 %) | 5 (6 %) | 0 (—) |


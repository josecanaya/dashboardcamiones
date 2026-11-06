# Reconocimiento por capas · 03/11 y 04/11

Replay de cada día por el recorrido acordado (`docs/RECONOCEDOR_RECORRIDO_CAPTURA.md`), con `scripts/replay-capas-dia.mjs`. Cada paso (frontal + trasera + repeticiones de un vehículo en un nodo) termina en una sola capa.

## 1 · Dónde terminó cada paso

| Capa | 03/11 | 04/11 |
| --- | ---: | ---: |
| Capa 2 · ¿quién es? (comparación exacta) | 2046 (74 %) | 2563 (75 %) |
| Leída por recorrido de cámaras | 16 (1 %) | 39 (1 %) |
| Capa 3.1 · patentes parecidas, lote y vínculo | 349 (13 %) | 437 (13 %) |
| Capa 3.3 · banco de corregidas | 17 (1 %) | 17 (0 %) |
| Lectura errónea confirmada (ilegible junto a un paso guardado) | 104 (4 %) | 135 (4 %) |
| Capa 4 · alerta | 224 (8 %) | 237 (7 %) |
| **Total de pasos** | **2756** | **3428** |

## 2 · Con qué regla resolvió cada capa

| Capa · regla | 03/11 | 04/11 |
| --- | ---: | ---: |
| 2 · carta de porte | 1123 | 1634 |
| 2 · base particulares | 578 | 524 |
| 2 · base sin carta | 211 | 259 |
| 2 · respaldo SGC | 134 | 146 |
| leida · recorrido de cámaras | 16 | 39 |
| 3.1 · vinculo | 121 | 160 |
| 3.1 · carta_parecida | 132 | 138 |
| 3.1 · universo | 41 | 59 |
| 3.1 · par_trasera | 34 | 52 |
| 3.1 · cuenta | 16 | 14 |
| 3.1 · doble_lectura | 5 | 14 |
| 3.3 · no es camión | 10 | 8 |
| 3.3 · corregida_antes | 7 | 7 |
| 3.3 · confirmada_antes | 0 | 2 |
| lectura_erronea · repetición de paso guardado | 104 | 135 |
| 4 · lectura ilegible sin asignar | 122 | 91 |
| 4 · sin registro | 65 | 79 |
| 4 · lectura dudosa | 26 | 50 |
| 4 · ilegible en la misma alerta | 11 | 14 |
| 4 · camión de granos sin carta | 0 | 3 |

## 3 · Las correcciones vuelven a la capa 2 contra…

| Base | 03/11 | 04/11 |
| --- | ---: | ---: |
| carta de porte | 246 | 315 |
| nadie | 24 | 24 |
| base sin carta | 74 | 76 |
| base particulares | 21 | 34 |

«nadie»: la patente corregida no está en ninguna base; queda como camión sin registro.

## 4 · Qué quedó suelto (capa 4)

| Motivo | 03/11 | 04/11 |
| --- | ---: | ---: |
| lectura dudosa | 26 | 50 |
| lectura ilegible sin asignar | 122 | 91 |
| sin registro | 65 | 79 |
| ilegible en la misma alerta | 11 | 14 |
| camión de granos sin carta | 0 | 3 |
| **Total** | **224** | **237** |

### Por nodo

| Nodo (planta) | 03/11 | 04/11 |
| --- | ---: | ---: |
| Egreso SL (SL) | 50 | 48 |
| Balanza (Ric) | 35 | 36 |
| Renova (SL) | 27 | 29 |
| Balanza egreso SL (SL) | 33 | 19 |
| Volcables SL (SL) | 15 | 21 |
| Salida 2 (Ric) | 10 | 17 |
| Ingreso (Ric) | 10 | 14 |
| Ingreso SL (SL) | 11 | 10 |
| Preingreso (Ric) | 7 | 11 |
| Balanza ingreso SL (SL) | 6 | 9 |
| Playa 3 (Ric) | 6 | 6 |
| Carga OSL (Ric) | 5 | 5 |
| Calada (Ric) | 4 | 6 |
| Calada SL (SL) |  | 5 |
| Carga y descarga SL (SL) | 3 | 1 |
| Silo Keppler (Ric) | 2 |  |

### Sin registro el 03/11: 38 patentes, 65 pasos

Patente válida que no está en cartas, bases ni SGC. Las de 2 o más nodos son vehículos reales que recorren la planta.

| Patente | Pasos | Nodos | Primera–última |
|---|---:|---|---|
| AB531CT | 6 | Ingreso SL, Balanza ingreso SL, Renova, Balanza egreso SL, Egreso SL | 08:44–09:45 |
| KAP262 | 5 | Ingreso, Preingreso, Calada, Salida 2, Balanza | 09:51–11:21 |
| KST146 | 5 | Ingreso, Preingreso, Salida 2, Balanza | 08:32–10:05 |
| NXS389 | 3 | Ingreso, Preingreso, Balanza | 14:01–15:05 |
| MTM450 | 4 | Balanza, Egreso SL | 09:55–13:55 |
| GIE905 | 3 | Egreso SL, Balanza egreso SL | 06:38–08:41 |
| RSW086 | 3 | Egreso SL, Renova | 06:51–15:13 |
| LDL778 | 2 | Volcables SL, Egreso SL | 04:04–04:29 |
| AI630IL | 2 | Balanza egreso SL, Egreso SL | 06:55–06:56 |
| AB249DS | 2 | Balanza | 13:01–13:10 |
| LWE929 | 2 | Egreso SL | 09:53–10:10 |
| AD686SH | 2 | Egreso SL | 15:57–15:58 |
| OQT486 | 1 | Ingreso | 00:58–00:58 |
| QXS713 | 1 | Preingreso | 04:05–04:05 |
| AF211CF | 1 | Balanza | 07:45–07:45 |
| AG714AI | 1 | Balanza | 08:30–08:30 |
| KWD619 | 1 | Balanza | 08:36–08:36 |
| AYL780 | 1 | Calada | 13:37–13:37 |
| NAD656 | 1 | Balanza | 13:40–13:40 |
| AF511CR | 1 | Balanza | 14:01–14:01 |
| HIP705 | 1 | Calada | 15:05–15:05 |
| EYD058 | 1 | Preingreso | 19:51–19:51 |
| VKH406 | 1 | Carga OSL | 22:02–22:02 |
| UVS596 | 1 | Balanza ingreso SL | 00:32–00:32 |
| IOT697 | 1 | Balanza ingreso SL | 00:34–00:34 |
| GXC802 | 1 | Egreso SL | 02:26–02:26 |
| AE937SG | 1 | Egreso SL | 06:34–06:34 |
| AG142JP | 1 | Egreso SL | 06:36–06:36 |
| NML819 | 1 | Renova | 07:36–07:36 |
| AD249FJ | 1 | Egreso SL | 08:52–08:52 |
| OLM985 | 1 | Volcables SL | 08:56–08:56 |
| BQD631 | 1 | Balanza egreso SL | 09:16–09:16 |
| AG189YR | 1 | Egreso SL | 10:24–10:24 |
| ILE014 | 1 | Egreso SL | 11:29–11:29 |
| BBF937 | 1 | Egreso SL | 12:06–12:06 |
| LJB986 | 1 | Egreso SL | 14:54–14:54 |
| FTC550 | 1 | Renova | 20:00–20:00 |
| SLV371 | 1 | Balanza egreso SL | 20:59–20:59 |

### Lecturas dudosas el 03/11: 26

Hay candidatos, pero ninguno alcanza para asignar solo.

| Hora | Nodo | Leyó | Candidatos |
|---|---|---|---|
| 00:10 | Playa 3 (Ric) | LU3901 | EGV380, HNE318, CRJ139 |
| 01:15 | Salida 2 (Ric) | EEI05 | EEW075, EIW151, BQI495 |
| 07:29 | Balanza (Ric) | IMH787 | IWH787, KOU871 |
| 07:35 | Balanza (Ric) | IMH787 | IWH787, KOU871 |
| 10:42 | Ingreso (Ric) | NHB772 | KHB772, GDW647, AC297XI |
| 15:58 | Calada (Ric) | CTW79 | CTW713, IXG529, MMC881 |
| 20:23 | Carga OSL (Ric) | GZI01 | GZI868, GZT868, AG294KA |
| 00:13 | Balanza egreso SL (SL) | LHE30 | HNE318, LHL423, EYH843 |
| 00:24 | Balanza ingreso SL (SL) | EUF420 | EUD420, EUU420, LUE425 |
| 00:45 | Ingreso SL (SL) | NMT181 | NYT101, NIT101, NYI181 |
| 02:23 | Renova (SL) | EMC07 | NCC287, MCB678, EKC425 |
| 02:25 | Egreso SL (SL) | SB2945 | SPB945, SPH945, DUL425 |
| 04:55 | Ingreso SL (SL) | LVI32 | EVD342, UTS820, VJG112 |
| 05:18 | Balanza egreso SL (SL) | NMT181 | NYT101, NIT101, NYI181 |
| 05:22 | Egreso SL (SL) | NWAP181 | JBX310, BQI495, NYI181 |
| 06:41 | Egreso SL (SL) | AB2208 | AB322UD, AH540BR, VNA879 |
| 06:41 | Egreso SL (SL) | AB2203 | AB322UD, AH540BR, BTS626 |
| 06:52 | Balanza egreso SL (SL) | AI630IL | AB430IE, SZG660, JTH801 |
| 08:26 | Balanza egreso SL (SL) | BAD62 | BTS626, DTA865, AD829RY |
| 09:00 | Balanza egreso SL (SL) | DRF28 | DPN282, KOQ228, DGR440 |
| 09:07 | Balanza egreso SL (SL) | DRF28 | DPN282, KOQ228, DGR440 |
| 10:19 | Balanza ingreso SL (SL) | GYE2357 | OKH237, EOI579, AC935LK |
| 12:31 | Renova (SL) | EMG07 | EMD070, EPH797, AE624GL |
| 12:48 | Volcables SL (SL) | AF55073 | FTB573, AE556ZN, AE870JF |
| 12:57 | Egreso SL (SL) | AF55073 | FTB573, AE556ZN, AE870JF |
| 16:20 | Renova (SL) | II1104 | TIE100, AG103DO, SNP211 |

### Sin registro el 04/11: 46 patentes, 79 pasos

Patente válida que no está en cartas, bases ni SGC. Las de 2 o más nodos son vehículos reales que recorren la planta.

| Patente | Pasos | Nodos | Primera–última |
|---|---:|---|---|
| NAD656 | 4 | Ingreso SL, Balanza ingreso SL, Balanza egreso SL, Egreso SL | 08:50–11:15 |
| STN749 | 3 | Ingreso, Preingreso, Salida 2 | 01:12–04:52 |
| FKE007 | 4 | Egreso SL, Balanza egreso SL | 18:08–19:13 |
| AI555VZ | 3 | Balanza, Playa 3 | 14:50–15:28 |
| GIE905 | 3 | Egreso SL, Balanza egreso SL | 06:39–15:49 |
| IPV201 | 3 | Egreso SL, Renova | 15:00–15:22 |
| FSW142 | 2 | Preingreso, Salida 2 | 05:45–07:50 |
| RSW086 | 2 | Playa 3, Balanza | 14:40–15:31 |
| CCQ063 | 7 | Renova | 02:02–05:33 |
| OLM985 | 4 | Balanza | 13:47–14:07 |
| AG142JP | 4 | Egreso SL | 06:37–16:19 |
| EHX499 | 2 | Balanza | 10:26–10:42 |
| FDM335 | 2 | Balanza | 13:57–14:33 |
| ONT741 | 2 | Balanza | 14:28–14:46 |
| AA363IF | 2 | Balanza | 14:35–15:45 |
| CFU067 | 2 | Renova | 03:58–04:15 |
| EGL373 | 1 | Ingreso | 05:41–05:41 |
| EXR687 | 1 | Balanza | 06:27–06:27 |
| AS073CU | 1 | Balanza | 06:45–06:45 |
| AF219QA | 1 | Balanza | 06:53–06:53 |
| HCD327 | 1 | Balanza | 07:09–07:09 |
| AI651US | 1 | Balanza | 07:17–07:17 |
| DVS998 | 1 | Salida 2 | 08:11–08:11 |
| AG453CJ | 1 | Ingreso | 08:44–08:44 |
| PQQ1U70 | 1 | Salida 2 | 09:09–09:09 |
| MLK555 | 1 | Balanza | 09:56–09:56 |
| BAW9A38 | 1 | Salida 2 | 10:15–10:15 |
| IFR518 | 1 | Preingreso | 12:13–12:13 |
| AYL780 | 1 | Calada | 13:43–13:43 |
| AA364HA | 1 | Balanza | 14:35–14:35 |
| BVG200 | 1 | Calada | 20:02–20:02 |
| EDP750 | 1 | Balanza egreso SL | 00:27–00:27 |
| IHH338 | 1 | Ingreso SL | 00:33–00:33 |
| IOG570 | 1 | Renova | 03:02–03:02 |
| AE937SG | 1 | Egreso SL | 06:31–06:31 |
| OOD210 | 1 | Renova | 11:48–11:48 |
| ICD135 | 1 | Renova | 11:48–11:48 |
| ESI930 | 1 | Egreso SL | 13:24–13:24 |
| HSF011 | 1 | Renova | 14:21–14:21 |
| CJV1M51 | 1 | Balanza egreso SL | 15:17–15:17 |
| AC539YP | 1 | Balanza egreso SL | 15:48–15:48 |
| AD686SH | 1 | Egreso SL | 15:53–15:53 |
| CVA136 | 1 | Balanza ingreso SL | 17:07–17:07 |
| BNX098 | 1 | Calada SL | 22:45–22:45 |
| MVK630 | 1 | Balanza egreso SL | 23:14–23:14 |
| OOF155 | 1 | Volcables SL | 23:18–23:18 |

### Lecturas dudosas el 04/11: 50

Hay candidatos, pero ninguno alcanza para asignar solo.

| Hora | Nodo | Leyó | Candidatos |
|---|---|---|---|
| 00:08 | Salida 2 (Ric) | HNG34 | MMC881, HRJ444, HEM938 |
| 11:25 | Ingreso (Ric) | AA759DA | AA750BH, KCO877 |
| 12:06 | Preingreso (Ric) | AD709VW | AD702WW, AD702VV, AD575AV |
| 12:13 | Salida 2 (Ric) | AA759DA | AA750BH, KCO877 |
| 13:22 | Calada (Ric) | CTW77 | CTW713, KCO877, LVP777 |
| 13:33 | Calada (Ric) | AD709VW | AD702WW, AD702VV, AD575AV |
| 13:41 | Ingreso (Ric) | AD702VV | AD702WW, AD709VW, GBB093 |
| 13:59 | Ingreso (Ric) | KXY494 | KPY495, KQG451, GBB093 |
| 14:02 | Preingreso (Ric) | KXY494 | KPY495, KQG451, GBB093 |
| 15:58 | Salida 2 (Ric) | AD702VV | AD702WW, AD709VW, GBB093 |
| 18:15 | Calada (Ric) | FYJ562 | FAJ561, FYQ568, AI456DN |
| 18:35 | Salida 2 (Ric) | FYJ562 | FAJ561, FYQ568, AI456DN |
| 18:45 | Preingreso (Ric) | TIU17 | AI178FR, ULU413, AF711DG |
| 22:52 | Calada (Ric) | BSL80 | LXD186, BIT440, AH381GD |
| 00:38 | Volcables SL (SL) | AF4056 | AF405FH, AE405EH, AE138FG |
| 01:08 | Volcables SL (SL) | AD0078 | AD001RG, AI047VW, MJD070 |
| 05:03 | Ingreso SL (SL) | SJS749 | STN749, VSO429, TJE478 |
| 05:20 | Ingreso SL (SL) | CFXG008 | CXN483, CFK006, GXN483 |
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
| 12:09 | Renova (SL) | AH718HW | AH274MW, AH717AW, VCK738 |
| 13:24 | Ingreso SL (SL) | KXY494 | KPY495, MYA819, KEH448 |
| 13:33 | Balanza ingreso SL (SL) | KXY494 | KPY495, MYA819, KEH448 |
| 13:39 | Balanza egreso SL (SL) | KXY494 | KPY495, MYA819, KEH448 |
| 13:43 | Egreso SL (SL) | KXY494 | KPY495, MYA819, KEH448 |
| 16:08 | Ingreso SL (SL) | AD702VV | AD702WW, AD709VW, AD785UY |
| 16:20 | Balanza egreso SL (SL) | DIH46 | DTG256, EMM462, EIM844 |
| 17:37 | Egreso SL (SL) | AD768XB | AE719XB, AA703FC, AH795LV |
| 19:25 | Egreso SL (SL) | AB2203 | GYC220, AA703FC, FKE007 |
| 19:27 | Volcables SL (SL) | ELZ15 | AF719ZS, PLR345, DGY115 |
| 19:56 | Renova (SL) | AG20600 | IXB766, IJC110, AG406UJ |
| 20:13 | Egreso SL (SL) | AD702VV | AD702WW, AD709VW, AD785UY |
| 20:29 | Calada SL (SL) | EEW05 | LYQ656, LCP506, AA875OG |
| 20:57 | Balanza ingreso SL (SL) | FLD104 | EDG101, EAO104, NUD400 |
| 21:27 | Renova (SL) | AC685ON | AC686NV, CMF111, IXB766 |
| 22:55 | Balanza ingreso SL (SL) | FLD104 | EDG101, EAO104, NUD400 |
| 23:32 | Egreso SL (SL) | FOR199 | GQF199, TZN189, ENF949 |

## 5 · El lote: viajes esperados y sus pasos

Cada viaje que se esperaba (por carta de porte, base sin carta o SGC) y el estado de sus pasos: leído por cámara, reconstruido con una captura asignada por el vínculo, deducido (sin captura, entre dos lecturas), en curso o faltante.

| Universo: cartas de porte | 03/11 | 04/11 |
| --- | ---: | ---: |
| viajes | 159 | 218 |
| camara | 1190 (87 %) | 1644 (87 %) |
| reconstruido | 82 (6 %) | 137 (7 %) |
| deducido | 68 (5 %) | 90 (5 %) |
| por carta | 9 (1 %) | 11 (1 %) |
| en curso | 18 (1 %) | 16 (1 %) |
| falta | 3 (0 %) | 1 (0 %) |

| Universo: base sin carta | 03/11 | 04/11 |
| --- | ---: | ---: |
| viajes | 29 | 34 |
| camara | 102 (68 %) | 168 (79 %) |
| reconstruido | 26 (17 %) | 20 (9 %) |
| deducido | 7 (5 %) | 20 (9 %) |
| en curso | 0 (0 %) | 2 (1 %) |
| falta | 16 (11 %) | 4 (2 %) |

| Universo: SGC | 03/11 | 04/11 |
| --- | ---: | ---: |
| viajes | 11 | 10 |
| camara | 50 (86 %) | 62 (82 %) |
| reconstruido | 1 (2 %) | 3 (4 %) |
| deducido | 7 (12 %) | 10 (13 %) |
| en curso | 0 (0 %) | 1 (1 %) |


## 6 · Lectura y qué queda por pulir

Corrida del 06/11 con el código de `automatizacion` (`dbb7d28`), sin metadatos (3.2: el servidor 8787 estaba apagado)
y con la IA (3.4) apagada.

- **Resueltos sin alerta:** 03/11 2.532 de 2.756 pasos (92 %), 04/11 3.191 de 3.428 (93 %). Las capas 2 y 3.1 hacen
  casi todo; el banco (3.3) aporta poco porque se corrige ya en 3.1.
- **Camiones con carta (el lote):** 99,8 % de sus pasos explicados (cámara 87 %, reconstruido 6–7 %, deducido 5 %); faltan 3 y 1 pasos.
- **Alertas: 224 y 237 pasos**, de tres clases muy distintas:
  1. **Ilegibles sin asignar (133 / 105):** casi todas en salidas del puerto (Egreso SL, Balanza egreso SL), Renova y
     Balanza de Ricardone, donde pasan livianos y vehículos de Renova que no están en ningún universo. Ninguna viene
     vacía: todas traen texto.
  2. **Sin registro (38 / 46 patentes):** solo 9 y 8 recorren 2 o más nodos (vehículos reales sin papeles: ahí
     aparecen los casos del anexo de seguridad KAP262, KST146, NXS389, NAD656, FSW142); 26 y 30 se ven únicamente en
     Egreso SL, Renova o una balanza (livianos y contratistas que deberían ir a la cola de candidatos de particulares).
  3. **Dudosas (26 / 50 pasos, 22 / 27 lecturas distintas):** varias se repiten (EWX794 ×8, KXY494 ×6, AD702VV ×4):
     es el mismo vehículo mal leído siempre igual o una patente real que no está en las bases.

Por pulir, en orden:

1. **Alerta por vehículo, no por paso.** Agrupar por patente (sin registro y dudosas repetidas) y por racimo
   (ilegibles): las 224–237 alertas de paso son unas pocas decenas de vehículos.
2. **Livianos y servicios que se ven solo en salidas, Renova o balanza** → cola de candidatos de particulares, no alerta.
3. **Renova**: sus vehículos no tienen carta ni base; definir si se suman como universo propio o se excluyen del aviso.
4. **Dudosas con un candidato claro que no se asigna** (CTW79 → CTW713, EUF420 → EUD420, NHB772 → KHB772): revisar el
   margen contra el segundo candidato.
5. **Base sin carta:** el 03/11 le faltan 16 pasos (11 %), muy por encima de las cartas.
6. Medir de nuevo con metadatos (servidor arriba) y con el respaldo SGC más largo para líquidos.

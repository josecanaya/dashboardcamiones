# Excepción explícita de composición de rutas

15-09-2026. Antes de esta intervención `npm test` ya fallaba por dos imports en `src/App.tsx` y `src/app/postTransformRoutes.tsx`. Ambos componen rutas con el provider/hook del contexto compartido, introducidos en la navegación existente.

Decisión: permitir **solo el módulo exacto EtlWorkbenchContext en esos dos archivos**. No ampliar ETLWORKBENCH_IMPORT_BASELINE, no permitir otros módulos internos, no modificar reglas del núcleo puro ni de catálogo. Un import diferente en cualquiera de esos archivos vuelve a fallar. Cambio aislado en su propio commit, sin cambio de runtime.

Deuda: futura fachada pública de la feature puede eliminar la excepción; no disfrazar el import con un re-export solo para pasar el chequeo. Esta excepción reconoce el punto de composición de la app, no habilita ETL en páginas nuevas.

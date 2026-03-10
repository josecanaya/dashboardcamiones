export function PlanningDemandPage() {
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Planificación y demanda</h2>
        <p className="mt-1 text-xs text-slate-500">
          Capa futura orientada a previsión operativa. Esta vista ya deja preparado el modelo de información para cupos y saturación.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Demanda proyectada</h3>
          <p className="mt-2 text-2xl font-bold text-slate-900">+18%</p>
          <p className="text-xs text-slate-500">Pendiente integración con datos reales.</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Riesgo de saturación</h3>
          <p className="mt-2 text-2xl font-bold text-amber-700">Medio</p>
          <p className="text-xs text-slate-500">Pico estimado entre 10:00 y 12:00.</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Cupos confirmados</h3>
          <p className="mt-2 text-2xl font-bold text-slate-900">124</p>
          <p className="text-xs text-slate-500">Pendiente integración con agenda real.</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Alertas preventivas</h3>
          <p className="mt-2 text-2xl font-bold text-rose-700">3</p>
          <p className="text-xs text-slate-500">Reglas de anticipación (placeholder).</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Datos faltantes para activar módulo</h3>
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          <li>• Cupos programados por planta, circuito y franja horaria</li>
          <li>• Agenda logística y ventanas de llegada por transportista</li>
          <li>• Turnos de descarga/carga y restricciones operativas</li>
          <li>• Proyección de volumen esperado por producto</li>
        </ul>
      </section>
    </div>
  )
}

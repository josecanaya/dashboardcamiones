import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './ui.css'

export function Button({ primary, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button type="button" {...props} className={`ui-button ${primary ? 'ui-button--primary' : ''} ${className}`} />
}
export function StatusChip({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>
}
export function MetricCard({ label, value, hint, loading = false }: { label: string; value: ReactNode; hint?: ReactNode; loading?: boolean }) {
  return <div className="ui-panel"><div className="ui-label">{label}</div>
    {loading ? <div className="ui-skeleton mt-2" aria-label="Cargando" /> : <div className="ui-metric-value">{value ?? 'sin dato'}</div>}
    {hint ? <div className="ui-label mt-2">{hint}</div> : null}
  </div>
}
export function Disclosure({ title, children, open = false, id }: { title: string; children: ReactNode; open?: boolean; id?: string }) {
  return <details id={id} className="ui-disclosure ui-section-target" open={open || undefined}
    onToggle={(e) => {
      if ((e.currentTarget as HTMLDetailsElement).open) {
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
      }
    }}
  >
    <summary>{title}</summary><div className="ui-disclosure-content">{children}</div>
  </details>
}
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  return <nav className="ui-section-nav" aria-label="Secciones de esta pantalla">{items.map(item => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}</nav>
}

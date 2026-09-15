import { useId, useState, type ReactNode } from 'react'
import { Button } from './Interface'

/** Conserva el orden de dominio; búsqueda y páginas limitan solo lo visible. */
export function PagedList<T>({ items, itemKey, renderItem, searchText, label, pageSize = 12, className = '' }: {
  items: T[]; itemKey: (item: T) => string; renderItem: (item: T) => ReactNode;
  searchText?: (item: T) => string; label: string; pageSize?: number; className?: string;
}) {
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const id = useId()
  const normalized = query.trim().toLocaleLowerCase('es-AR')
  const filtered = searchText && normalized ? items.filter(item => searchText(item).toLocaleLowerCase('es-AR').includes(normalized)) : items
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pages - 1)
  const start = current * pageSize
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      {searchText ? <label className="flex items-center gap-2 ui-label" htmlFor={id}>Buscar {label}<input id={id} className="ui-input" value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} /></label> : null}
      <span className="ui-label" role="status">{filtered.length ? `${start + 1}–${Math.min(start + pageSize, filtered.length)} de ${filtered.length}` : 'Sin resultados'} {label}</span>
    </div>
    <div className={className}>{filtered.slice(start, start + pageSize).map(item => <div key={itemKey(item)}>{renderItem(item)}</div>)}</div>
    {pages > 1 ? <nav aria-label={`Páginas de ${label}`} className="flex items-center justify-end gap-3">
      <Button disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</Button>
      <span className="ui-label">Página {current + 1} de {pages}</span>
      <Button disabled={current === pages - 1} onClick={() => setPage(current + 1)}>Siguiente</Button>
    </nav> : null}
  </div>
}

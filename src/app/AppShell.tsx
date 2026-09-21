import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { TruckPlateRegistryLauncher } from '../features/real-truckflow/components/TruckPlateRegistryLauncher'
import { NvaiBubble } from '../components/nvai/NvaiBubble'
import { PRODUCT_SECTIONS, type NavGroup, type NavLeaf, type NavSection } from './sectors'
import './appShell.css'
import { HistoricalWorkspace } from '../features/real-truckflow/components/HistoricalWorkspace'

function SidebarLink({ to, label }: NavLeaf) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `tf-nav-link${isActive ? ' tf-nav-link--active' : ''}`
      }
    >
      {label}
    </NavLink>
  )
}

function SidebarGroup({ title, items }: NavGroup) {
  return (
    <div className="mb-2">
      <p className="tf-nav-group">
        {title}
      </p>
      <div className="space-y-0.5">
        {items.map((it) => (
          <SidebarLink key={it.to} {...it} />
        ))}
      </div>
    </div>
  )
}

function SidebarSection({ section }: { section: NavSection }) {
  return (
    <div className="mb-4">
      <p className="tf-nav-section">
        {section.title}
      </p>
      {section.items?.length ? (
        <div className="mb-2 space-y-0.5">
          {section.items.map((it) => (
            <SidebarLink key={it.to} {...it} />
          ))}
        </div>
      ) : null}
      {section.groups?.map((g) => (
        <SidebarGroup key={g.title} {...g} />
      ))}
    </div>
  )
}

export function AppShell() {
  const location = useLocation()
  const isHomePrototype = location.pathname === '/herramientas/prototipo-home'
  const isMapHome = location.pathname === '/' || isHomePrototype
  const [navOpen, setNavOpen] = useState(false)
  return (
    <div className="tf-shell min-h-screen bg-surface-50">
      <main className="flex min-h-[calc(100vh-24px)] items-stretch gap-3 pt-3 pr-3 pb-3 pl-0">
        <aside className={`tf-sidebar h-[calc(100vh-24px)] shrink-0 overflow-y-auto p-3 transition-[width] ${!navOpen ? 'w-[68px]' : 'w-[248px]'}`}>
          <div className="tf-brand">
            <img className="tf-brand-logo" src="/branding/nueva-vicentin-argentina.jfif" alt="Nueva Vicentin Argentina" />
            <div className={!navOpen ? 'hidden' : ''}>
              <span className="tf-brand-name">Truckflow</span>
              <span className="tf-brand-caption">Control operativo</span>
            </div>
          </div>

          <button type="button" onClick={() => setNavOpen((value) => !value)} className="tf-sidebar-toggle mb-3 grid h-10 w-full place-items-center rounded-lg border border-slate-200 text-lg" aria-label={navOpen ? 'Colapsar menú' : 'Expandir menú'} title={navOpen ? 'Colapsar menú' : 'Expandir menú'}>{navOpen ? '‹' : '›'}</button>

          <nav aria-label="Navegación principal" className={!navOpen ? 'hidden' : ''}>
          {PRODUCT_SECTIONS.map((s) => (
            <SidebarSection key={s.title} section={s} />
          ))}
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 self-stretch overflow-auto">
          {isMapHome ? null : <section className="tf-header flex shrink-0 items-center justify-between gap-3 rounded-2xl px-4 py-3">
            <div className="tf-organization">
              <span className="tf-organization-name">Vicentin</span>
              <span className="tf-organization-sites">Ricardone · San Lorenzo</span>
            </div>
            <TruckPlateRegistryLauncher />
          </section>}

          <div className="min-h-0 flex-1">
            {isHomePrototype ? <Outlet /> : <HistoricalWorkspace><Outlet /></HistoricalWorkspace>}
          </div>
        </div>
      </main>

      {isHomePrototype ? null : <NvaiBubble site="ricardone" />}
    </div>
  )
}

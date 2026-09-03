import { NavLink, Outlet } from 'react-router-dom'
import { TruckPlateRegistryLauncher } from '../features/real-truckflow/components/TruckPlateRegistryLauncher'
import { PRODUCT_SECTIONS, type NavLeaf } from './sectors'

function SidebarLink({ to, label }: NavLeaf) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded-lg px-3 py-2 text-sm font-medium transition ${
          isActive
            ? 'bg-violet-100 text-violet-950 shadow-sm'
            : 'text-violet-200/90 hover:bg-violet-800/40 hover:text-violet-50'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

function SidebarSection({ title, items }: { title: string; items: NavLeaf[] }) {
  return (
    <div className="mb-4">
      <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-violet-400/80">
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

export function AppShell() {
  return (
    <div className="min-h-screen bg-surface-50">
      <main className="flex min-h-[calc(100vh-24px)] items-stretch gap-3 pt-3 pr-3 pb-3 pl-0">
        <aside className="h-[calc(100vh-24px)] w-[248px] shrink-0 overflow-y-auto border-r border-violet-900 bg-[#1a1136] p-3 text-violet-100">
          <div className="mb-5 flex flex-col items-center gap-2">
            <img
              src="/logo_sinfondo.png"
              alt="Truckflow"
              className="h-12 w-auto max-w-[200px] object-contain"
            />
            <span className="text-lg font-bold tracking-tight text-violet-100">Truckflow</span>
          </div>

          {PRODUCT_SECTIONS.map((s) => (
            <SidebarSection key={s.title} title={s.title} items={s.items} />
          ))}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 self-stretch overflow-auto">
          <section className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <img src="/logo.png" alt="Logo empresa" className="h-14 max-w-[260px] object-contain" />
            <TruckPlateRegistryLauncher />
          </section>

          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}

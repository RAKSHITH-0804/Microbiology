import { useCallback, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LogOut, Menu, Microscope, Settings, X } from 'lucide-react';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { useAuth } from '@/context/AuthContext';
import { useIdleTimeout } from '@/lib/useIdleTimeout';
import { ROLE_LABELS } from '@/types/auth';
import { canSeeNavItem, NAV_ITEMS } from './navigation';

const navLinkClass = (active: boolean) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
    active ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
  }`;

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const items = NAV_ITEMS.filter((item) => canSeeNavItem(user, item));

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleIdleTimeout = useCallback(async () => {
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true, state: { from: { pathname } } });
      toast.info('You were signed out due to inactivity.', { description: 'Sign in again to continue where you left off.' });
    }
  }, [logout, navigate, pathname]);

  useIdleTimeout(!!user, handleIdleTimeout);

  return (
    <div className="flex h-screen w-screen overflow-hidden print:block print:h-auto print:w-auto print:overflow-visible">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden print:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-shrink-0 flex-col bg-brand-950 print:hidden text-slate-200 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <Link
            to="/dashboard"
            onClick={() => setSidebarOpen(false)}
            className="flex cursor-pointer items-center gap-3 rounded-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-label="Go to dashboard"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
              <Microscope className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">JJMMC Microbiology</p>
              <p className="text-xs text-slate-400">Department of Microbiology</p>
            </div>
          </Link>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map(({ label, to, icon: Icon, end, alsoActiveFor }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navLinkClass(isActive || !!alsoActiveFor?.some((p) => pathname.startsWith(p)))}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          <NavLink to="/settings" onClick={() => setSidebarOpen(false)} className={({ isActive }) => navLinkClass(isActive)}>
            <Settings className="h-4 w-4" />
            Settings
          </NavLink>
        </div>

        <div className="border-t border-white/10 p-4 text-xs text-slate-400">
          J.J.M. Medical College, Davangere
        </div>
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 print:hidden">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5 text-slate-600" />
          </button>
          <h1 className="hidden text-sm font-medium text-slate-500 sm:block">Department of Microbiology</h1>

          <div className="ml-auto flex items-center gap-4">
            {user && <NotificationBell />}
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-slate-800">{user?.name}</p>
              <p className="text-xs text-slate-500">{user && (user.designation ?? ROLE_LABELS[user.role])}</p>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="relative flex-1 scroll-pb-24 overflow-y-auto p-6 print:overflow-visible print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

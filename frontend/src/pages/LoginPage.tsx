import { FormEvent, useState, type CSSProperties, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  FlaskConical,
  Grid3x3,
  Loader2,
  Lock,
  Microscope,
  ShieldCheck,
  User,
  type LucideIcon,
} from 'lucide-react';
import { ForgotPasswordModal } from '@/components/auth/ForgotPasswordModal';
import { FloatingMicrobes, PetriDishLens } from '@/components/login/MicrobiologyVisuals';
import { useAuth } from '@/context/AuthContext';
import { CHANGE_PASSWORD_PATH } from '@/layout/navigation';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

const FEATURES: { title: string; description: string; icon: LucideIcon; offset: string; delay: string }[] = [
  {
    title: 'Sample Requisitions',
    description: 'Bacteriology, Mycology & Parasitology intake',
    icon: FlaskConical,
    offset: '',
    delay: '0s',
  },
  {
    title: 'Culture & Sensitivity',
    description: 'Organisms, antibiotics & S / R / MS matrices',
    icon: Grid3x3,
    offset: 'ml-6',
    delay: '1.5s',
  },
  {
    title: 'Doctor Verifications',
    description: 'One-click review & signature lock',
    icon: ShieldCheck,
    offset: 'ml-2',
    delay: '3s',
  },
];

function FloatingInput({
  id,
  label,
  icon: Icon,
  type = 'text',
  value,
  onChange,
  autoComplete,
  autoFocus,
  trailing,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
        placeholder=" "
        className={cn(
          'peer h-14 w-full rounded-xl border border-slate-300 bg-white pb-1.5 pl-11 pt-5 text-sm text-slate-900 shadow-sm outline-none transition',
          'focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10',
          trailing ? 'pr-12' : 'pr-4',
        )}
      />
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors peer-focus:text-blue-600" />
      <label
        htmlFor={id}
        className={cn(
          'pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 text-sm text-slate-500 transition-all duration-200',
          'peer-focus:top-[15px] peer-focus:text-xs peer-focus:font-medium peer-focus:text-blue-700',
          'peer-[:not(:placeholder-shown)]:top-[15px] peer-[:not(:placeholder-shown)]:text-xs peer-autofill:top-[15px] peer-autofill:text-xs',
        )}
      >
        {label}
      </label>
      {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
    </div>
  );
}

function ShowcasePanel() {
  return (
    <section
      aria-hidden="true"
      className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-8 text-white sm:p-10 lg:flex lg:p-12"
    >
      {/* Ambient radial light pulses */}
      <div className="pointer-events-none absolute -left-20 top-6 h-64 w-64 rounded-full bg-blue-600/30 blur-3xl motion-safe:animate-glow" />
      <div
        className="pointer-events-none absolute -right-16 bottom-16 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl motion-safe:animate-glow"
        style={{ animationDelay: '4s' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:22px_22px]" />

      <PetriDishLens className="pointer-events-none absolute -right-10 top-1/2 h-[260px] w-[260px] -translate-y-[58%] drop-shadow-[0_0_30px_rgba(59,130,246,0.35)]" />
      <FloatingMicrobes />

      <div className="relative z-10 flex flex-col gap-3.5">
        {FEATURES.map(({ title, description, icon: Icon, offset, delay }) => (
          <div
            key={title}
            className={cn('max-w-[260px] motion-safe:animate-float', offset)}
            style={{ animationDelay: delay } as CSSProperties}
          >
            <div className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] py-3 pl-3 pr-5 shadow-xl shadow-black/30 backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:border-blue-400/40 hover:bg-white/[0.12]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/40 transition group-hover:scale-105">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-slate-300">{description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="relative z-10">
        <h2 className="text-2xl font-semibold leading-tight text-white xl:text-3xl">Department of Microbiology</h2>
        <p className="mt-2.5 max-w-sm text-sm text-slate-300">
          J.J.M. Medical College, Davangere — Digitized requisition entry, culture finding templates, and antibiograms.
        </p>
      </div>
    </section>
  );
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  if (user) return <Navigate to={user.mustChangePassword ? CHANGE_PASSWORD_PATH : from} replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const signedIn = await login(username.trim(), password);
      navigate(signedIn.mustChangePassword ? CHANGE_PASSWORD_PATH : from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="grid min-h-[580px] w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-2xl motion-safe:animate-fade-up lg:grid-cols-2">
        <section className="flex flex-col justify-between gap-10 bg-white p-8 sm:p-10 lg:p-12">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-md shadow-blue-600/30">
                <Microscope className="h-5 w-5" />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-slate-900">JJMMC Microbiology</p>
                <p className="text-xs text-slate-500">Department of Microbiology</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Staff Portal
            </span>
          </div>

          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
            <p className="mt-2 text-sm text-slate-500">Sign in with your department credentials to continue.</p>

            <form
              onSubmit={handleSubmit}
              className="mt-8 space-y-4 motion-safe:animate-fade-up"
              style={{ animationDelay: '120ms' }}
            >
              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <FloatingInput
                id="username"
                label="Username"
                icon={User}
                value={username}
                onChange={setUsername}
                autoComplete="username"
                autoFocus
              />
              <FloatingInput
                id="password"
                label="Password"
                icon={Lock}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
              <div className="-mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="rounded text-sm font-medium text-blue-600 transition hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                >
                  Forgot Password?
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className={cn(
                  'group relative mt-2 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition duration-200',
                  'hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/30 active:translate-y-0',
                  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/30',
                  'disabled:pointer-events-none disabled:opacity-70',
                )}
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? 'Signing in...' : 'Sign In'}
                {!submitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-500">Department of Microbiology — J.J.M. Medical College, Davangere</p>
        </section>

        <ShowcasePanel />
      </div>
      <ForgotPasswordModal open={forgotOpen} onOpenChange={setForgotOpen} initialUsername={username} />
    </div>
  );
}

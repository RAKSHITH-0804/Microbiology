import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Bell, CheckCheck, ChevronRight, Info, KeyRound, Loader2, RefreshCw, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_CHANGED,
} from '@/features/notifications/api';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AppNotification, NotificationType } from '@/types/notification';

const POLL_MS = 60_000;

const CATEGORY: Record<NotificationType, { label: string; icon: LucideIcon; tone: string }> = {
  PASSWORD_RESET: { label: 'Password Reset', icon: KeyRound, tone: 'bg-amber-50 text-amber-600 ring-amber-200' },
  SYSTEM_UPDATE: { label: 'System Update', icon: RefreshCw, tone: 'bg-blue-50 text-blue-600 ring-blue-200' },
  ALERT: { label: 'Alert', icon: AlertTriangle, tone: 'bg-red-50 text-red-600 ring-red-200' },
  GENERAL: { label: 'General', icon: Info, tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

/** Header notification centre: unread counter, categorised list, per-item links and "Mark All as Read". */
export function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await fetchNotifications());
    } catch {
      // Advisory only; the next poll retries.
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const unread = items.filter((n) => !n.isRead).length;

  const toggle = () => {
    if (!open) refresh();
    setOpen((o) => !o);
  };

  const openItem = async (n: AppNotification) => {
    if (!n.isRead) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      markNotificationRead(n.id).catch(() => refresh());
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setItems((list) => list.map((x) => ({ ...x, isRead: true })));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not mark notifications as read'));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `Notifications: ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50',
          open && 'bg-slate-50',
        )}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-[22rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center gap-2 border-b bg-slate-50 px-4 py-2.5">
            <Bell className="h-4 w-4 text-slate-500" />
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            {unread > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{unread} new</span>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-7 px-2 text-xs"
              onClick={markAll}
              disabled={unread === 0 || markingAll}
            >
              {markingAll ? <Loader2 className="animate-spin" /> : <CheckCheck />} Mark All as Read
            </Button>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto">
              {items.map((n) => {
                const category = CATEGORY[n.type] ?? CATEGORY.GENERAL;
                const Icon = category.icon;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn(
                        'flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50',
                        !n.isRead && 'bg-blue-50/40',
                      )}
                    >
                      <span
                        className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset', category.tone)}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cn('truncate text-sm text-slate-900', !n.isRead && 'font-semibold')}>{n.title}</span>
                          {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-600">{n.message}</span>
                        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                          <span className="font-medium uppercase tracking-wide">{category.label}</span>
                          <span aria-hidden>&middot;</span>
                          <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                          </time>
                        </span>
                      </span>
                      {n.link && <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

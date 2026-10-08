import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import type { UserRole } from '@/types/auth';

interface Props {
  roles?: UserRole[];
}

function AccessDenied() {
  useEffect(() => {
    toast.error('You do not have access to that page', { id: 'access-denied' });
  }, []);
  return <Navigate to="/dashboard" replace />;
}

export default function ProtectedRoute({ roles }: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <AccessDenied />;

  return <Outlet />;
}

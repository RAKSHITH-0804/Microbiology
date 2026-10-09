import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { SettingsProvider } from '@/context/SettingsContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Toaster } from '@/components/ui/sonner';
import AppLayout from '@/layout/AppLayout';
import { NAV_ITEMS, REQUISITION_ENTRY_DENIED, REQUISITION_ENTRY_ROLES } from '@/layout/navigation';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import ComingSoonPage from '@/pages/ComingSoonPage';
import RequisitionFormPage from '@/pages/RequisitionFormPage';
import PendingQueuePage from '@/pages/PendingQueuePage';
import GeneralReportPage from '@/pages/GeneralReportPage';
import AntibiogramReportPage from '@/pages/AntibiogramReportPage';
import VerificationPage from '@/pages/VerificationPage';
import UsersPage from '@/pages/UsersPage';
import MasterDataPage from '@/pages/MasterDataPage';
import AuditLogsPage from '@/pages/AuditLogsPage';
import SettingsPage from '@/pages/SettingsPage';
import RequisitionsPage from '@/pages/RequisitionsPage';
import ReportsPage from '@/pages/ReportsPage';
import PaymentsPage from '@/pages/PaymentsPage';

const PAGES: Record<string, ReactElement> = {
  '/requisition/new': <RequisitionFormPage />,
  '/worklist': <PendingQueuePage />,
  '/requisitions': <RequisitionsPage />,
  '/reports': <ReportsPage />,
  '/payments': <PaymentsPage />,
  '/verification': <VerificationPage />,
  '/master-data': <MasterDataPage />,
  '/users': <UsersPage />,
  '/audit-logs': <AuditLogsPage />,
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                {NAV_ITEMS.filter((item) => item.to !== '/').map((item) => (
                  <Route key={item.to} element={<ProtectedRoute roles={item.roles} deniedMessage={item.deniedMessage} />}>
                    <Route
                      path={item.to.slice(1)}
                      element={PAGES[item.to] ?? <ComingSoonPage title={item.label} />}
                    />
                  </Route>
                ))}
                <Route
                  element={<ProtectedRoute roles={REQUISITION_ENTRY_ROLES} deniedMessage={REQUISITION_ENTRY_DENIED} />}
                >
                  <Route path="requisition/edit/:id" element={<RequisitionFormPage />} />
                </Route>
                <Route path="requisitions/pending" element={<Navigate to="/worklist" replace />} />
                <Route path="reports/general/:requisitionId" element={<GeneralReportPage />} />
                <Route path="reports/antibiogram/:requisitionId" element={<AntibiogramReportPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ManageRunnersPage from "./pages/ManageRunnersPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import { tasksWorkspaceEnabled } from "./lib/config";
import { getToken } from "./lib/auth";
import AppShell from "./components/AppShell";

// The operational workspace includes map code, so load it only when a
// dispatcher asks for it instead of adding that cost to the initial dashboard.
const TasksPage = lazy(() => import("./pages/TasksPage"));

function RequireAuth({ children }: { children: JSX.Element }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tasks" element={tasksWorkspaceEnabled ? <Suspense fallback={<main className="p-6">Loading Tasks…</main>}><TasksPage /></Suspense> : <Navigate to="/dashboard" replace />} />
        <Route path="/runners" element={<ManageRunnersPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

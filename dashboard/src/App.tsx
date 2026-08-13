import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ManageRunnersPage from "./pages/ManageRunnersPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import ShiftsPage from "./pages/ShiftsPage";
import { getToken } from "./lib/auth";
import AppShell from "./components/AppShell";

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
        <Route path="/runners" element={<ManageRunnersPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/shifts" element={<ShiftsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

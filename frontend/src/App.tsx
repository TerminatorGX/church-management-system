import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import type { Role } from "./lib/types";

import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MembersPage } from "./pages/MembersPage";
import { MemberDetailPage } from "./pages/MemberDetailPage";
import { FamiliesPage } from "./pages/FamiliesPage";
import { DepartmentsPage } from "./pages/DepartmentsPage";
import { EventsPage } from "./pages/EventsPage";
import { AttendancePage } from "./pages/AttendancePage";
import { ContributionsPage } from "./pages/ContributionsPage";
import { FundsPage } from "./pages/FundsPage";
import { VolunteersPage } from "./pages/VolunteersPage";
import { AssistantPage } from "./pages/AssistantPage";
import { UsersPage } from "./pages/UsersPage";

const RequireAuth = ({ roles, children }: { roles?: Role[]; children: React.ReactNode }) => {
  const { user, loading, can } = useAuth();

  if (loading) return <Spinner label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !can(...roles)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="font-semibold text-amber-900">Not available for your role</h1>
        <p className="mt-1 text-sm text-amber-800">
          This page needs one of: {["ADMIN", ...roles].join(", ")}. Your role is {user.role}.
        </p>
      </div>
    );
  }
  return <>{children}</>;
};

export const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />

    <Route
      element={
        <RequireAuth>
          <Layout />
        </RequireAuth>
      }
    >
      <Route index element={<DashboardPage />} />
      <Route path="members" element={<MembersPage />} />
      <Route path="members/:id" element={<MemberDetailPage />} />
      <Route path="families" element={<FamiliesPage />} />
      <Route path="departments" element={<DepartmentsPage />} />
      <Route path="events" element={<EventsPage />} />
      <Route path="attendance" element={<AttendancePage />} />
      <Route path="volunteers" element={<VolunteersPage />} />
      <Route path="assistant" element={<AssistantPage />} />

      <Route
        path="contributions"
        element={
          <RequireAuth roles={["FINANCE"]}>
            <ContributionsPage />
          </RequireAuth>
        }
      />
      <Route
        path="funds"
        element={
          <RequireAuth roles={["FINANCE"]}>
            <FundsPage />
          </RequireAuth>
        }
      />
      <Route
        path="users"
        element={
          <RequireAuth roles={[]}>
            <UsersPage />
          </RequireAuth>
        }
      />
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "./ui";
import type { Role } from "../lib/types";

export const ProtectedRoute = ({ roles }: { roles?: Role[] }) => {
  const { user, loading, can } = useAuth();

  if (loading) return <Spinner label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !can(...roles)) return <Navigate to="/" replace />;

  return <Outlet />;
};

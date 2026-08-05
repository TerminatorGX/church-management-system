import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../lib/types";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Empty means every signed-in role may see it (ADMIN always can). */
  roles: Role[];
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: "▦", roles: [] }],
  },
  {
    section: "People",
    items: [
      { to: "/members", label: "Members", icon: "◉", roles: [] },
      { to: "/families", label: "Families", icon: "⌂", roles: [] },
      { to: "/departments", label: "Departments", icon: "❖", roles: [] },
    ],
  },
  {
    section: "Activity",
    items: [
      { to: "/events", label: "Events", icon: "▤", roles: [] },
      { to: "/attendance", label: "Attendance", icon: "✓", roles: [] },
      { to: "/volunteers", label: "Volunteers", icon: "✦", roles: [] },
    ],
  },
  {
    section: "Finance",
    items: [
      { to: "/contributions", label: "Contributions", icon: "◈", roles: ["FINANCE"] },
      { to: "/funds", label: "Funds", icon: "◇", roles: ["FINANCE"] },
    ],
  },
  {
    section: "Tools",
    items: [
      { to: "/assistant", label: "AI Assistant", icon: "✧", roles: [] },
      { to: "/users", label: "User accounts", icon: "⚙", roles: [] },
    ],
  },
];

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  FINANCE: "Finance",
  DEPT_HEAD: "Department head",
  VIEWER: "Viewer",
};

export const Layout = () => {
  const { user, signOut, can } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleSections = NAV.map((section) => ({
    ...section,
    // "User accounts" is admin-only and isn't expressible via the roles list.
    items: section.items.filter(
      (item) => (item.to !== "/users" || user?.role === "ADMIN") && (item.roles.length === 0 || can(...item.roles)),
    ),
  })).filter((section) => section.items.length > 0);

  const handleSignOut = () => {
    signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            C
          </span>
          <span className="font-semibold text-slate-900">Church MS</span>
        </div>

        <nav className="p-3">
          {visibleSections.map((section) => (
            <div key={section.section} className="mb-4">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {section.section}
              </p>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      isActive
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`
                  }
                >
                  <span aria-hidden className="w-4 text-center opacity-70">
                    {item.icon}
                  </span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Toggle navigation"
          >
            ☰
          </button>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">{user ? ROLE_LABEL[user.role] : ""}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

import { useEffect, useState } from "react";
import { Routes, Route, NavLink, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Trophy,
  Megaphone,
  LineChart,
  UserCircle,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Dashboard from "@/pages/Dashboard";
import BestXI from "@/pages/BestXI";
import History from "@/pages/History";
import PlayerDetail from "@/pages/PlayerDetail";
import Gurus from "@/pages/Gurus";
import MyTeam from "@/pages/MyTeam";
import Players from "@/pages/Players";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/best-xi", label: "Best XI", icon: Trophy },
  { to: "/my-team", label: "My Team", icon: UserCircle },
  { to: "/players", label: "Players", icon: Users },
  { to: "/gurus", label: "Gurus", icon: Megaphone },
  { to: "/history", label: "Accuracy", icon: LineChart },
];

export default function App() {
  return (
    <div className="min-h-screen bg-ink-50">
      <Header />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/best-xi" element={<BestXI />} />
          <Route path="/my-team" element={<MyTeam />} />
          <Route path="/players" element={<Players />} />
          <Route path="/player/:id" element={<PlayerDetail />} />
          <Route path="/gurus" element={<Gurus />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </div>
      <footer className="py-10 px-4 text-center text-xs text-ink-500">
        Predictions are probabilistic, not guarantees. Built with LightGBM on 3
        seasons of FPL data plus top-10 guru sentiment.
      </footer>
    </div>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Auto-collapse the inline mobile menu when route changes.
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-pitch-hero bg-pitch-600 grid place-items-center text-white font-bold shadow-card">
            F
          </div>
          <div className="leading-tight min-w-0">
            <div className="font-semibold tracking-tight truncate">FPL Oracle</div>
            <div className="text-[11px] text-ink-500 truncate">
              Data-driven picks · updated every gameweek
            </div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn("nav-link flex items-center gap-2", isActive && "nav-link-active")
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-100 active:scale-95 transition"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav className="md:hidden border-t border-ink-200 bg-white px-2 py-2 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl text-base font-medium",
                  isActive ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-100"
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}

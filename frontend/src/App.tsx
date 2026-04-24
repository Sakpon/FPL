import { Routes, Route, NavLink, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Trophy,
  Megaphone,
  LineChart,
  UserCircle,
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
      <footer className="py-10 text-center text-xs text-ink-500">
        Predictions are probabilistic, not guarantees. Built with LightGBM on 3
        seasons of FPL data plus top-10 guru sentiment.
      </footer>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-pitch-hero bg-pitch-600 grid place-items-center text-white font-bold shadow-card">
            F
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">FPL Oracle</div>
            <div className="text-[11px] text-ink-500">
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
        <div className="md:hidden">
          <select
            className="nav-link border border-ink-200"
            onChange={(e) => {
              if (e.target.value) window.location.assign(e.target.value);
            }}
          >
            {NAV.map((n) => (
              <option key={n.to} value={n.to}>
                {n.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}

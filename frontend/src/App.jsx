import { NavLink, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Employees from './pages/Employees.jsx';
import GapAnalysis from './pages/GapAnalysis.jsx';
import Recommendations from './pages/Recommendations.jsx';
import SkillGraph from './pages/SkillGraph.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'M3 12l9-8 9 8M5 10v10h14V10', end: true },
  { to: '/employees', label: 'Employee Details', icon: 'M16 11a4 4 0 10-8 0M4 21a8 8 0 0116 0' },
  { to: '/gap-analysis', label: 'Gap Analysis', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { to: '/skills', label: 'Skill Graph', icon: 'M6 6a2 2 0 100 .1M18 6a2 2 0 100 .1M12 18a2 2 0 100 .1M7.5 7.5l3.5 9M16.5 7.5l-3.5 9M8 6h8' },
];

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">IQ</span>
        <div>
          <div className="brand-name">WorkforceIQ</div>
          <div className="brand-tag">Skill gap intelligence</div>
        </div>
      </div>
      <nav>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={n.icon} />
            </svg>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-foot">HR Workspace</div>
    </aside>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <div className="shell">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/gap-analysis" element={<GapAnalysis />} />
            <Route path="/recommendations/:skillId" element={<Recommendations />} />
            <Route path="/skills" element={<SkillGraph />} />
            <Route path="/skills/:skillId" element={<SkillGraph />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}

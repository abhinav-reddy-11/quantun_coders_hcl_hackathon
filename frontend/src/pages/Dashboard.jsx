import { Link, useNavigate } from 'react-router-dom';
import { ShortageChart, SkillWorkforceChart } from '../charts/charts.jsx';
import { Card, EmptyState, ErrorState, Loading, PageHeader, SkillTag, StatTile } from '../components/ui.jsx';
import { api } from '../services/api.js';
import { useAsync } from '../services/useAsync.js';

export default function Dashboard() {
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(async () => {
    const [insights, employees, gap, skills] = await Promise.all([api.insights(), api.employees(), api.gapAnalysis(), api.skills()]);
    return { insights, employees, gap, skills };
  });

  if (loading && !data) return <Loading label="Loading workforce data…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { insights, employees, gap, skills } = data;
  const shortages = gap.results.filter((r) => r.remaining_shortage > 0).slice(0, 6);
  const graph = skills.map((s) => ({
    id: s.id, name: s.name, know: s.existing_count, learning: s.learning_count, gap: s.remaining_shortage ?? 0,
  }));

  return (
    <>
      <PageHeader eyebrow="Overview" title="Workforce dashboard"
        subtitle={insights.forecast_quarter ? `Demand forecast for ${insights.forecast_quarter}` : 'No gap analysis generated yet'} />

      <Card title="Company total insights" className="span-full">
        <div className="stat-grid">
          <StatTile label="Total employees" value={insights.total_employees} />
          <StatTile label="Skills tracked" value={insights.total_skills} />
          <StatTile label="Identified skill shortage" value={insights.forecast_quarter ? insights.total_shortage : '—'}
            hint={insights.forecast_quarter ? `people across ${insights.skills_with_shortage} skills` : 'Run gap analysis'} tone="gap" />
          <StatTile label="Employees learning new skills" value={insights.employees_learning}
            hint={`${insights.active_learning_plans} active learning plans`} tone="learning" />
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Employee details" subtitle={`${employees.length} employees`}
          action={<Link className="btn btn-ghost" to="/employees">View all</Link>}>
          <ul className="emp-preview">
            {employees.slice(0, 6).map((e) => (
              <li key={e.id}>
                <span className="avatar">{e.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
                <div>
                  <div className="emp-name">{e.name}</div>
                  <div className="tags">{e.skills.slice(0, 3).map((s) => <SkillTag key={s.id} name={s.name} muted />)}
                    {e.skills.length > 3 && <span className="more">+{e.skills.length - 3}</span>}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Gap analysis" subtitle="Largest remaining shortages"
          action={<Link className="btn btn-ghost" to="/gap-analysis">Open</Link>}>
          {gap.results.length === 0 ? (
            <EmptyState title="No forecast yet">
              <Link className="btn btn-primary" to="/gap-analysis">Generate gap analysis</Link>
            </EmptyState>
          ) : shortages.length === 0 ? (
            <EmptyState title="No remaining shortages">All forecast demand is covered.</EmptyState>
          ) : (
            <ShortageChart data={shortages} onSelect={(id) => nav(`/skills/${id}`)} />
          )}
        </Card>
      </div>

      <Card title="Skill graph" subtitle="Workforce coverage per skill — click a skill to see who knows it, who is learning it and the remaining gap"
        action={<Link className="btn btn-ghost" to="/skills">Explore</Link>}>
        <div className="skill-chips">
          {skills.map((s) => (
            <Link key={s.id} to={`/skills/${s.id}`} className={`chip ${s.remaining_shortage > 0 ? 'chip-gap' : ''}`}>
              {s.name}
              {s.remaining_shortage > 0 && <span className="chip-count">{s.remaining_shortage}</span>}
            </Link>
          ))}
        </div>
        <SkillWorkforceChart data={graph} onSelect={(id) => nav(`/skills/${id}`)} />
      </Card>
    </>
  );
}

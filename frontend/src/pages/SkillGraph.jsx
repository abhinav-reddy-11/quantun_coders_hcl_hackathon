import { Link, useNavigate, useParams } from 'react-router-dom';
import { DemandTrendChart, SERIES, SkillBreakdownChart, SkillWorkforceChart } from '../charts/charts.jsx';
import { Card, EmptyState, ErrorState, Loading, PageHeader, SkillTag } from '../components/ui.jsx';
import { api } from '../services/api.js';
import { useAsync } from '../services/useAsync.js';

export default function SkillGraph() {
  const { skillId } = useParams();
  const nav = useNavigate();
  const skills = useAsync(api.skills);

  return (
    <>
      <PageHeader eyebrow="Skill graph" title={skillId ? 'Skill workforce detail' : 'Skill graph'}
        subtitle="Who already knows each skill, who is learning it, and the gap that remains." />
      <div className="skillgraph-layout">
        <Card title="Skills" className="skill-list-card">
          {skills.loading && !skills.data ? <Loading /> : skills.error ? <ErrorState error={skills.error} onRetry={skills.reload} /> : (
            <ul className="skill-list">
              {skills.data.map((s) => (
                <li key={s.id}>
                  <Link to={`/skills/${s.id}`} className={`skill-item ${String(s.id) === skillId ? 'active' : ''}`}>
                    <span>{s.name}</span>
                    <span className="mini-stack" aria-label={`${s.existing_count} know, ${s.learning_count} learning, ${s.remaining_shortage ?? 0} gap`}>
                      <i style={{ flex: s.existing_count, background: SERIES.know.color }} />
                      <i style={{ flex: s.learning_count, background: SERIES.learning.color }} />
                      <i style={{ flex: s.remaining_shortage ?? 0, background: SERIES.gap.color }} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="skill-detail">
          {skillId ? <SkillDetail key={skillId} skillId={skillId} /> : skills.data && (
            <Card title="All skills" subtitle="Click a bar or a skill name to open its detail">
              <SkillWorkforceChart onSelect={(id) => nav(`/skills/${id}`)}
                data={skills.data.map((s) => ({ id: s.id, name: s.name, know: s.existing_count, learning: s.learning_count, gap: s.remaining_shortage ?? 0 }))} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function SkillDetail({ skillId }) {
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.workforceDetails(skillId), [skillId]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { skill, counts, forecast, employees_who_know: know, employees_learning: learning, related_skills: related, demand_history: history } = data;

  return (
    <>
      <Card
        title={skill.name}
        subtitle={`${skill.category}${forecast ? ` · forecast ${forecast.quarter}: ${forecast.required_people} required` : ' · no forecast yet'}`}
        action={forecast?.remaining_shortage > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={() => nav(`/recommendations/${skill.id}`)}>Make Our Employees Learn This Skill</button>
        )}
      >
        <div className="grid-2 inner">
          <div>
            <div className="section-label">Workforce coverage</div>
            <SkillBreakdownChart know={counts.already_know} learning={counts.currently_learning} gap={counts.remaining_gap} />
          </div>
          <div>
            <div className="section-label">Demand trend</div>
            <DemandTrendChart history={history} forecast={forecast} />
          </div>
        </div>
        {related.length > 0 && (
          <div className="related-row">
            <span className="muted small">Related skills:</span>
            {related.map((r) => <SkillTag key={r.id} id={r.id} name={r.name} muted />)}
          </div>
        )}
      </Card>

      <div className="grid-3">
        <Card title="Already know this skill" subtitle={`${know.length} employees`} className="accent-know">
          {know.length === 0 ? <EmptyState title="Nobody yet" /> : (
            <ul className="people">{know.map((e) => (
              <li key={e.id}><span>{e.name}<em>{e.department}</em></span><span className="level">{'●'.repeat(e.proficiency)}<span className="faint">{'●'.repeat(5 - e.proficiency)}</span></span></li>
            ))}</ul>
          )}
        </Card>
        <Card title="Currently learning" subtitle={`${learning.length} employees`} className="accent-learning">
          {learning.length === 0 ? <EmptyState title="No accepted learners">Accept candidates from the recommendations screen.</EmptyState> : (
            <ul className="people">{learning.map((e) => (
              <li key={e.id}><span>{e.name}<em>{e.department}</em></span><span className="muted small">since {new Date(e.since).toLocaleDateString()}</span></li>
            ))}</ul>
          )}
        </Card>
        <Card title="Remaining skill gap" subtitle={forecast ? forecast.quarter : 'Run gap analysis'} className="accent-gap">
          <div className="big-number">{counts.remaining_gap ?? '—'}</div>
          <p className="muted small">
            {forecast
              ? `${forecast.required_people} required − ${counts.already_know} skilled − ${counts.currently_learning} learning (floored at 0)`
              : 'No forecast has been generated for this skill.'}
          </p>
        </Card>
      </div>
    </>
  );
}

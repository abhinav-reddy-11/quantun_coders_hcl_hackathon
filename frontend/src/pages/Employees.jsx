import { useMemo, useState } from 'react';
import { Card, EmptyState, ErrorState, Loading, PageHeader, SkillTag } from '../components/ui.jsx';
import { api } from '../services/api.js';
import { useAsync } from '../services/useAsync.js';

export default function Employees() {
  const { data, error, loading, reload } = useAsync(api.employees);
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!data || !term) return data || [];
    return data.filter((e) => e.name.toLowerCase().includes(term) || e.skills.some((s) => s.name.toLowerCase().includes(term)));
  }, [data, q]);

  return (
    <>
      <PageHeader eyebrow="People" title="Employee details" subtitle="Current skills from the HR database" />
      <Card
        title={data ? `${rows.length} of ${data.length} employees` : 'Employees'}
        action={<input className="search" placeholder="Search name or skill…" value={q} onChange={(e) => setQ(e.target.value)} />}
      >
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : rows.length === 0 ? (
          <EmptyState title="No employees match your search" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Employee name</th><th>Current skills</th></tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">
                      <div className="emp-name">{e.name}</div>
                      <div className="muted small">{e.department}</div>
                    </td>
                    <td>
                      <div className="tags">
                        {e.skills.map((s) => <SkillTag key={s.id} id={s.id} name={s.name} />)}
                        {e.currently_learning.map((s) => (
                          <span key={`l${s.skill_id}`} className="tag tag-learning" title="Currently learning">
                            {s.skill_name} · learning
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

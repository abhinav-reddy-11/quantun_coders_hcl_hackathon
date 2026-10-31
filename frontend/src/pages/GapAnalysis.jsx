import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, EmptyState, ErrorState, Loading, PageHeader, useToast } from '../components/ui.jsx';
import { api } from '../services/api.js';
import { useAsync } from '../services/useAsync.js';

export default function GapAnalysis() {
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(api.gapAnalysis);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState(null);

  async function generate() {
    setBusy(true);
    try {
      const res = await api.generateGapAnalysis();
      setData({ forecast_quarter: res.forecast_quarter, results: res.results });
      setModel(res.model);
      toast(`Gap analysis generated for ${res.forecast_quarter}`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const results = data?.results || [];
  const r2 = model?.r2 ?? results[0]?.model_r2;

  return (
    <>
      <PageHeader
        eyebrow="Machine learning"
        title="Skill gap analysis"
        subtitle="Linear Regression forecasts next-quarter demand per skill from historical quarterly data, then compares it with the current workforce."
        actions={
          <button className="btn btn-primary" onClick={generate} disabled={busy}>
            {busy ? <><span className="spinner spinner-light" /> Generating…</> : 'Generate Gap Analysis'}
          </button>
        }
      />

      {data?.forecast_quarter && (
        <div className="meta-strip">
          <span><b>Forecast quarter</b> {data.forecast_quarter}</span>
          {r2 != null && <span><b>Model R²</b> {Number(r2).toFixed(3)}</span>}
          {model && <span><b>Training rows</b> {model.training_rows}</span>}
          <span className="formula">Remaining = max(0, Forecast − Existing skilled − Currently learning)</span>
        </div>
      )}

      <Card>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : results.length === 0 ? (
          <EmptyState title="No gap analysis yet">Click <b>Generate Gap Analysis</b> to run the forecast model.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th className="num">Required number of people</th>
                  <th className="num">Existing</th>
                  <th className="num">Learning</th>
                  <th className="num">Remaining people required</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.forecast_id}>
                    <td>
                      <Link to={`/skills/${r.skill_id}`} className="link-strong">{r.skill_name}</Link>
                      <div className="muted small">{r.category}</div>
                    </td>
                    <td className="num">{r.required_people}</td>
                    <td className="num">{r.existing_people}</td>
                    <td className="num">{r.learning_people}</td>
                    <td className="num">
                      <span className={`gap-pill ${r.remaining_shortage > 0 ? 'has-gap' : 'no-gap'}`}>{r.remaining_shortage}</span>
                    </td>
                    <td className="right">
                      {r.remaining_shortage > 0 ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => nav(`/recommendations/${r.skill_id}`)}>
                          Make Our Employees Learn This Skill
                        </button>
                      ) : (
                        <span className="muted small">Covered</span>
                      )}
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

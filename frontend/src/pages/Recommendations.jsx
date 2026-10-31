import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, EmptyState, ErrorState, Loading, PageHeader, SkillTag, StatTile, StatusBadge, useToast } from '../components/ui.jsx';
import { api } from '../services/api.js';

export default function Recommendations() {
  const { skillId } = useParams();
  const toast = useToast();
  const [state, setState] = useState({ data: null, meta: null, error: null, loading: true, generating: false });
  const [pending, setPending] = useState({}); // recommendationId -> 'accept' | 'reject'

  const generate = useCallback(async () => {
    setState((s) => ({ ...s, generating: true, error: null }));
    try {
      const res = await api.generateRecommendations(skillId);
      setState({ data: res, meta: res.meta, error: null, loading: false, generating: false });
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false, generating: false }));
    }
  }, [skillId]);

  useEffect(() => {
    // Show stored recommendations; run the RAG pipeline if there are no pending ones yet.
    (async () => {
      try {
        const existing = await api.recommendations(skillId);
        if (existing.recommendations.some((r) => r.status === 'recommended')) {
          setState({ data: existing, meta: null, error: null, loading: false, generating: false });
        } else {
          setState((s) => ({ ...s, data: existing, loading: false }));
          await generate();
        }
      } catch (error) {
        setState((s) => ({ ...s, error, loading: false }));
      }
    })();
  }, [skillId, generate]);

  async function decide(rec, action) {
    setPending((p) => ({ ...p, [rec.recommendation_id]: action }));
    try {
      const res = action === 'accept' ? await api.accept(rec.recommendation_id) : await api.reject(rec.recommendation_id);
      setState((s) => ({
        ...s,
        data: {
          ...s.data,
          skill: {
            ...s.data.skill,
            remaining_shortage: res.forecast?.remaining_shortage ?? s.data.skill.remaining_shortage,
            learning_count: s.data.skill.learning_count + (action === 'accept' ? 1 : 0),
          },
          recommendations: s.data.recommendations.map((r) =>
            r.recommendation_id === rec.recommendation_id ? { ...r, status: res.recommendation.status, decided_at: res.recommendation.decided_at } : r),
        },
      }));
      toast(action === 'accept'
        ? `${rec.employee_name} is now learning ${rec.recommended_skill}. Remaining gap: ${res.forecast?.remaining_shortage ?? '—'}`
        : `Rejected ${rec.employee_name}`, action === 'accept' ? 'success' : 'info');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setPending((p) => ({ ...p, [rec.recommendation_id]: undefined }));
    }
  }

  const { data, meta, error, loading, generating } = state;
  if (loading) return <Loading label="Loading recommendations…" />;
  if (error && !data) return <ErrorState error={error} onRetry={generate} />;

  const skill = data.skill;
  const recs = data.recommendations;
  const open = recs.filter((r) => r.status === 'recommended');
  const decided = recs.filter((r) => r.status !== 'recommended');
  const fallbackUsed = recs.some((r) => r.reason_source === 'fallback' && r.status === 'recommended');

  return (
    <>
      <PageHeader
        eyebrow={<><Link to="/gap-analysis">Gap analysis</Link> / Candidate recommendations</>}
        title={`Upskill for ${skill.name}`}
        subtitle="Existing employees ranked by related-skill match and semantic similarity (pgvector), with grounded explanations."
        actions={
          <button className="btn btn-secondary" onClick={generate} disabled={generating}>
            {generating ? <><span className="spinner" /> Running RAG…</> : 'Refresh recommendations'}
          </button>
        }
      />

      <div className="stat-grid compact">
        <StatTile label={`Forecast required (${skill.quarter ?? '—'})`} value={skill.required_people} />
        <StatTile label="Already skilled" value={skill.existing_count} tone="know" />
        <StatTile label="Currently learning" value={skill.learning_count} tone="learning" />
        <StatTile label="Remaining gap" value={skill.remaining_shortage} tone="gap" />
      </div>

      {data.related_skills?.length > 0 && (
        <div className="related-row">
          <span className="muted small">Related skills used for matching:</span>
          {data.related_skills.map((r) => <SkillTag key={r.id} id={r.id} name={`${r.name} · ${Number(r.strength).toFixed(2)}`} muted />)}
        </div>
      )}

      {(meta || fallbackUsed) && (
        <div className={`notice ${fallbackUsed ? 'notice-warn' : 'notice-ok'}`}>
          {fallbackUsed
            ? <>LLM explanations unavailable{meta?.llm_error ? ` (${meta.llm_error})` : ''} — reasons marked <b>Fallback</b> are rule-based, built from the same database records.</>
            : <>Explanations generated by <b>{meta?.llm_model}</b> from retrieved database records.</>}
          {meta?.embedding_mode && <> Embeddings: <b>{meta.embedding_mode === 'hashing' ? 'TEST-ONLY hashing mode' : meta.embedding_model}</b>.</>}
        </div>
      )}
      {error && <ErrorState error={error} onRetry={generate} />}

      <Card title="Recommended candidates" subtitle={`${open.length} pending decision${open.length === 1 ? '' : 's'}`}>
        {generating && open.length === 0 ? <Loading label="Retrieving candidates and generating explanations…" /> : open.length === 0 ? (
          <EmptyState title="No pending candidates">Everyone suitable has been decided, or no employee holds a related skill.</EmptyState>
        ) : (
          <CandidateTable rows={open} pending={pending} onDecide={decide} />
        )}
      </Card>

      {decided.length > 0 && (
        <Card title="Decisions" subtitle="Accepted employees are counted as currently learning this skill">
          <CandidateTable rows={decided} />
        </Card>
      )}
    </>
  );
}

function CandidateTable({ rows, pending = {}, onDecide }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Employee name</th><th>Existing skills</th><th>Recommended skill</th><th>Reason</th>
            <th className="num">Relevance</th><th className="right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.recommendation_id}>
              <td className="nowrap">
                <div className="emp-name">{r.employee_name}</div>
                <div className="muted small">{r.department}</div>
              </td>
              <td><div className="tags">{r.existing_skills.map((s) => <SkillTag key={s} name={s} muted />)}</div></td>
              <td><span className="tag tag-target">{r.recommended_skill}</span></td>
              <td className="reason">
                {r.reason_source === 'fallback' && <span className="badge badge-fallback">Fallback</span>}
                {r.reason?.replace(/^\[Fallback – LLM unavailable\]\s*/, '')}
              </td>
              <td className="num">
                <div className="score">
                  <div className="score-bar"><span style={{ width: `${Math.round((r.relevance_score ?? 0) * 100)}%` }} /></div>
                  {r.relevance_score != null ? r.relevance_score.toFixed(2) : '—'}
                </div>
              </td>
              <td className="right nowrap">
                {r.status === 'recommended' && onDecide ? (
                  <div className="actions">
                    <button className="btn btn-accept btn-sm" disabled={!!pending[r.recommendation_id]} onClick={() => onDecide(r, 'accept')}>
                      {pending[r.recommendation_id] === 'accept' ? '…' : 'Accept'}
                    </button>
                    <button className="btn btn-reject btn-sm" disabled={!!pending[r.recommendation_id]} onClick={() => onDecide(r, 'reject')}>
                      {pending[r.recommendation_id] === 'reject' ? '…' : 'Reject'}
                    </button>
                  </div>
                ) : <StatusBadge status={r.status} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { createContext, useCallback, useContext, useState } from 'react';
import { Link } from 'react-router-dom';

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint, tone }) {
  return (
    <div className={`stat-tile ${tone ? `tone-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="state state-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <strong>Something went wrong.</strong>
      <span>{error?.message || String(error)}</span>
      {onRetry && (
        <button className="btn btn-ghost" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="state state-empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function SkillTag({ name, id, muted }) {
  const cls = `tag ${muted ? 'tag-muted' : ''}`;
  return id ? (
    <Link className={cls} to={`/skills/${id}`}>
      {name}
    </Link>
  ) : (
    <span className={cls}>{name}</span>
  );
}

export function StatusBadge({ status }) {
  const label = { recommended: 'Pending', accepted: 'Accepted · Learning', rejected: 'Rejected' }[status] || status;
  return <span className={`badge badge-${status}`}>{label}</span>;
}

// ---- toasts ----
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

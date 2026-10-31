// All data comes from the Express API. The frontend never talks to the Python services directly.
const BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api').replace(/\/$/, '');

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(`Cannot reach the WorkforceIQ API at ${BASE}. Is the backend running?`);
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload?.error?.message || `Request failed (${res.status})`);
    err.code = payload?.error?.code;
    err.details = payload?.error?.details;
    throw err;
  }
  return payload.data;
}

export const api = {
  employees: () => request('/employees'),
  skills: () => request('/skills'),
  skill: (id) => request(`/skills/${id}`),
  workforceDetails: (id) => request(`/skills/${id}/workforce-details`),
  gapAnalysis: () => request('/gap-analysis'),
  generateGapAnalysis: () => request('/gap-analysis/generate', { method: 'POST', body: {} }),
  recommendations: (skillId) => request(`/recommendations/${skillId}`),
  generateRecommendations: (skillId, limit = 6) => request(`/recommendations/${skillId}`, { method: 'POST', body: { limit } }),
  accept: (id) => request(`/recommendations/${id}/accept`, { method: 'POST' }),
  reject: (id) => request(`/recommendations/${id}/reject`, { method: 'POST' }),
  insights: () => request('/insights'),
  health: () => request('/health'),
};

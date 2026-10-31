import { env } from '../config/env.js';
import { ApiError } from '../middleware/errors.js';

async function post(baseUrl, path, body, serviceName) {
  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(env.serviceTimeoutMs),
    });
  } catch (err) {
    throw new ApiError(502, `${serviceName}_UNAVAILABLE`, `${serviceName} service is unreachable at ${baseUrl}`, err.message);
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(502, `${serviceName}_ERROR`, `${serviceName} service returned ${res.status}`, payload?.detail ?? payload);
  }
  return payload;
}

/** POST /ml/forecast  ->  { forecast_quarter, model, forecasts: [{ skill_id, predicted_required_people, ... }] } */
export const requestForecast = (history, forecastQuarter) =>
  post(env.mlServiceUrl, '/ml/forecast', { history, forecast_quarter: forecastQuarter ?? null }, 'ML');

/** POST /rag/recommend -> { target_skill, recommendations: [...], meta } */
export const requestRecommendations = (payload) => post(env.ragServiceUrl, '/rag/recommend', payload, 'RAG');

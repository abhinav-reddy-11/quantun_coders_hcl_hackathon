import { withTransaction } from '../config/db.js';
import { ApiError } from '../middleware/errors.js';
import * as Q from '../models/queries.js';
import { requestForecast, requestRecommendations } from './pythonClient.js';

/**
 * Gap analysis:
 *   1. load historical demand from PostgreSQL
 *   2. ML service trains Linear Regression and forecasts next quarter
 *   3. compare with existing skilled employees (employee_skills) and accepted learners (learning_plans)
 *      remaining = max(0, forecast - existing - currently_learning)
 *   4. upsert into forecasts in one transaction
 */
export async function generateGapAnalysis(forecastQuarter) {
  const history = await Q.demandHistory();
  if (history.length === 0) throw new ApiError(409, 'NO_HISTORY', 'No historical demand data found. Run the seed script.');

  const ml = await requestForecast(history, forecastQuarter);
  if (!Array.isArray(ml?.forecasts) || ml.forecasts.length === 0) {
    throw new ApiError(502, 'ML_ERROR', 'ML service returned no forecasts');
  }

  await withTransaction(async (c) => {
    const counts = await Q.workforceCounts(c);
    for (const f of ml.forecasts) {
      const cnt = counts.get(f.skill_id);
      if (!cnt) throw new ApiError(502, 'ML_ERROR', `ML returned unknown skill_id ${f.skill_id}`);
      const required = f.predicted_required_people;
      await Q.upsertForecast(c, {
        skillId: f.skill_id,
        quarter: ml.forecast_quarter,
        required,
        existing: cnt.existing,
        remaining: Math.max(0, required - cnt.existing - cnt.learning),
        r2: ml.model?.r2 ?? null,
      });
    }
  });

  return { forecast_quarter: ml.forecast_quarter, model: ml.model, results: await Q.latestGapAnalysis() };
}

/**
 * RAG recommendations for one skill. Express gathers the grounded context from PostgreSQL
 * (forecast, candidate employees with their skills, related skills) and the RAG service retrieves/ranks
 * with pgvector + explains with the LLM. Pending recommendations are persisted as learning_plans.
 */
export async function generateRecommendations(skillId, limit) {
  const skill = await Q.getSkill(skillId);
  if (!skill) throw new ApiError(404, 'SKILL_NOT_FOUND', `Skill ${skillId} not found`);
  const forecast = await Q.latestForecastForSkill(skillId);
  if (!forecast) throw new ApiError(409, 'NO_GAP_ANALYSIS', 'Generate the gap analysis before requesting recommendations');

  const [candidates, related] = await Promise.all([Q.candidateEmployees(skillId), Q.relatedSkills(skillId)]);

  const rag = await requestRecommendations({
    target_skill: { id: skill.id, name: skill.name },
    forecast: {
      forecast_id: forecast.id,
      quarter: forecast.quarter,
      required_people: forecast.required_people,
      existing_people: forecast.existing_people,
      remaining_shortage: forecast.remaining_shortage,
    },
    employees: candidates.map((e) => ({ id: e.id, name: e.name, department: e.department, skills: e.skills })),
    related_skills: related,
    limit,
  });

  // Grounding check on the Express side as well: only keep employees from the candidate pool.
  const pool = new Set(candidates.map((e) => e.id));
  const recs = (rag.recommendations || []).filter((r) => pool.has(r.employee_id) && r.target_skill_id === skillId);

  await withTransaction((c) => Q.savePendingRecommendations(c, skillId, forecast.id, recs));

  const scoreDetail = new Map(recs.map((r) => [r.employee_id, r]));
  const rows = (await Q.recommendationsForSkill(skillId)).map((r) => {
    const d = scoreDetail.get(r.employee_id);
    return d && r.status === 'recommended'
      ? { ...r, skill_match_score: d.skill_match_score, semantic_score: d.semantic_score, matched_skills: d.matched_skills }
      : r;
  });

  return { skill: await Q.getSkill(skillId), related_skills: related, recommendations: rows, meta: rag.meta };
}

/** Accept: mark as currently learning and reduce the remaining shortage by one, atomically. */
export async function acceptRecommendation(id) {
  return withTransaction(async (c) => {
    const plan = await Q.lockLearningPlan(c, id);
    if (!plan) throw new ApiError(404, 'RECOMMENDATION_NOT_FOUND', `Recommendation ${id} not found`);
    if (plan.status !== 'recommended') {
      throw new ApiError(409, 'ALREADY_DECIDED', `Recommendation ${id} is already ${plan.status}`);
    }
    if (await Q.employeeHasSkill(c, plan.employee_id, plan.skill_id)) {
      throw new ApiError(409, 'ALREADY_SKILLED', 'Employee already has this skill');
    }
    const forecast = await Q.latestForecastForSkill(plan.skill_id, c, true);
    const updatedPlan = await Q.setLearningPlanStatus(c, id, 'accepted');
    const updatedForecast = forecast ? await Q.decrementShortage(c, forecast.id) : null;
    return { recommendation: updatedPlan, forecast: updatedForecast };
  });
}

/** Reject: record the decision; shortage is unchanged. */
export async function rejectRecommendation(id) {
  return withTransaction(async (c) => {
    const plan = await Q.lockLearningPlan(c, id);
    if (!plan) throw new ApiError(404, 'RECOMMENDATION_NOT_FOUND', `Recommendation ${id} not found`);
    if (plan.status !== 'recommended') {
      throw new ApiError(409, 'ALREADY_DECIDED', `Recommendation ${id} is already ${plan.status}`);
    }
    const forecast = await Q.latestForecastForSkill(plan.skill_id, c);
    return {
      recommendation: await Q.setLearningPlanStatus(c, id, 'rejected'),
      forecast: forecast && {
        forecast_id: forecast.id, skill_id: forecast.skill_id, quarter: forecast.quarter,
        required_people: forecast.required_people, existing_people: forecast.existing_people,
        remaining_shortage: forecast.remaining_shortage,
      },
    };
  });
}

export async function skillWorkforceDetails(skillId) {
  const skill = await Q.getSkill(skillId);
  if (!skill) throw new ApiError(404, 'SKILL_NOT_FOUND', `Skill ${skillId} not found`);
  const [knownBy, learning, related, history] = await Promise.all([
    Q.employeesWithSkill(skillId),
    Q.employeesLearningSkill(skillId),
    Q.relatedSkills(skillId),
    Q.demandHistory(skillId),
  ]);
  return {
    skill: { id: skill.id, name: skill.name, category: skill.category },
    forecast: skill.forecast_id
      ? { forecast_id: skill.forecast_id, quarter: skill.quarter, required_people: skill.required_people, remaining_shortage: skill.remaining_shortage }
      : null,
    counts: { already_know: knownBy.length, currently_learning: learning.length, remaining_gap: skill.remaining_shortage ?? null },
    employees_who_know: knownBy,
    employees_learning: learning,
    related_skills: related,
    demand_history: history.map((h) => ({ quarter: h.quarter, required_people: h.required_people })),
  };
}

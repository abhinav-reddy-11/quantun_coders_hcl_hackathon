// All SQL lives here. Every function accepts an optional client so it can run inside a transaction.
import { pool } from '../config/db.js';

const db = (c) => c || pool;

// Latest forecast quarter, ordered by year then quarter number (not by string).
const LATEST_QUARTER_SQL = `(SELECT quarter FROM forecasts
   ORDER BY split_part(quarter, ' ', 2)::int DESC, substr(quarter, 2, 1)::int DESC LIMIT 1)`;

const EMPLOYEE_SELECT = `
  SELECT e.id, e.name, e.department,
    COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.skill_name, 'proficiency', es.proficiency_level)
                              ORDER BY es.proficiency_level DESC, s.skill_name)
              FROM employee_skills es JOIN skills s ON s.id = es.skill_id WHERE es.employee_id = e.id), '[]') AS skills,
    COALESCE((SELECT json_agg(json_build_object('skill_id', s.id, 'skill_name', s.skill_name, 'since', lp.decided_at)
                              ORDER BY lp.decided_at)
              FROM learning_plans lp JOIN skills s ON s.id = lp.skill_id
              WHERE lp.employee_id = e.id AND lp.status = 'accepted'), '[]') AS currently_learning
  FROM employees e`;

// ---------- employees ----------
export async function listEmployees() {
  return (await pool.query(`${EMPLOYEE_SELECT} ORDER BY e.name`)).rows;
}

export async function getEmployee(id) {
  return (await pool.query(`${EMPLOYEE_SELECT} WHERE e.id = $1`, [id])).rows[0];
}

/** Candidate pool for a target skill: employees who don't have it and have no accepted/rejected decision for it. */
export async function candidateEmployees(skillId, c) {
  const { rows } = await db(c).query(
    `${EMPLOYEE_SELECT}
     WHERE NOT EXISTS (SELECT 1 FROM employee_skills es WHERE es.employee_id = e.id AND es.skill_id = $1)
       AND NOT EXISTS (SELECT 1 FROM learning_plans lp WHERE lp.employee_id = e.id AND lp.skill_id = $1
                         AND lp.status IN ('accepted', 'rejected'))
     ORDER BY e.id`,
    [skillId]
  );
  return rows;
}

// ---------- skills ----------
const SKILL_STATS_SELECT = `
  SELECT s.id, s.skill_name AS name, s.category,
    (SELECT COUNT(*)::int FROM employee_skills es WHERE es.skill_id = s.id) AS existing_count,
    (SELECT COUNT(*)::int FROM learning_plans lp WHERE lp.skill_id = s.id AND lp.status = 'accepted') AS learning_count,
    f.id AS forecast_id, f.quarter, f.required_people, f.remaining_shortage
  FROM skills s
  LEFT JOIN forecasts f ON f.skill_id = s.id AND f.quarter = ${LATEST_QUARTER_SQL}`;

export async function listSkills() {
  return (await pool.query(`${SKILL_STATS_SELECT} ORDER BY s.skill_name`)).rows;
}

export async function getSkill(id) {
  return (await pool.query(`${SKILL_STATS_SELECT} WHERE s.id = $1`, [id])).rows[0];
}

export async function relatedSkills(skillId, c) {
  const { rows } = await db(c).query(
    `SELECT rs.related_skill_id AS id, s.skill_name AS name, rs.strength::float AS strength
     FROM related_skills rs JOIN skills s ON s.id = rs.related_skill_id
     WHERE rs.skill_id = $1 ORDER BY rs.strength DESC`,
    [skillId]
  );
  return rows;
}

export async function employeesWithSkill(skillId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.name, e.department, es.proficiency_level AS proficiency
     FROM employee_skills es JOIN employees e ON e.id = es.employee_id
     WHERE es.skill_id = $1 ORDER BY es.proficiency_level DESC, e.name`,
    [skillId]
  );
  return rows;
}

export async function employeesLearningSkill(skillId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.name, e.department, lp.id AS learning_plan_id, lp.decided_at AS since
     FROM learning_plans lp JOIN employees e ON e.id = lp.employee_id
     WHERE lp.skill_id = $1 AND lp.status = 'accepted' ORDER BY lp.decided_at`,
    [skillId]
  );
  return rows;
}

export async function demandHistory(skillId) {
  const sql = `SELECT 'Q' || d.q || ' ' || d.year AS quarter, d.skill_id, s.skill_name, d.required_people
               FROM demand_history d JOIN skills s ON s.id = d.skill_id
               ${skillId ? 'WHERE d.skill_id = $1' : ''}
               ORDER BY d.skill_id, d.year, d.q`;
  return (await pool.query(sql, skillId ? [skillId] : [])).rows;
}

// ---------- forecasts / gap analysis ----------
export async function latestGapAnalysis() {
  const { rows } = await pool.query(
    `SELECT f.id AS forecast_id, f.skill_id, s.skill_name, s.category, f.quarter, f.required_people,
            f.existing_people, f.remaining_shortage, f.model_r2::float AS model_r2, f.updated_at,
            (SELECT COUNT(*)::int FROM learning_plans lp WHERE lp.skill_id = f.skill_id AND lp.status = 'accepted') AS learning_people
     FROM forecasts f JOIN skills s ON s.id = f.skill_id
     WHERE f.quarter = ${LATEST_QUARTER_SQL}
     ORDER BY f.remaining_shortage DESC, s.skill_name`
  );
  return rows;
}

export async function latestForecastForSkill(skillId, c, lock = false) {
  const { rows } = await db(c).query(
    `SELECT * FROM forecasts WHERE skill_id = $1
     ORDER BY split_part(quarter, ' ', 2)::int DESC, substr(quarter, 2, 1)::int DESC LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [skillId]
  );
  return rows[0];
}

export async function workforceCounts(c) {
  const { rows } = await db(c).query(
    `SELECT s.id AS skill_id,
       (SELECT COUNT(*)::int FROM employee_skills es WHERE es.skill_id = s.id) AS existing,
       (SELECT COUNT(*)::int FROM learning_plans lp WHERE lp.skill_id = s.id AND lp.status = 'accepted') AS learning
     FROM skills s`
  );
  return new Map(rows.map((r) => [r.skill_id, r]));
}

export async function upsertForecast(c, f) {
  const { rows } = await c.query(
    `INSERT INTO forecasts (skill_id, quarter, required_people, existing_people, remaining_shortage, model_r2)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (skill_id, quarter) DO UPDATE SET
       required_people = EXCLUDED.required_people, existing_people = EXCLUDED.existing_people,
       remaining_shortage = EXCLUDED.remaining_shortage, model_r2 = EXCLUDED.model_r2, updated_at = now()
     RETURNING id`,
    [f.skillId, f.quarter, f.required, f.existing, f.remaining, f.r2]
  );
  return rows[0].id;
}

export async function decrementShortage(c, forecastId) {
  const { rows } = await c.query(
    `UPDATE forecasts SET remaining_shortage = GREATEST(remaining_shortage - 1, 0), updated_at = now()
     WHERE id = $1 RETURNING id AS forecast_id, skill_id, quarter, required_people, existing_people, remaining_shortage`,
    [forecastId]
  );
  return rows[0];
}

// ---------- learning plans (recommendations) ----------
export async function recommendationsForSkill(skillId) {
  const { rows } = await pool.query(
    `SELECT lp.id AS recommendation_id, lp.employee_id, e.name AS employee_name, e.department,
            COALESCE((SELECT json_agg(s2.skill_name ORDER BY es.proficiency_level DESC, s2.skill_name)
                      FROM employee_skills es JOIN skills s2 ON s2.id = es.skill_id WHERE es.employee_id = e.id), '[]') AS existing_skills,
            lp.skill_id AS target_skill_id, s.skill_name AS recommended_skill, lp.reason, lp.reason_source,
            lp.relevance_score::float AS relevance_score, lp.status, lp.created_at, lp.decided_at
     FROM learning_plans lp JOIN employees e ON e.id = lp.employee_id JOIN skills s ON s.id = lp.skill_id
     WHERE lp.skill_id = $1
     ORDER BY CASE lp.status WHEN 'recommended' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END,
              lp.relevance_score DESC NULLS LAST`,
    [skillId]
  );
  return rows;
}

/** Replace the pending (status=recommended) set for a skill with fresh RAG output. */
export async function savePendingRecommendations(c, skillId, forecastId, recs) {
  const ids = recs.map((r) => r.employee_id);
  await c.query(
    `DELETE FROM learning_plans WHERE skill_id = $1 AND status = 'recommended' AND NOT (employee_id = ANY($2::int[]))`,
    [skillId, ids]
  );
  for (const r of recs) {
    await c.query(
      `INSERT INTO learning_plans (employee_id, skill_id, forecast_id, status, reason, reason_source, relevance_score)
       VALUES ($1, $2, $3, 'recommended', $4, $5, $6)
       ON CONFLICT (employee_id, skill_id) DO UPDATE SET
         forecast_id = EXCLUDED.forecast_id, reason = EXCLUDED.reason, reason_source = EXCLUDED.reason_source,
         relevance_score = EXCLUDED.relevance_score, created_at = now()
       WHERE learning_plans.status = 'recommended'`,
      [r.employee_id, skillId, forecastId, r.reason, r.reason_source, r.relevance_score]
    );
  }
}

export async function lockLearningPlan(c, id) {
  return (await c.query('SELECT * FROM learning_plans WHERE id = $1 FOR UPDATE', [id])).rows[0];
}

export async function setLearningPlanStatus(c, id, status) {
  const { rows } = await c.query(
    `UPDATE learning_plans SET status = $2, decided_at = now() WHERE id = $1
     RETURNING id AS recommendation_id, employee_id, skill_id, status, decided_at`,
    [id, status]
  );
  return rows[0];
}

export async function employeeHasSkill(c, employeeId, skillId) {
  const { rowCount } = await c.query('SELECT 1 FROM employee_skills WHERE employee_id = $1 AND skill_id = $2', [employeeId, skillId]);
  return rowCount > 0;
}

// ---------- insights ----------
export async function companyInsights() {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM employees) AS total_employees,
       (SELECT COUNT(*)::int FROM skills) AS total_skills,
       (SELECT COALESCE(SUM(remaining_shortage), 0)::int FROM forecasts WHERE quarter = ${LATEST_QUARTER_SQL}) AS total_shortage,
       (SELECT COUNT(*)::int FROM forecasts WHERE quarter = ${LATEST_QUARTER_SQL} AND remaining_shortage > 0) AS skills_with_shortage,
       (SELECT COUNT(DISTINCT employee_id)::int FROM learning_plans WHERE status = 'accepted') AS employees_learning,
       (SELECT COUNT(*)::int FROM learning_plans WHERE status = 'accepted') AS active_learning_plans,
       ${LATEST_QUARTER_SQL} AS forecast_quarter`
  );
  return rows[0];
}

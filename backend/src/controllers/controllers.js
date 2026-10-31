import { ApiError } from '../middleware/errors.js';
import { optionalIntInRange } from '../middleware/validate.js';
import * as Q from '../models/queries.js';
import * as WS from '../services/workforceService.js';

const QUARTER_RE = /^Q[1-4] \d{4}$/;

// ----- employees -----
export const listEmployees = async (req, res) => res.json({ data: await Q.listEmployees() });

export const getEmployee = async (req, res) => {
  const emp = await Q.getEmployee(req.params.id);
  if (!emp) throw new ApiError(404, 'EMPLOYEE_NOT_FOUND', `Employee ${req.params.id} not found`);
  res.json({ data: emp });
};

// ----- skills -----
export const listSkills = async (req, res) => res.json({ data: await Q.listSkills() });

export const getSkill = async (req, res) => {
  const skill = await Q.getSkill(req.params.id);
  if (!skill) throw new ApiError(404, 'SKILL_NOT_FOUND', `Skill ${req.params.id} not found`);
  res.json({ data: { ...skill, related_skills: await Q.relatedSkills(skill.id) } });
};

export const workforceDetails = async (req, res) => res.json({ data: await WS.skillWorkforceDetails(req.params.skillId) });

// ----- gap analysis -----
export const generateGapAnalysis = async (req, res) => {
  const fq = req.body?.forecast_quarter;
  if (fq !== undefined && fq !== null && !QUARTER_RE.test(fq)) {
    throw new ApiError(400, 'INVALID_BODY', "forecast_quarter must look like 'Q4 2026'");
  }
  res.status(201).json({ data: await WS.generateGapAnalysis(fq) });
};

export const getGapAnalysis = async (req, res) => {
  const results = await Q.latestGapAnalysis();
  res.json({ data: { forecast_quarter: results[0]?.quarter ?? null, results } });
};

// ----- recommendations -----
export const generateRecommendations = async (req, res) => {
  const limit = optionalIntInRange(req.body?.limit, 'limit', 1, 20, 6);
  res.json({ data: await WS.generateRecommendations(req.params.skillId, limit) });
};

export const listRecommendations = async (req, res) => {
  const skill = await Q.getSkill(req.params.skillId);
  if (!skill) throw new ApiError(404, 'SKILL_NOT_FOUND', `Skill ${req.params.skillId} not found`);
  res.json({ data: { skill, related_skills: await Q.relatedSkills(skill.id), recommendations: await Q.recommendationsForSkill(skill.id) } });
};

export const acceptRecommendation = async (req, res) => res.json({ data: await WS.acceptRecommendation(req.params.recommendationId) });
export const rejectRecommendation = async (req, res) => res.json({ data: await WS.rejectRecommendation(req.params.recommendationId) });

// ----- insights -----
export const insights = async (req, res) => res.json({ data: await Q.companyInsights() });

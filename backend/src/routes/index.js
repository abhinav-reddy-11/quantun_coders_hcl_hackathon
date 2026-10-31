import { Router } from 'express';
import * as C from '../controllers/controllers.js';
import { asyncHandler as h } from '../middleware/errors.js';
import { intParams } from '../middleware/validate.js';

const r = Router();

r.get('/employees', h(C.listEmployees));
r.get('/employees/:id', intParams('id'), h(C.getEmployee));

r.get('/skills', h(C.listSkills));
r.get('/skills/:skillId/workforce-details', intParams('skillId'), h(C.workforceDetails));
r.get('/skills/:id', intParams('id'), h(C.getSkill));

r.post('/gap-analysis/generate', h(C.generateGapAnalysis));
r.get('/gap-analysis', h(C.getGapAnalysis));

// accept/reject are registered before /:skillId so the paths never collide
r.post('/recommendations/:recommendationId/accept', intParams('recommendationId'), h(C.acceptRecommendation));
r.post('/recommendations/:recommendationId/reject', intParams('recommendationId'), h(C.rejectRecommendation));
r.post('/recommendations/:skillId', intParams('skillId'), h(C.generateRecommendations));
r.get('/recommendations/:skillId', intParams('skillId'), h(C.listRecommendations));

r.get('/insights', h(C.insights));

export default r;

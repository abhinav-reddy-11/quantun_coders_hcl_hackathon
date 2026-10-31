"""
Candidate scoring + grounded LLM explanations.

relevance = 0.55 * skill_match + 0.45 * semantic_similarity
  skill_match         = sum(strength * proficiency/5 over related skills the employee has) / sum(all strengths)
  semantic_similarity = pgvector cosine similarity between employee profile and the target-skill query

The LLM only writes explanations for candidates that retrieval already selected. Any employee ID the LLM
returns that is not in the retrieved set is discarded; missing explanations fall back to a rule-based
reason that is labelled reason_source="fallback".
"""
import json
import logging
import os
from typing import Dict, List, Tuple

import httpx

log = logging.getLogger("rag.recommender")
W_MATCH, W_SEM = 0.55, 0.45


def score_candidates(employees: List[Dict], related: List[Dict], semantic: Dict[int, float]) -> List[Dict]:
    total = sum(r["strength"] for r in related) or 1.0
    rel_by_id = {r["id"]: r for r in related}
    scored = []
    for emp in employees:
        matched = []
        match = 0.0
        for s in emp["skills"]:
            r = rel_by_id.get(s["id"])
            if r:
                contrib = r["strength"] * s.get("proficiency", 3) / 5
                match += contrib
                matched.append({"skill_id": s["id"], "skill_name": s["name"], "proficiency": s.get("proficiency", 3),
                                "strength": r["strength"], "source": r.get("source", "related_skills")})
        if not matched:
            continue  # grounded: must hold at least one skill related to the target
        skill_match = min(1.0, match / total)
        sem = max(0.0, min(1.0, semantic.get(emp["id"], 0.0)))
        scored.append({
            "employee": emp,
            "matched_skills": sorted(matched, key=lambda m: -m["strength"] * m["proficiency"]),
            "skill_match_score": round(skill_match, 4),
            "semantic_score": round(sem, 4),
            "relevance_score": round(W_MATCH * skill_match + W_SEM * sem, 4),
        })
    scored.sort(key=lambda c: -c["relevance_score"])
    return scored


def fallback_reason(c: Dict, target: str) -> str:
    top = ", ".join(f"{m['skill_name']} ({m['proficiency']}/5)" for m in c["matched_skills"][:3])
    n = len(c["matched_skills"])
    return (f"[Fallback – LLM unavailable] Holds {n} skill{'s' if n != 1 else ''} related to {target}: {top}. "
            f"Skill match {c['skill_match_score']:.2f}, semantic match {c['semantic_score']:.2f}.")


def _build_prompt(target: str, forecast: Dict, related: List[Dict], cands: List[Dict]) -> str:
    lines = []
    for c in cands:
        e = c["employee"]
        lines.append(json.dumps({
            "employee_id": e["id"], "name": e["name"], "department": e.get("department"),
            "existing_skills": [f"{s['name']} ({s.get('proficiency', 3)}/5)" for s in e["skills"]],
            "matched_related_skills": [m["skill_name"] for m in c["matched_skills"]],
            "relevance_score": c["relevance_score"],
        }))
    return f"""Target skill to develop: {target}
Forecast for {forecast.get('quarter')}: {forecast.get('required_people')} people required, {forecast.get('existing_people')} already have it, remaining shortage {forecast.get('remaining_shortage')}.
Skills related to {target} (with strength): {", ".join(f"{r['name']} ({r['strength']})" for r in related)}

Candidates retrieved from the HR database (one JSON object per line):
{chr(10).join(lines)}

For EVERY candidate above, write one short reason (max 30 words) why they are a good fit to learn {target}.
Rules:
- Use only the employees and skills listed above. Do not invent people, skills, certifications or experience.
- Mention their specific related skills.
Return JSON only: {{"recommendations": [{{"employee_id": <int>, "reason": "<text>"}}]}}"""


def llm_explain(target: str, forecast: Dict, related: List[Dict], cands: List[Dict]) -> Tuple[Dict[int, str], Dict]:
    """Returns ({employee_id: reason}, meta). Never raises."""
    key = os.getenv("LLM_API_KEY", "").strip()
    base = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
    model = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")
    meta = {"llm_used": False, "llm_model": model, "llm_error": None}
    if not key:
        meta["llm_error"] = "LLM_API_KEY not set"
        return {}, meta
    try:
        resp = httpx.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": model,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": "You are an HR upskilling analyst. You only use facts given to you and answer in JSON."},
                    {"role": "user", "content": _build_prompt(target, forecast, related, cands)},
                ],
            },
            timeout=float(os.getenv("LLM_TIMEOUT_SECONDS", "30")),
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        items = json.loads(content).get("recommendations", [])
    except Exception as e:  # network, auth, bad JSON ...
        log.warning("LLM call failed: %s", e)
        meta["llm_error"] = f"{type(e).__name__}: {str(e)[:200]}"
        return {}, meta

    allowed = {c["employee"]["id"] for c in cands}
    reasons = {}
    for it in items:
        try:
            eid = int(it.get("employee_id"))
        except (TypeError, ValueError):
            continue
        reason = str(it.get("reason", "")).strip()
        if eid in allowed and reason:  # drop invented employees
            reasons[eid] = reason[:400]
    dropped = len(items) - len(reasons)
    if dropped:
        log.info("Discarded %d LLM items not matching retrieved candidates", dropped)
    meta["llm_used"] = bool(reasons)
    return reasons, meta

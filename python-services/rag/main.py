"""
WorkforceIQ RAG service.
Run: uvicorn main:app --port 8002   (from python-services/rag)
"""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except ImportError:
    pass

from embeddings import Embedder
from recommender import fallback_reason, llm_explain, score_candidates
from retrieval import (connect, semantic_neighbour_skills, search_employees, sync_employee_embeddings,
                       sync_skill_embeddings)

logging.basicConfig(level=logging.INFO)
state = {}


@asynccontextmanager
async def lifespan(_app):
    state["embedder"] = Embedder()
    with connect() as conn:
        sync_skill_embeddings(conn, state["embedder"])
    yield


app = FastAPI(title="WorkforceIQ RAG Service", version="1.0.0", lifespan=lifespan)


class SkillRef(BaseModel):
    id: int
    name: str


class EmpSkill(BaseModel):
    id: int
    name: str
    proficiency: int = Field(3, ge=1, le=5)


class Employee(BaseModel):
    id: int
    name: str
    department: Optional[str] = None
    skills: List[EmpSkill]


class RelatedSkill(BaseModel):
    id: int
    name: str
    strength: float = Field(..., gt=0, le=1)


class Forecast(BaseModel):
    forecast_id: Optional[int] = None
    quarter: str
    required_people: int
    existing_people: int
    remaining_shortage: int


class RecommendRequest(BaseModel):
    target_skill: SkillRef
    forecast: Forecast
    employees: List[Employee] = Field(..., description="Candidate pool: employees who do not yet have the target skill")
    related_skills: List[RelatedSkill]
    limit: int = Field(6, ge=1, le=20)


@app.get("/health")
def health():
    e = state.get("embedder")
    return {"status": "ok", "service": "rag", "embedding_mode": e.mode if e else None,
            "embedding_model": e.model_name if e else None, "llm_configured": bool(os.getenv("LLM_API_KEY"))}


@app.post("/rag/recommend")
def recommend(req: RecommendRequest):
    emb: Embedder = state["embedder"]
    target = req.target_skill
    employees = [e.model_dump() for e in req.employees]
    related = [{**r.model_dump(), "source": "related_skills"} for r in req.related_skills]

    meta = {"embedding_mode": emb.mode, "embedding_model": emb.model_name, "candidates_considered": len(employees)}
    if not employees:
        return {"target_skill": target.model_dump(), "recommendations": [], "meta": {**meta, "llm_used": False}}

    try:
        with connect() as conn:
            sync_skill_embeddings(conn, emb)
            sync_employee_embeddings(conn, emb, employees)

            # Augment explicit related skills with semantically close skills (pgvector over skills.embedding).
            known = {r["id"] for r in related} | {target.id}
            for n in semantic_neighbour_skills(conn, target.id):
                if n["id"] not in known and n["similarity"] > 0.35:
                    related.append({"id": n["id"], "name": n["name"], "strength": round(0.3 * n["similarity"], 2),
                                    "source": "semantic"})

            query = (f"Employee ready to learn {target.name}. Useful prior skills: "
                     + ", ".join(r["name"] for r in related) + ".")
            qvec = emb.encode([query])[0]
            semantic = search_employees(conn, qvec, [e["id"] for e in employees], k=len(employees))
    except Exception as e:
        logging.exception("Retrieval failed")
        raise HTTPException(status_code=503, detail=f"Vector retrieval failed: {e}")

    top = score_candidates(employees, related, semantic)[: req.limit]
    reasons, llm_meta = llm_explain(target.name, req.forecast.model_dump(), related, top) if top else ({}, {"llm_used": False})

    recs = []
    for c in top:
        e = c["employee"]
        eid = e["id"]
        recs.append({
            "employee_id": eid,
            "employee_name": e["name"],
            "department": e.get("department"),
            "existing_skills": [s["name"] for s in e["skills"]],
            "target_skill": target.name,
            "target_skill_id": target.id,
            "reason": reasons.get(eid) or fallback_reason(c, target.name),
            "reason_source": "llm" if eid in reasons else "fallback",
            "relevance_score": c["relevance_score"],
            "skill_match_score": c["skill_match_score"],
            "semantic_score": c["semantic_score"],
            "matched_skills": c["matched_skills"],
        })
    return {"target_skill": target.model_dump(), "recommendations": recs, "meta": {**meta, **llm_meta}}

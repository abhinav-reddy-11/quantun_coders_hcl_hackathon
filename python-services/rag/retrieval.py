"""pgvector storage and retrieval for skill and employee embeddings."""
import os
from typing import Dict, List

import psycopg
from pgvector.psycopg import register_vector

from embeddings import Embedder


def connect() -> psycopg.Connection:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    conn = psycopg.connect(url, autocommit=True)
    register_vector(conn)
    return conn


def employee_profile_text(emp: Dict) -> str:
    skills = ", ".join(f"{s['name']} (proficiency {s.get('proficiency', 3)}/5)" for s in emp["skills"])
    return f"{emp.get('department', 'Employee')} professional. Skills: {skills or 'none recorded'}."


def sync_skill_embeddings(conn, embedder: Embedder) -> None:
    """Embed any skill that has no stored vector yet."""
    rows = conn.execute("SELECT id, skill_name, category FROM skills WHERE embedding IS NULL").fetchall()
    if not rows:
        return
    vecs = embedder.encode([f"Skill: {n}. Category: {c}." for _, n, c in rows])
    with conn.cursor() as cur:
        for (sid, _, _), v in zip(rows, vecs):
            cur.execute("UPDATE skills SET embedding = %s WHERE id = %s", (v, sid))


def sync_employee_embeddings(conn, embedder: Embedder, employees: List[Dict]) -> None:
    """(Re)embed employees whose profile text changed since the last stored embedding."""
    ids = [e["id"] for e in employees]
    stored = dict(conn.execute(
        "SELECT id, profile_text FROM employees WHERE id = ANY(%s) AND profile_embedding IS NOT NULL", (ids,)
    ).fetchall())
    stale = [(e["id"], employee_profile_text(e)) for e in employees]
    stale = [(i, t) for i, t in stale if stored.get(i) != t]
    if not stale:
        return
    vecs = embedder.encode([t for _, t in stale])
    with conn.cursor() as cur:
        for (eid, text), v in zip(stale, vecs):
            cur.execute("UPDATE employees SET profile_text = %s, profile_embedding = %s WHERE id = %s", (text, v, eid))


def semantic_neighbour_skills(conn, skill_id: int, k: int = 4) -> List[Dict]:
    """Nearest skills to the target skill by embedding (cosine), from the skills table."""
    rows = conn.execute(
        """SELECT s.id, s.skill_name, 1 - (s.embedding <=> t.embedding) AS sim
           FROM skills s, skills t
           WHERE t.id = %s AND s.id <> t.id AND s.embedding IS NOT NULL
           ORDER BY s.embedding <=> t.embedding LIMIT %s""",
        (skill_id, k),
    ).fetchall()
    return [{"id": r[0], "name": r[1], "similarity": float(r[2])} for r in rows]


def search_employees(conn, query_vec, candidate_ids: List[int], k: int) -> Dict[int, float]:
    """pgvector cosine search restricted to the candidate pool. Returns {employee_id: similarity}."""
    rows = conn.execute(
        """SELECT id, 1 - (profile_embedding <=> %s) AS sim
           FROM employees
           WHERE id = ANY(%s) AND profile_embedding IS NOT NULL
           ORDER BY profile_embedding <=> %s
           LIMIT %s""",
        (query_vec, candidate_ids, query_vec, k),
    ).fetchall()
    return {r[0]: float(r[1]) for r in rows}

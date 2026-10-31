# WorkforceIQ

**AI-powered skill gap analysis and workforce evolution.**
WorkforceIQ forecasts next quarter's demand for each skill, measures the shortage against the people you already have, and recommends which existing employees should upskill to close it — with a grounded reason for every recommendation and an HR approval step before anything changes.

> Built for the HCLTech Hackathon — Problem 4: *Skill Gap and Workforce Evolution Predictor* (Team Quantum Coders).

---

## Why

Companies usually discover a skill shortage after a project is already understaffed, and hiring for every new skill is slow and expensive. WorkforceIQ answers two questions early:

1. **How many people with skill X will we need next quarter, and how short are we?**
2. **Which of our own employees are closest to filling that gap, and why?**

The AI recommends; HR decides.

---

## Features

| Feature | What it does | Brief requirement |
|---|---|---|
| Skill inventory | Employee profiles with skills and proficiency (1–5) | FR-01 |
| Demand forecast | Per-skill headcount forecast for the next quarter (scikit-learn) | FR-04 |
| Gap analysis | `Remaining = max(0, Forecast − Existing − Currently learning)` per skill | FR-02 |
| Upskilling recommendations | RAG pipeline (embeddings + pgvector) ranks internal candidates for a short skill | FR-05, FR-06 |
| Explainable reasons | Every candidate shows matched skills, skill-match score, semantic score and an LLM-written reason grounded in DB records | FR-09 |
| Human review | HR accepts or rejects each recommendation; accept updates the shortage atomically | FR-10 |
| Skills knowledge graph | Related-skill edges with strengths, explorable per skill | Skills Knowledge Graph |
| LLM fallback | If the LLM is unavailable, rule-based reasons from the same records are shown and labelled **Fallback** | — |

Screens: **Dashboard · Employees · Gap Analysis · Candidate Recommendations · Skill Graph**.

---

## Architecture

```mermaid
flowchart LR
  UI["React + Vite<br/>:5173"] -->|REST /api| API["Express API<br/>:4000"]
  API -->|SQL, transactions| DB[("PostgreSQL + pgvector<br/>:5432")]
  API -->|POST /ml/forecast| ML["ML service · FastAPI<br/>:8001<br/>scikit-learn"]
  API -->|POST /rag/recommend| RAG["RAG service · FastAPI<br/>:8002<br/>Sentence Transformers"]
  RAG -->|vector search| DB
  RAG -->|explain ranked list| LLM["LLM<br/>Groq (OpenAI-compatible)"]
```

- **React talks only to Express.** Express validates input, owns every database write, and coordinates the two Python services.
- **The Python services are stateless helpers.** The ML service forecasts; the RAG service embeds, retrieves, ranks and asks the LLM to explain.
- **PostgreSQL is the single source of truth**, and pgvector keeps embeddings in the same database.

### Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Recharts |
| Backend | Node.js 18+, Express, `pg` (connection pool) |
| Database | PostgreSQL 14+ with pgvector |
| ML service | Python 3.10+, FastAPI, scikit-learn, NumPy |
| RAG service | Python, FastAPI, Sentence Transformers (`all-MiniLM-L6-v2`, 384-d), psycopg 3, httpx |
| LLM | Any OpenAI-compatible chat-completions endpoint (default: Groq) |

---

## Project structure

```
.
├── .env.example                  # single config file shared by all services
├── backend/                      # Express API (orchestrator, owns all DB writes)
│   └── src/
│       ├── app.js                # CORS, JSON, /api/health, routes, error handler
│       ├── server.js
│       ├── config/               # env.js, db.js (pool + withTransaction)
│       ├── routes/index.js
│       ├── controllers/          # thin request → service layer
│       ├── services/
│       │   ├── workforceService.js   # gap analysis, recommendations, accept/reject
│       │   └── pythonClient.js       # calls ML + RAG with timeout
│       ├── models/queries.js     # all SQL (parameterised)
│       └── middleware/           # validation, error shape
├── frontend/                     # React app
│   └── src/
│       ├── pages/                # Dashboard, Employees, GapAnalysis, Recommendations, SkillGraph
│       ├── charts/  components/  services/
│       └── App.jsx
├── python-services/
│   ├── ml/                       # forecasting service
│   │   ├── main.py  model.py  preprocessing.py
│   │   └── dataset/skill_demand_history.csv
│   └── rag/                      # recommendation service
│       ├── main.py  embeddings.py  retrieval.py  recommender.py
└── database/
    ├── schema.sql                # tables, constraints, indexes, pgvector
    ├── seed.sql                  # deterministic demo data
    └── generate_seed.py          # regenerates seed.sql + demand CSV (seed 42)
```

---

## Getting started

### 1. Prerequisites

- Node.js 18+
- Python 3.10+
- PostgreSQL 14+ **with pgvector**
- A Groq API key (optional — without it the app runs with Fallback reasons)

The easiest database is Docker:

```bash
docker run -d --name workforceiq-db \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=workforceiq \
  -p 5432:5432 pgvector/pgvector:pg16
```

### 2. Configure

```bash
cp .env.example .env
```

Edit at least these values in the repo-root `.env` (every service reads this one file):

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/workforceiq` | |
| `LLM_API_KEY` | `gsk_...` | Leave empty to run with Fallback reasons only |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` | Any OpenAI-compatible endpoint |
| `LLM_MODEL` | `openai/gpt-oss-120b` | Must be a model your key can access (see Troubleshooting) |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated list |
| `VITE_API_BASE_URL` | `http://localhost:4000/api` | Read by the frontend from the root `.env` |
| `EMBEDDING_MODE` | `sentence-transformers` | `hashing` = offline test mode only |

### 3. Create and seed the database

```bash
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/seed.sql
```

> ⚠️ `schema.sql` drops and recreates all tables. Re-running it wipes forecasts and HR decisions.

Seed data (synthetic, deterministic, seed 42): **16 skills, 40 employees, related-skill edges, 15 quarters of demand history (Q1 2023 – Q3 2026).**

### 4. Run (four terminals)

```bash
# Python environment (once)
cd python-services
python -m venv .venv
source .venv/bin/activate            # Windows Git Bash: source .venv/Scripts/activate
pip install -r ml/requirements.txt -r rag/requirements.txt
```

```bash
# Terminal 1 — ML service
cd python-services/ml && uvicorn main:app --port 8001

# Terminal 2 — RAG service (first start downloads all-MiniLM-L6-v2, ~90 MB)
cd python-services/rag && uvicorn main:app --port 8002

# Terminal 3 — Express API
cd backend && npm install && npm start

# Terminal 4 — React app
cd frontend && npm install && npm run dev
```

Open **http://localhost:5173**.
Check every component at once: **http://localhost:4000/api/health** → `{ backend, database, ml, rag }`.

---

## Demo walkthrough

1. **Dashboard** — totals for employees, skills, shortages and people currently learning.
2. **Gap Analysis → Generate Gap Analysis** — Express sends demand history to the ML service, receives the Q4 2026 forecast, compares it with current skills and learners, and upserts the results in one transaction.
3. **Make Our Employees Learn This Skill** on a short skill → **Candidate Recommendations** — ranked internal candidates, each with matched skills, scores and a reason.
4. **Accept** a candidate → the remaining shortage drops by one. **Reject** → the decision is recorded and the shortage is unchanged.
5. **Skill Graph / Employees** — the accepted person now appears under *Currently learning*; all values are read live from the database.

---

## How it works

### Demand forecasting (ML service)

- One `LinearRegression` over features `[t, one-hot(skill), one-hot(skill) · t]`, so every skill gets its own intercept and trend.
- The predicted headcount is rounded up.
- The response includes model diagnostics (`r2`, `mae`, training rows). These are **in-sample** metrics on synthetic data — useful as a sanity check, not as a measure of real-world accuracy.
- A linear model is a deliberate choice: 15 quarterly points per skill is too little data for LSTM/Prophet-class models, and a per-skill trend is easy to explain.

### Gap calculation (Express)

```
Remaining shortage = max(0, Forecast − Existing skilled − Currently learning)
```

Re-generating keeps already-accepted learners counted.

### Candidate recommendations (RAG service)

1. **Candidate pool** — employees who don't have the target skill and have no prior accept/reject for it (built by Express from Postgres).
2. **Retrieval** — employee profile embeddings in pgvector are searched by cosine distance (`<=>`) against a query built from the target skill and its related skills. Skill embeddings add semantically close skills to the explicit related-skill edges.
3. **Scoring**

   ```
   score       = 0.55 · skill_match + 0.45 · semantic_similarity
   skill_match = Σ (edge_strength × proficiency / 5)   over related skills the employee holds
   ```

   Candidates holding none of the related skills are excluded.
4. **Explanation** — the LLM receives only the already-ranked candidates and their records, and returns a reason per candidate.

### Grounding and safety

- The LLM **never ranks or selects** — it only explains a list that was already computed.
- Any employee ID the LLM returns that wasn't in the candidate set is discarded, **in the RAG service and again in Express**.
- If the LLM call fails or no key is set, reasons are generated by rules from the same records and labelled **Fallback** in the UI. Fallback text is never presented as LLM output.
- No sensitive attributes (age, gender, religion, etc.) are stored or used; recommendations depend only on skills, proficiency and skill relationships.
- Hiring and upskilling decisions stay with HR.

### Data consistency

- `UNIQUE (employee_id, skill_id)` on `learning_plans` stops an employee being counted twice for a skill.
- Accept and reject run in a single transaction and lock the row with `SELECT … FOR UPDATE`; a second click on an already-decided recommendation returns **409**.
- Forecasts are upserted with `ON CONFLICT (skill_id, quarter)`.
- All SQL is parameterised; route IDs are validated as positive integers.

---

## Data model

| Table | Purpose |
|---|---|
| `employees` | Name, department, profile text, `profile_embedding vector(384)` |
| `skills` | Name, category, `embedding vector(384)` |
| `employee_skills` | Employee ↔ skill with proficiency (1–5) |
| `related_skills` | Skill ↔ skill edges with strength (the knowledge graph) |
| `demand_history` | Required headcount per skill per quarter |
| `forecasts` | Forecast, existing, learning and remaining shortage per skill per quarter |
| `learning_plans` | Recommendations and HR decisions (`recommended` / `accepted` / `rejected`) |

---

## API reference

Base URL: `http://localhost:4000/api`
Success → `{ "data": ... }` · Error → `{ "error": { "code", "message", "details?" } }` with `400 / 404 / 409 / 502`.

| Method & path | Body | Returns `data` |
|---|---|---|
| `GET /health` | – | `{ backend, database, ml, rag }` |
| `GET /insights` | – | `{ total_employees, total_skills, total_shortage, skills_with_shortage, employees_learning, active_learning_plans, forecast_quarter }` |
| `GET /employees` | – | `[{ id, name, department, skills:[{id,name,proficiency}], currently_learning:[{skill_id,skill_name,since}] }]` |
| `GET /employees/:id` | – | one employee (same shape) |
| `GET /skills` | – | `[{ id, name, category, existing_count, learning_count, forecast_id, quarter, required_people, remaining_shortage }]` |
| `GET /skills/:id` | – | skill + `related_skills:[{id,name,strength}]` |
| `GET /skills/:skillId/workforce-details` | – | `{ skill, forecast, counts, employees_who_know, employees_learning, related_skills, demand_history }` |
| `POST /gap-analysis/generate` | `{ "forecast_quarter"?: "Q4 2026" }` | `{ forecast_quarter, model:{ r2, mae, training_rows, ... }, results:[gap row] }` |
| `GET /gap-analysis` | – | `{ forecast_quarter, results:[{ forecast_id, skill_id, skill_name, required_people, existing_people, learning_people, remaining_shortage }] }` |
| `POST /recommendations/:skillId` | `{ "limit"?: 1–20 }` (default 6) | `{ skill, related_skills, recommendations:[{ recommendation_id, employee_id, employee_name, existing_skills, recommended_skill, reason, reason_source, relevance_score, status }], meta }` — 409 if no gap analysis yet |
| `GET /recommendations/:skillId` | – | stored recommendations and decisions (no RAG call) |
| `POST /recommendations/:id/accept` | – | `{ recommendation:{ status:"accepted" }, forecast:{ remaining_shortage } }` |
| `POST /recommendations/:id/reject` | – | `{ recommendation:{ status:"rejected" }, forecast }` |

### Internal Python contracts

**`POST :8001/ml/forecast`**
Request `{ history:[{ quarter, skill_id, skill_name, required_people }], forecast_quarter? }`
Response `{ forecast_quarter, model, forecasts:[{ skill_id, skill_name, forecast_quarter, predicted_required_people, trend_per_quarter, ... }] }`

**`POST :8002/rag/recommend`**
Request `{ target_skill:{id,name}, forecast:{...}, employees:[{ id, name, department, skills }], related_skills:[{ id, name, strength }], limit }`
Response `{ recommendations:[{ employee_id, employee_name, existing_skills, target_skill, reason, reason_source, relevance_score, skill_match_score, semantic_score, matched_skills }], meta:{ embedding_mode, embedding_model, llm_used, llm_model, llm_error } }`

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Banner: *LLM explanations unavailable … 404 Not Found* | The model ID isn't available to your key (older Llama IDs have been retired on Groq). Set `LLM_MODEL` to a current model, e.g. `openai/gpt-oss-120b`, and restart the RAG service. List models with `curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $LLM_API_KEY"`. |
| `extension "vector" is not available` | pgvector isn't installed for your Postgres. Use the `pgvector/pgvector:pg16` Docker image. |
| CORS error in the browser | Add the exact frontend origin to `CORS_ORIGIN` (no trailing slash) and restart Express. |
| `502 ML_UNAVAILABLE` / `RAG_UNAVAILABLE` | The Python service isn't running on 8001 / 8002, or timed out. Check `/api/health`. |
| `409 NO_GAP_ANALYSIS` | Click **Generate Gap Analysis** before opening recommendations. |
| First recommendation request is slow | The embedding model downloads once (~90 MB). Warm it up before a demo. |
| No internet for the model download | `EMBEDDING_MODE=hashing` — test-only; every response and the UI say so. |

---

## Limitations and roadmap

**Current limitations**
- Demand data is synthetic; forecast metrics are in-sample.
- No authentication (optional in the brief).
- No automated test suite yet.

**Next steps**
- Holdout backtest: train on earlier quarters, report MAE on the last 2–3 against a naive "same as last quarter" baseline.
- Market intelligence (FR-03): external technology-trend signals as forecast inputs.
- Workforce risk score (FR-07): demand vs supply and bench depth per skill.
- Career path planning (FR-08): multi-step role paths over the skills graph.
- JWT auth with HR / manager / employee roles (Express middleware, no service changes).
- Tests for the accept/reject transaction flow; rate limiting on LLM-backed endpoints.

---

## Team

**Quantum Coders** — HCLTech Hackathon 2026

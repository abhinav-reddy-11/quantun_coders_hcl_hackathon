-- WorkforceIQ schema (PostgreSQL 14+ with pgvector)
-- Run: psql "$DATABASE_URL" -f database/schema.sql

CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS learning_plans CASCADE;
DROP TABLE IF EXISTS forecasts CASCADE;
DROP TABLE IF EXISTS demand_history CASCADE;
DROP TABLE IF EXISTS related_skills CASCADE;
DROP TABLE IF EXISTS employee_skills CASCADE;
DROP TABLE IF EXISTS skills CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

-- Employees. profile_embedding is written by the RAG service (Sentence Transformers, 384 dims).
CREATE TABLE employees (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(120) NOT NULL,
  department        VARCHAR(80)  NOT NULL,
  profile_text      TEXT,
  profile_embedding vector(384)
);

-- Skills. embedding is written by the RAG service.
CREATE TABLE skills (
  id         SERIAL PRIMARY KEY,
  skill_name VARCHAR(80) NOT NULL UNIQUE,
  category   VARCHAR(60) NOT NULL,
  embedding  vector(384)
);

-- Existing skills of each employee (source of truth for "already knows").
CREATE TABLE employee_skills (
  id                SERIAL PRIMARY KEY,
  employee_id       INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  skill_id          INT NOT NULL REFERENCES skills(id)    ON DELETE CASCADE,
  proficiency_level SMALLINT NOT NULL DEFAULT 3 CHECK (proficiency_level BETWEEN 1 AND 5),
  UNIQUE (employee_id, skill_id)
);
CREATE INDEX idx_employee_skills_skill ON employee_skills(skill_id);

-- Directed "skill -> related skill" edges. strength in (0,1]: how much the related skill helps learn skill_id.
CREATE TABLE related_skills (
  id               SERIAL PRIMARY KEY,
  skill_id         INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  related_skill_id INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  strength         NUMERIC(3,2) NOT NULL DEFAULT 0.70 CHECK (strength > 0 AND strength <= 1),
  UNIQUE (skill_id, related_skill_id),
  CHECK (skill_id <> related_skill_id)
);
CREATE INDEX idx_related_skills_skill ON related_skills(skill_id);

-- Synthetic historical demand (the ML training data). Quarter stored as year + q for correct ordering.
CREATE TABLE demand_history (
  id               SERIAL PRIMARY KEY,
  skill_id         INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  year             SMALLINT NOT NULL,
  q                SMALLINT NOT NULL CHECK (q BETWEEN 1 AND 4),
  required_people  INT NOT NULL CHECK (required_people >= 0),
  UNIQUE (skill_id, year, q)
);

-- ML output joined with current workforce. One row per (skill, forecast quarter).
CREATE TABLE forecasts (
  id                 SERIAL PRIMARY KEY,
  skill_id           INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  quarter            VARCHAR(10) NOT NULL,          -- e.g. 'Q4 2026'
  required_people    INT NOT NULL CHECK (required_people >= 0),
  existing_people    INT NOT NULL CHECK (existing_people >= 0),
  remaining_shortage INT NOT NULL CHECK (remaining_shortage >= 0),
  model_r2           NUMERIC(6,4),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (skill_id, quarter)
);
CREATE INDEX idx_forecasts_quarter ON forecasts(quarter);

-- RAG recommendations and HR decisions. id doubles as the recommendationId in the API.
-- status: recommended -> accepted | rejected. accepted = "currently learning".
-- UNIQUE(employee_id, skill_id) guarantees an employee is never counted twice for one skill.
CREATE TABLE learning_plans (
  id              SERIAL PRIMARY KEY,
  employee_id     INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  skill_id        INT NOT NULL REFERENCES skills(id)    ON DELETE CASCADE,
  forecast_id     INT REFERENCES forecasts(id) ON DELETE SET NULL,
  status          VARCHAR(12) NOT NULL DEFAULT 'recommended'
                    CHECK (status IN ('recommended', 'accepted', 'rejected')),
  reason          TEXT,
  reason_source   VARCHAR(12) NOT NULL DEFAULT 'llm' CHECK (reason_source IN ('llm', 'fallback')),
  relevance_score NUMERIC(5,4),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at      TIMESTAMPTZ,
  UNIQUE (employee_id, skill_id)
);
CREATE INDEX idx_learning_plans_skill_status ON learning_plans(skill_id, status);

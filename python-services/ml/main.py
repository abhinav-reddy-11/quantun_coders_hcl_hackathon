"""
WorkforceIQ ML service.
Run: uvicorn main:app --port 8001   (from python-services/ml)
"""
import csv
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from model import train_and_forecast
from preprocessing import parse_quarter

app = FastAPI(title="WorkforceIQ ML Service", version="1.0.0")
DATASET = Path(__file__).parent / "dataset" / "skill_demand_history.csv"


class HistoryRow(BaseModel):
    quarter: str = Field(..., examples=["Q1 2025"])
    skill_id: int
    skill_name: str
    required_people: int = Field(..., ge=0)

    @field_validator("quarter")
    @classmethod
    def valid_quarter(cls, v):
        parse_quarter(v)
        return v


class ForecastRequest(BaseModel):
    history: List[HistoryRow] = Field(..., min_length=2)
    forecast_quarter: Optional[str] = None
    skills: Optional[List[int]] = Field(None, description="Restrict output to these skill IDs")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ml"}


@app.post("/ml/forecast")
def forecast(req: ForecastRequest):
    try:
        result = train_and_forecast([r.model_dump() for r in req.history], req.forecast_quarter)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if req.skills:
        wanted = set(req.skills)
        result["forecasts"] = [f for f in result["forecasts"] if f["skill_id"] in wanted]
    return result


@app.get("/ml/dataset")
def dataset_preview():
    """Returns the bundled CSV (for inspection only; Express sends history from PostgreSQL)."""
    if not DATASET.exists():
        raise HTTPException(404, "Dataset CSV not found. Run database/generate_seed.py.")
    with open(DATASET) as f:
        return {"rows": list(csv.DictReader(f))}

"""Scikit-learn Linear Regression demand forecaster."""
import math
from typing import Dict, List

import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score

from preprocessing import FeatureEncoder, index_to_label, quarter_index


def train_and_forecast(history: List[Dict], forecast_quarter: str | None) -> Dict:
    """
    history: [{quarter: 'Q1 2025', skill_id: 1, skill_name: 'Python', required_people: 20}, ...]
    Returns forecasts for every skill present in history for `forecast_quarter`
    (defaults to the quarter after the latest observation).
    """
    quarters = [h["quarter"] for h in history]
    skill_ids = [int(h["skill_id"]) for h in history]
    y = np.array([float(h["required_people"]) for h in history])
    names = {int(h["skill_id"]): h["skill_name"] for h in history}

    latest = max(quarter_index(q) for q in quarters)
    if forecast_quarter is None:
        forecast_quarter = index_to_label(latest + 1)
    elif quarter_index(forecast_quarter) <= latest:
        raise ValueError(f"Forecast quarter {forecast_quarter} must be after the latest observed quarter {index_to_label(latest)}.")

    enc = FeatureEncoder().fit(quarters, skill_ids)
    X = enc.transform(quarters, skill_ids)
    model = LinearRegression().fit(X, y)
    fitted = model.predict(X)

    k = len(enc.skill_ids)
    target_X = enc.transform([forecast_quarter] * k, enc.skill_ids)
    preds = model.predict(target_X)

    forecasts = []
    for i, sid in enumerate(enc.skill_ids):
        slope = model.coef_[0] + model.coef_[1 + k + i]  # per-skill quarterly trend
        last_obs = max(
            ((quarter_index(q), val) for q, s, val in zip(quarters, skill_ids, y) if s == sid)
        )[1]
        forecasts.append({
            "skill_id": sid,
            "skill_name": names[sid],
            "forecast_quarter": forecast_quarter,
            "predicted_required_people": max(0, int(math.ceil(preds[i] - 1e-9))),
            "raw_prediction": round(float(preds[i]), 3),
            "trend_per_quarter": round(float(slope), 3),
            "last_observed_required": int(last_obs),
        })

    return {
        "forecast_quarter": forecast_quarter,
        "model": {
            "type": "sklearn.linear_model.LinearRegression",
            "features": "t + one-hot(skill) + one-hot(skill)*t",
            "training_rows": len(history),
            "r2": round(float(r2_score(y, fitted)), 4),
            "mae": round(float(mean_absolute_error(y, fitted)), 3),
        },
        "forecasts": forecasts,
    }

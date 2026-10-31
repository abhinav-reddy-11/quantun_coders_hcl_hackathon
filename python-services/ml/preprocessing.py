"""Quarter parsing and feature encoding for the demand-forecast model."""
import re
from typing import List, Tuple

import numpy as np

QUARTER_RE = re.compile(r"^Q([1-4])\s+(\d{4})$")


def parse_quarter(label: str) -> Tuple[int, int]:
    """'Q3 2026' -> (2026, 3)."""
    m = QUARTER_RE.match(label.strip())
    if not m:
        raise ValueError(f"Invalid quarter '{label}'. Expected format 'Q<1-4> <YYYY>'.")
    return int(m.group(2)), int(m.group(1))


def quarter_index(label: str) -> int:
    """Absolute, monotonically increasing quarter number (year*4 + q-1)."""
    y, q = parse_quarter(label)
    return y * 4 + (q - 1)


def index_to_label(idx: int) -> str:
    return f"Q{idx % 4 + 1} {idx // 4}"


def next_quarter(label: str) -> str:
    return index_to_label(quarter_index(label) + 1)


class FeatureEncoder:
    """
    Encodes (quarter, skill) into a feature vector for a single LinearRegression:

        [ t,  onehot(skill)...,  onehot(skill) * t ... ]

    t = quarters since the first observed quarter. The one-hot block lets each skill have its own
    intercept, and the interaction block lets each skill have its own trend (slope). A single
    linear model therefore learns per-skill demand trends.
    """

    def __init__(self):
        self.skill_ids: List[int] = []
        self.t0: int = 0

    def fit(self, quarters: List[str], skill_ids: List[int]) -> "FeatureEncoder":
        self.skill_ids = sorted(set(skill_ids))
        self.t0 = min(quarter_index(q) for q in quarters)
        return self

    def transform(self, quarters: List[str], skill_ids: List[int]) -> np.ndarray:
        pos = {sid: i for i, sid in enumerate(self.skill_ids)}
        k = len(self.skill_ids)
        X = np.zeros((len(quarters), 1 + 2 * k))
        for row, (q, sid) in enumerate(zip(quarters, skill_ids)):
            if sid not in pos:
                raise ValueError(f"Skill {sid} has no historical data; cannot forecast it.")
            t = quarter_index(q) - self.t0
            X[row, 0] = t
            X[row, 1 + pos[sid]] = 1.0
            X[row, 1 + k + pos[sid]] = t
        return X

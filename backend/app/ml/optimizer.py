"""Best-XI team optimizer (ILP).

Constraints (FPL rules):
- Squad of 15: 2 GK, 5 DEF, 5 MID, 3 FWD
- Starting XI: 1 GK, min 3 DEF, min 2 MID, min 1 FWD, total 11
- Budget: £100.0m (1000 in tenths)
- Max 3 players from any one team

Objective: maximize sum of predicted_points for the STARTING XI,
plus a small bonus for captain (× 2 on top of starter).
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
import pulp


SQUAD_BY_POS = {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3}
XI_MIN = {"GK": 1, "DEF": 3, "MID": 2, "FWD": 1}
XI_MAX = {"GK": 1, "DEF": 5, "MID": 5, "FWD": 3}
BUDGET_TENTHS = 1000
MAX_PER_CLUB = 3


@dataclass
class OptimizerResult:
    squad: pd.DataFrame  # 15 players, flag is_starter, is_captain
    cost: int
    expected_points: float
    captain_id: int


def optimize(predictions: pd.DataFrame, team_ids: dict[int, int]) -> OptimizerResult:
    """predictions: required cols [player_id, position, price, predicted_points]
       team_ids:    mapping {player_id: team_id} for club-count constraint
    """
    df = predictions.copy().reset_index(drop=True)
    df["team_id"] = df["player_id"].map(team_ids).fillna(-1).astype(int)

    prob = pulp.LpProblem("fpl_best_squad", pulp.LpMaximize)
    n = len(df)
    squad = [pulp.LpVariable(f"s_{i}", cat="Binary") for i in range(n)]
    start = [pulp.LpVariable(f"x_{i}", cat="Binary") for i in range(n)]
    cap = [pulp.LpVariable(f"c_{i}", cat="Binary") for i in range(n)]

    # Starter implies squad; captain implies starter
    for i in range(n):
        prob += start[i] <= squad[i]
        prob += cap[i] <= start[i]

    # Squad composition
    prob += pulp.lpSum(squad) == 15
    for pos, k in SQUAD_BY_POS.items():
        prob += pulp.lpSum(squad[i] for i in range(n) if df.loc[i, "position"] == pos) == k

    # XI composition
    prob += pulp.lpSum(start) == 11
    for pos in ("GK", "DEF", "MID", "FWD"):
        idxs = [i for i in range(n) if df.loc[i, "position"] == pos]
        prob += pulp.lpSum(start[i] for i in idxs) >= XI_MIN[pos]
        prob += pulp.lpSum(start[i] for i in idxs) <= XI_MAX[pos]

    # Budget
    prob += pulp.lpSum(int(df.loc[i, "price"]) * squad[i] for i in range(n)) <= BUDGET_TENTHS

    # Max per club
    for team_id in df["team_id"].unique():
        idxs = df.index[df["team_id"] == team_id].tolist()
        prob += pulp.lpSum(squad[i] for i in idxs) <= MAX_PER_CLUB

    # One captain
    prob += pulp.lpSum(cap) == 1

    # Objective
    points = df["predicted_points"].astype(float).values
    prob += (
        pulp.lpSum(points[i] * start[i] for i in range(n))
        + pulp.lpSum(points[i] * cap[i] for i in range(n))  # captain doubles on top
    )

    solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=30)
    prob.solve(solver)

    if pulp.LpStatus[prob.status] != "Optimal":
        raise RuntimeError(f"Optimizer status: {pulp.LpStatus[prob.status]}")

    df["is_squad"] = [bool(squad[i].value()) for i in range(n)]
    df["is_starter"] = [bool(start[i].value()) for i in range(n)]
    df["is_captain"] = [bool(cap[i].value()) for i in range(n)]
    squad_df = df[df["is_squad"]].copy()
    cost = int(squad_df["price"].sum())
    xp = float(
        (squad_df.loc[squad_df["is_starter"], "predicted_points"].sum())
        + (squad_df.loc[squad_df["is_captain"], "predicted_points"].sum())
    )
    cap_id = int(squad_df.loc[squad_df["is_captain"], "player_id"].iloc[0])
    return OptimizerResult(
        squad=squad_df, cost=cost, expected_points=xp, captain_id=cap_id
    )

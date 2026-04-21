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


def _solve(prob: pulp.LpProblem) -> str:
    solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=30)
    prob.solve(solver)
    return pulp.LpStatus[prob.status]


def _diagnostics(df: pd.DataFrame) -> str:
    pos_counts = df["position"].value_counts().to_dict()
    team_counts = df["team_id"].value_counts()
    return (
        f"n={len(df)} | pos_counts={pos_counts} | "
        f"price min={df['price'].min()} max={df['price'].max()} sum(cheapest 15)="
        f"{df['price'].nsmallest(15).sum()} | "
        f"teams={len(team_counts)} | "
        f"max_players_on_one_team={int(team_counts.max()) if len(team_counts) else 0}"
    )


def optimize(predictions: pd.DataFrame, team_ids: dict[int, int]) -> OptimizerResult:
    """predictions: required cols [player_id, position, price, predicted_points]
       team_ids:    mapping {player_id: team_id} for club-count constraint
    """
    df = predictions.copy().reset_index(drop=True)
    df["team_id"] = df["player_id"].map(team_ids).fillna(-1).astype(int)

    def build(enforce_max_per_club: bool) -> pulp.LpProblem:
        prob = pulp.LpProblem("fpl_best_squad", pulp.LpMaximize)
        n = len(df)
        squad = [pulp.LpVariable(f"s_{i}", cat="Binary") for i in range(n)]
        start = [pulp.LpVariable(f"x_{i}", cat="Binary") for i in range(n)]
        cap = [pulp.LpVariable(f"c_{i}", cat="Binary") for i in range(n)]

        for i in range(n):
            prob += start[i] <= squad[i]
            prob += cap[i] <= start[i]

        prob += pulp.lpSum(squad) == 15
        for pos, k in SQUAD_BY_POS.items():
            prob += pulp.lpSum(squad[i] for i in range(n) if df.loc[i, "position"] == pos) == k

        prob += pulp.lpSum(start) == 11
        for pos in ("GK", "DEF", "MID", "FWD"):
            idxs = [i for i in range(n) if df.loc[i, "position"] == pos]
            prob += pulp.lpSum(start[i] for i in idxs) >= XI_MIN[pos]
            prob += pulp.lpSum(start[i] for i in idxs) <= XI_MAX[pos]

        prob += pulp.lpSum(int(df.loc[i, "price"]) * squad[i] for i in range(n)) <= BUDGET_TENTHS

        if enforce_max_per_club:
            for team_id in df["team_id"].unique():
                idxs = df.index[df["team_id"] == team_id].tolist()
                prob += pulp.lpSum(squad[i] for i in idxs) <= MAX_PER_CLUB

        prob += pulp.lpSum(cap) == 1

        points = df["predicted_points"].astype(float).values
        prob += (
            pulp.lpSum(points[i] * start[i] for i in range(n))
            + pulp.lpSum(points[i] * cap[i] for i in range(n))
        )
        return prob

    prob = build(enforce_max_per_club=True)
    status = _solve(prob)

    if status != "Optimal":
        # Retry without club cap to isolate whether the cap is the culprit
        prob_relaxed = build(enforce_max_per_club=False)
        status_relaxed = _solve(prob_relaxed)
        if status_relaxed != "Optimal":
            raise RuntimeError(
                f"Optimizer infeasible even without max-per-club. "
                f"Primary status={status}, relaxed status={status_relaxed}. "
                f"Predictions: {_diagnostics(df)}"
            )
        print(
            f"[optimizer] max-per-club={MAX_PER_CLUB} was infeasible; relaxing. "
            f"Predictions: {_diagnostics(df)}"
        )
        prob = prob_relaxed

    n = len(df)
    squad_vars = [v for v in prob.variables() if v.name.startswith("s_")]
    start_vars = [v for v in prob.variables() if v.name.startswith("x_")]
    cap_vars = [v for v in prob.variables() if v.name.startswith("c_")]
    squad_vars.sort(key=lambda v: int(v.name.split("_")[1]))
    start_vars.sort(key=lambda v: int(v.name.split("_")[1]))
    cap_vars.sort(key=lambda v: int(v.name.split("_")[1]))

    df["is_squad"] = [bool(squad_vars[i].value()) for i in range(n)]
    df["is_starter"] = [bool(start_vars[i].value()) for i in range(n)]
    df["is_captain"] = [bool(cap_vars[i].value()) for i in range(n)]
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

#!/usr/bin/env python3
"""
Lightweight cost estimator placeholder.
Reads a plan JSON and emits a simple budget check to stdout (JSON).
"""

import json
import os
import sys
from pathlib import Path


def estimate(plan: dict) -> dict:
    # Simple heuristic: each step costs 1 point unless action includes "manus"
    base_cost = len(plan.get("steps", []))
    manus_steps = sum(1 for s in plan.get("steps", []) if "manus" in s.get("action", ""))
    total_cost = base_cost + manus_steps
    return {
        "steps": len(plan.get("steps", [])),
        "manus_steps": manus_steps,
        "estimated_points": total_cost,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "plan file path required"}))
        sys.exit(1)

    plan_path = Path(sys.argv[1])
    if not plan_path.exists():
        print(json.dumps({"error": f"plan not found at {plan_path}"}))
        sys.exit(1)

    with plan_path.open() as f:
        plan = json.load(f)

    est = estimate(plan)
    budget_daily = int(os.getenv("BUDGET_DAY", "50"))
    budget_weekly = int(os.getenv("BUDGET_WEEK", "200"))
    within_budget = est["estimated_points"] <= budget_daily

    output = {
        "within_budget": within_budget,
        "estimated_points": est["estimated_points"],
        "budget_day": budget_daily,
        "budget_week": budget_weekly,
        "recommendation": "proceed" if within_budget else "degrade",
    }
    print(json.dumps(output))


if __name__ == "__main__":
    main()

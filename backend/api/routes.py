from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from typing import List, Optional
import io
import json

from models.schemas import StressTestRequest, StressTestResult, StressScenario, PortfolioPosition
from services.stress_engine import StressTestEngine
from services.csv_parser import parse_portfolio_csv, generate_sample_csv
from services.scenario_library import get_scenario, list_scenarios, PREDEFINED_SCENARIOS

router = APIRouter()
engine = StressTestEngine()

# In-memory store (replace with DB in production)
_portfolios: dict = {}


@router.get("/scenarios", summary="List all predefined scenarios")
def get_scenarios():
    return {"scenarios": list_scenarios()}


@router.get("/scenarios/{scenario_id}", summary="Get a specific scenario")
def get_scenario_by_id(scenario_id: str):
    try:
        s = get_scenario(scenario_id)
        return s.dict()
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/portfolio/upload", summary="Upload portfolio CSV")
async def upload_portfolio(
    file: UploadFile = File(...),
    portfolio_id: Optional[str] = "default"
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")
    content = await file.read()
    try:
        positions, warnings = parse_portfolio_csv(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    _portfolios[portfolio_id] = positions
    return {
        "portfolio_id": portfolio_id,
        "positions_loaded": len(positions),
        "warnings": warnings,
        "summary": _summarize_portfolio(positions),
    }


@router.get("/portfolio/{portfolio_id}", summary="Get portfolio summary")
def get_portfolio(portfolio_id: str):
    if portfolio_id not in _portfolios:
        raise HTTPException(status_code=404, detail="Portfolio not found.")
    positions = _portfolios[portfolio_id]
    return {
        "portfolio_id": portfolio_id,
        "positions": [p.dict() for p in positions],
        "summary": _summarize_portfolio(positions),
    }


@router.post("/stress-test/run", summary="Run a stress test", response_model=StressTestResult)
def run_stress_test(request: StressTestRequest):
    positions = request.positions
    if not positions:
        if request.portfolio_id not in _portfolios:
            raise HTTPException(status_code=404, detail="Portfolio not found. Upload CSV first.")
        positions = _portfolios[request.portfolio_id]

    if not positions:
        raise HTTPException(status_code=400, detail="No positions to stress test.")

    result = engine.run_stress_test(positions, request.scenario, request.portfolio_id)
    return result


@router.post("/stress-test/batch", summary="Run multiple scenarios on a portfolio")
def run_batch_stress_test(portfolio_id: str, scenario_ids: Optional[List[str]] = None):
    if portfolio_id not in _portfolios:
        raise HTTPException(status_code=404, detail="Portfolio not found.")
    positions = _portfolios[portfolio_id]
    ids = scenario_ids or list(PREDEFINED_SCENARIOS.keys())
    results = []
    for sid in ids:
        try:
            scenario = get_scenario(sid)
            result = engine.run_stress_test(positions, scenario, portfolio_id)
            results.append({
                "scenario_id": sid,
                "scenario_name": scenario.name,
                "total_loss": result.total_loss,
                "total_loss_pct": result.total_loss_pct,
                "var_95": result.var_95,
                "var_99": result.var_99,
                "es_95": result.es_95,
                "total_expected_loss": result.total_expected_loss,
            })
        except Exception as e:
            results.append({"scenario_id": sid, "error": str(e)})
    return {"portfolio_id": portfolio_id, "batch_results": results}


@router.get("/sample-csv", summary="Download sample portfolio CSV")
def download_sample_csv():
    csv_content = generate_sample_csv()
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sample_portfolio.csv"},
    )


def _summarize_portfolio(positions: List[PortfolioPosition]) -> dict:
    from collections import defaultdict
    ac_totals = defaultdict(float)
    for p in positions:
        ac_totals[p.asset_class.value] += p.market_value
    total_mv = sum(p.market_value for p in positions)
    return {
        "total_market_value": total_mv,
        "position_count": len(positions),
        "by_asset_class": dict(ac_totals),
        "currencies": list(set(p.currency for p in positions)),
    }

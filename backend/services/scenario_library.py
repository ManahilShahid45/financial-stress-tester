from models.schemas import StressScenario, ShockParameter, ShockType

PREDEFINED_SCENARIOS = {
    "2008_financial_crisis": StressScenario(
        name="2008 Financial Crisis",
        description="Lehman Brothers collapse scenario with severe equity crash and credit freeze",
        shocks=[
            ShockParameter(shock_type=ShockType.EQUITY, magnitude=-0.45),
            ShockParameter(shock_type=ShockType.INTEREST_RATE, magnitude=0.0150),
            ShockParameter(shock_type=ShockType.CREDIT_SPREAD, magnitude=0.0400),
            ShockParameter(shock_type=ShockType.FX, magnitude=-0.12, currency="EUR"),
        ],
        confidence_level=0.99,
        time_horizon_days=20,
    ),
    "covid_shock": StressScenario(
        name="COVID-19 Market Shock (March 2020)",
        description="Pandemic-induced market dislocation with rapid equity drawdown",
        shocks=[
            ShockParameter(shock_type=ShockType.EQUITY, magnitude=-0.34),
            ShockParameter(shock_type=ShockType.INTEREST_RATE, magnitude=-0.0100),
            ShockParameter(shock_type=ShockType.CREDIT_SPREAD, magnitude=0.0250),
            ShockParameter(shock_type=ShockType.VOLATILITY, magnitude=0.30),
        ],
        confidence_level=0.99,
        time_horizon_days=10,
    ),
    "rate_hike_shock": StressScenario(
        name="Aggressive Rate Hike Cycle",
        description="Central bank tightening — 300bps rate increase over 12 months",
        shocks=[
            ShockParameter(shock_type=ShockType.INTEREST_RATE, magnitude=0.0300, tenor="10Y"),
            ShockParameter(shock_type=ShockType.EQUITY, magnitude=-0.20),
            ShockParameter(shock_type=ShockType.CREDIT_SPREAD, magnitude=0.0150),
        ],
        confidence_level=0.95,
        time_horizon_days=30,
    ),
    "emerging_market_crisis": StressScenario(
        name="Emerging Market Currency Crisis",
        description="EM currency devaluation with capital flight and credit contagion",
        shocks=[
            ShockParameter(shock_type=ShockType.FX, magnitude=-0.30, currency="GBP"),
            ShockParameter(shock_type=ShockType.FX, magnitude=-0.25, currency="EUR"),
            ShockParameter(shock_type=ShockType.EQUITY, magnitude=-0.25),
            ShockParameter(shock_type=ShockType.CREDIT_SPREAD, magnitude=0.0200),
        ],
        confidence_level=0.99,
        time_horizon_days=15,
    ),
    "mild_recession": StressScenario(
        name="Mild Recession",
        description="Moderate economic slowdown with modest asset value decline",
        shocks=[
            ShockParameter(shock_type=ShockType.EQUITY, magnitude=-0.15),
            ShockParameter(shock_type=ShockType.INTEREST_RATE, magnitude=0.0050),
            ShockParameter(shock_type=ShockType.CREDIT_SPREAD, magnitude=0.0075),
        ],
        confidence_level=0.95,
        time_horizon_days=10,
    ),
}


def get_scenario(name: str) -> StressScenario:
    if name not in PREDEFINED_SCENARIOS:
        raise KeyError(f"Scenario '{name}' not found. Available: {list(PREDEFINED_SCENARIOS.keys())}")
    return PREDEFINED_SCENARIOS[name]


def list_scenarios():
    return [
        {
            "id": k,
            "name": v.name,
            "description": v.description,
            "shock_count": len(v.shocks),
            "confidence_level": v.confidence_level,
            "time_horizon_days": v.time_horizon_days,
        }
        for k, v in PREDEFINED_SCENARIOS.items()
    ]

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


class AssetClass(str, Enum):
    LOAN = "loan"
    MORTGAGE = "mortgage"
    COLLATERAL = "collateral"
    EQUITY = "equity"
    BOND = "bond"
    FX = "fx"


class ShockType(str, Enum):
    EQUITY = "equity"
    INTEREST_RATE = "interest_rate"
    FX = "fx"
    CREDIT_SPREAD = "credit_spread"
    VOLATILITY = "volatility"
    LIQUIDITY = "liquidity"


class ShockParameter(BaseModel):
    shock_type: ShockType
    magnitude: float = Field(..., description="Shock magnitude as decimal (e.g., -0.20 for -20%)")
    currency: Optional[str] = Field(None, description="Currency code for FX shocks")
    tenor: Optional[str] = Field(None, description="Tenor for interest rate shocks")


class StressScenario(BaseModel):
    name: str
    description: Optional[str] = None
    shocks: List[ShockParameter]
    confidence_level: float = Field(0.95, ge=0.0, le=1.0)
    time_horizon_days: int = Field(10, ge=1, le=365)


class PortfolioPosition(BaseModel):
    position_id: str
    asset_class: AssetClass
    notional: float
    market_value: float
    currency: str = "USD"
    maturity_date: Optional[str] = None
    coupon_rate: Optional[float] = None
    ltv_ratio: Optional[float] = None
    pd: Optional[float] = Field(None, description="Probability of Default")
    lgd: Optional[float] = Field(None, description="Loss Given Default")
    beta: Optional[float] = Field(None, description="Equity beta")
    duration: Optional[float] = Field(None, description="Interest rate duration")
    fx_sensitivity: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = {}


class StressTestRequest(BaseModel):
    portfolio_id: str
    scenario: StressScenario
    positions: Optional[List[PortfolioPosition]] = None


class RiskMetrics(BaseModel):
    position_id: str
    asset_class: str
    base_value: float
    stressed_value: float
    absolute_loss: float
    percentage_loss: float
    expected_loss: float
    var_contribution: float


class StressTestResult(BaseModel):
    portfolio_id: str
    scenario_name: str
    total_base_value: float
    total_stressed_value: float
    total_loss: float
    total_loss_pct: float
    total_expected_loss: float
    var_95: float
    var_99: float
    es_95: float
    position_results: List[RiskMetrics]
    loss_by_asset_class: Dict[str, float]
    shock_summary: List[Dict[str, Any]]

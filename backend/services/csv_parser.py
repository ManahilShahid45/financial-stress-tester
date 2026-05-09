import pandas as pd
import io
from typing import List, Tuple
from models.schemas import PortfolioPosition, AssetClass


REQUIRED_COLUMNS = {"position_id", "asset_class", "notional", "market_value", "currency"}

ASSET_CLASS_MAP = {
    "loan": AssetClass.LOAN,
    "mortgage": AssetClass.MORTGAGE,
    "collateral": AssetClass.COLLATERAL,
    "equity": AssetClass.EQUITY,
    "bond": AssetClass.BOND,
    "fx": AssetClass.FX,
}


def parse_portfolio_csv(file_bytes: bytes) -> Tuple[List[PortfolioPosition], List[str]]:
    """Parse portfolio CSV and return positions + warnings."""
    df = pd.read_csv(io.BytesIO(file_bytes))
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    positions = []
    warnings = []

    for idx, row in df.iterrows():
        try:
            ac_raw = str(row["asset_class"]).lower().strip()
            asset_class = ASSET_CLASS_MAP.get(ac_raw)
            if not asset_class:
                warnings.append(f"Row {idx+1}: Unknown asset class '{ac_raw}', defaulting to 'loan'")
                asset_class = AssetClass.LOAN

            pos = PortfolioPosition(
                position_id=str(row["position_id"]),
                asset_class=asset_class,
                notional=float(row["notional"]),
                market_value=float(row["market_value"]),
                currency=str(row.get("currency", "USD")),
                maturity_date=str(row["maturity_date"]) if "maturity_date" in row and pd.notna(row.get("maturity_date")) else None,
                coupon_rate=float(row["coupon_rate"]) if "coupon_rate" in row and pd.notna(row.get("coupon_rate")) else None,
                ltv_ratio=float(row["ltv_ratio"]) if "ltv_ratio" in row and pd.notna(row.get("ltv_ratio")) else None,
                pd=float(row["pd"]) if "pd" in row and pd.notna(row.get("pd")) else None,
                lgd=float(row["lgd"]) if "lgd" in row and pd.notna(row.get("lgd")) else None,
                beta=float(row["beta"]) if "beta" in row and pd.notna(row.get("beta")) else None,
                duration=float(row["duration"]) if "duration" in row and pd.notna(row.get("duration")) else None,
                fx_sensitivity=float(row["fx_sensitivity"]) if "fx_sensitivity" in row and pd.notna(row.get("fx_sensitivity")) else None,
            )
            positions.append(pos)
        except Exception as e:
            warnings.append(f"Row {idx+1}: Skipped due to error — {str(e)}")

    return positions, warnings


def generate_sample_csv() -> str:
    """Generate a sample portfolio CSV for testing."""
    data = {
        "position_id": ["POS001", "POS002", "POS003", "POS004", "POS005", "POS006"],
        "asset_class": ["loan", "mortgage", "equity", "bond", "collateral", "fx"],
        "notional": [1_000_000, 500_000, 250_000, 750_000, 300_000, 400_000],
        "market_value": [980_000, 495_000, 260_000, 740_000, 295_000, 398_000],
        "currency": ["USD", "USD", "USD", "EUR", "USD", "GBP"],
        "pd": [0.02, 0.015, None, 0.01, 0.025, None],
        "lgd": [0.45, 0.35, None, 0.40, 0.50, None],
        "beta": [None, None, 1.2, None, None, None],
        "duration": [3.5, 7.2, None, 5.8, 1.5, None],
        "ltv_ratio": [None, 0.75, None, None, 0.60, None],
        "fx_sensitivity": [None, None, None, 0.8, None, 1.0],
    }
    df = pd.DataFrame(data)
    return df.to_csv(index=False)

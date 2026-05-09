import numpy as np
import pandas as pd
from typing import List, Dict, Tuple
from models.schemas import (
    PortfolioPosition, StressScenario, StressTestResult,
    RiskMetrics, ShockType, AssetClass
)


class StressTestEngine:
    """Core stress testing computation engine."""

    def __init__(self):
        self.correlation_matrix = self._default_correlation_matrix()

    def _default_correlation_matrix(self) -> np.ndarray:
        """Default inter-asset correlation matrix."""
        return np.array([
            [1.00, 0.65, 0.45, 0.30, 0.20],
            [0.65, 1.00, 0.55, 0.40, 0.25],
            [0.45, 0.55, 1.00, 0.50, 0.35],
            [0.30, 0.40, 0.50, 1.00, 0.60],
            [0.20, 0.25, 0.35, 0.60, 1.00],
        ])

    def apply_equity_shock(self, position: PortfolioPosition, shock_magnitude: float) -> float:
        beta = position.beta or 1.0
        stressed_return = beta * shock_magnitude
        return position.market_value * (1 + stressed_return)

    def apply_interest_rate_shock(self, position: PortfolioPosition, shock_magnitude: float) -> float:
        duration = position.duration or self._estimate_duration(position)
        convexity = duration ** 2 / 100
        price_change = (-duration * shock_magnitude) + (0.5 * convexity * shock_magnitude ** 2)
        return position.market_value * (1 + price_change)

    def apply_fx_shock(self, position: PortfolioPosition, shock_magnitude: float,
                        target_currency: str = None) -> float:
        if target_currency and position.currency != target_currency:
            return position.market_value
        fx_sensitivity = position.fx_sensitivity or 1.0
        return position.market_value * (1 + fx_sensitivity * shock_magnitude)

    def apply_credit_spread_shock(self, position: PortfolioPosition, shock_magnitude: float) -> float:
        duration = position.duration or self._estimate_duration(position)
        price_change = -duration * shock_magnitude
        return position.market_value * (1 + price_change)

    def _estimate_duration(self, position: PortfolioPosition) -> float:
        if position.asset_class == AssetClass.MORTGAGE:
            return 7.5
        elif position.asset_class == AssetClass.LOAN:
            return 3.0
        elif position.asset_class == AssetClass.BOND:
            return 5.0
        elif position.asset_class == AssetClass.COLLATERAL:
            return 2.0
        return 1.0

    def calculate_expected_loss(self, position: PortfolioPosition, stressed_value: float) -> float:
        pd = position.pd or 0.02
        lgd = position.lgd or 0.45
        ead = max(stressed_value, 0)
        return pd * lgd * ead

    def calculate_var(self, losses: List[float], confidence: float = 0.95) -> float:
        if not losses:
            return 0.0
        sorted_losses = sorted(losses, reverse=True)
        index = int((1 - confidence) * len(sorted_losses))
        return sorted_losses[max(0, index)]

    def calculate_expected_shortfall(self, losses: List[float], confidence: float = 0.95) -> float:
        if not losses:
            return 0.0
        sorted_losses = sorted(losses, reverse=True)
        cutoff = int((1 - confidence) * len(sorted_losses))
        tail_losses = sorted_losses[:max(1, cutoff)]
        return np.mean(tail_losses)

    def simulate_scenario_losses(self, positions: List[PortfolioPosition],
                                  scenario: StressScenario, n_simulations: int = 1000) -> np.ndarray:
        """Monte Carlo simulation for VaR/ES calculation."""
        np.random.seed(42)
        all_losses = []
        for _ in range(n_simulations):
            sim_loss = 0.0
            for pos in positions:
                noise = np.random.normal(0, 0.02)
                for shock in scenario.shocks:
                    stressed = self._apply_shock_with_noise(pos, shock.shock_type,
                                                             shock.magnitude + noise, shock.currency)
                    sim_loss += pos.market_value - max(stressed, 0)
            all_losses.append(sim_loss)
        return np.array(all_losses)

    def _apply_shock_with_noise(self, position, shock_type, magnitude, currency=None) -> float:
        if shock_type == ShockType.EQUITY:
            return self.apply_equity_shock(position, magnitude)
        elif shock_type == ShockType.INTEREST_RATE:
            return self.apply_interest_rate_shock(position, magnitude)
        elif shock_type == ShockType.FX:
            return self.apply_fx_shock(position, magnitude, currency)
        elif shock_type == ShockType.CREDIT_SPREAD:
            return self.apply_credit_spread_shock(position, magnitude)
        return position.market_value

    def run_stress_test(self, positions: List[PortfolioPosition],
                         scenario: StressScenario, portfolio_id: str) -> StressTestResult:
        position_results = []
        loss_by_asset_class: Dict[str, float] = {}
        total_base = sum(p.market_value for p in positions)
        total_stressed = 0.0
        total_el = 0.0

        for pos in positions:
            stressed_value = pos.market_value
            for shock in scenario.shocks:
                if shock.shock_type == ShockType.EQUITY:
                    stressed_value = self.apply_equity_shock(pos, shock.magnitude)
                elif shock.shock_type == ShockType.INTEREST_RATE:
                    stressed_value = self.apply_interest_rate_shock(pos, shock.magnitude)
                elif shock.shock_type == ShockType.FX:
                    stressed_value = self.apply_fx_shock(pos, shock.magnitude, shock.currency)
                elif shock.shock_type == ShockType.CREDIT_SPREAD:
                    stressed_value = self.apply_credit_spread_shock(pos, shock.magnitude)

            stressed_value = max(stressed_value, 0)
            abs_loss = pos.market_value - stressed_value
            pct_loss = (abs_loss / pos.market_value * 100) if pos.market_value > 0 else 0
            el = self.calculate_expected_loss(pos, stressed_value)

            total_stressed += stressed_value
            total_el += el

            ac = pos.asset_class.value
            loss_by_asset_class[ac] = loss_by_asset_class.get(ac, 0) + abs_loss

            var_contribution = abs_loss / total_base if total_base > 0 else 0

            position_results.append(RiskMetrics(
                position_id=pos.position_id,
                asset_class=pos.asset_class.value,
                base_value=pos.market_value,
                stressed_value=stressed_value,
                absolute_loss=abs_loss,
                percentage_loss=pct_loss,
                expected_loss=el,
                var_contribution=var_contribution,
            ))

        sim_losses = self.simulate_scenario_losses(positions, scenario)
        var_95 = self.calculate_var(sim_losses.tolist(), 0.95)
        var_99 = self.calculate_var(sim_losses.tolist(), 0.99)
        es_95 = self.calculate_expected_shortfall(sim_losses.tolist(), 0.95)

        total_loss = total_base - total_stressed
        total_loss_pct = (total_loss / total_base * 100) if total_base > 0 else 0

        shock_summary = [
            {
                "shock_type": s.shock_type.value,
                "magnitude": s.magnitude,
                "magnitude_pct": f"{s.magnitude * 100:.1f}%",
                "currency": s.currency,
                "tenor": s.tenor,
            }
            for s in scenario.shocks
        ]

        return StressTestResult(
            portfolio_id=portfolio_id,
            scenario_name=scenario.name,
            total_base_value=total_base,
            total_stressed_value=total_stressed,
            total_loss=total_loss,
            total_loss_pct=total_loss_pct,
            total_expected_loss=total_el,
            var_95=var_95,
            var_99=var_99,
            es_95=es_95,
            position_results=position_results,
            loss_by_asset_class=loss_by_asset_class,
            shock_summary=shock_summary,
        )

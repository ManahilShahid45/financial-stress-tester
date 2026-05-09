# 📊 FinStress — Financial Stress Testing Platform

![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688)
![React](https://img.shields.io/badge/React-18%2B-61DAFB)
![Recharts](https://img.shields.io/badge/Recharts-2.x-orange)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)
![Status](https://img.shields.io/badge/Status-MVP%20Ready-brightgreen)

## 📖 Project Overview

**FinStress** is an open-source financial stress testing platform that helps risk analysts and portfolio managers quantify the impact of macroeconomic shocks on their portfolios. Upload a CSV portfolio, select from a library of predefined crisis scenarios (or define your own), and get instant P&L estimates, Value at Risk (VaR), and Expected Shortfall (ES) — all powered by a FastAPI backend and an interactive React dashboard.

This project demonstrates applied quantitative finance — duration-convexity bond pricing, beta-adjusted equity shocks, credit spread modelling, and Monte Carlo simulation — packaged as a full-stack web application.

## 🎯 Key Features

### 📉 **Scenario Library**
- **5 predefined macroeconomic scenarios**: 2008 Financial Crisis, COVID-19 Shock, Aggressive Rate Hike, EM Currency Crisis, Mild Recession
- Each scenario applies calibrated shocks across equity, rates, credit spreads, and FX simultaneously
- Scenarios are easily extensible — add your own in `scenario_library.py`

### ⚙️ **Stress Engine**
- **Asset-class-aware shock application**: equities use beta-adjusted shocks; bonds/loans/mortgages use duration-convexity pricing; FX positions use sensitivity-weighted shocks
- **Credit spread overlay**: applied on top of rate shocks for all credit positions
- **Monte Carlo VaR/ES**: 1,000 simulations with noise-perturbed shocks for statistical risk measures

### 📂 **Portfolio Ingestion**
- Upload any CSV portfolio with standard position data
- Supports `loan`, `mortgage`, `equity`, `bond`, `collateral`, and `fx` asset classes
- Download a sample CSV to get started in seconds

### 💻 **Interactive Dashboard**
- React + Recharts frontend with real-time scenario results
- Batch-run all scenarios and compare outputs side by side
- Clean REST API with auto-generated Swagger docs

## 🛠️ Technologies Used

### **Backend**
- **Python 3.10+**: Core language
- **FastAPI**: High-performance async REST API framework
- **Pydantic**: Data validation and schema definitions
- **NumPy / Pandas**: Numerical computation and CSV ingestion
- **Uvicorn**: ASGI server

### **Frontend**
- **React 18**: Component-based SPA
- **Recharts**: Declarative charting for scenario P&L visualisation
- **Vite**: Fast dev server and bundler

### **Infrastructure**
- **Docker + Docker Compose**: One-command local deployment
- **OpenAPI / Swagger**: Auto-generated API documentation at `/docs`

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose — OR — Python 3.10+ and Node.js 18+

### With Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/yourusername/finstress.git
cd finstress

# Build and start all services
docker-compose up --build
```

| Service | URL |
|---------|-----|
| Frontend dashboard | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |

### Manual Setup

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## 🗂️ Project Structure

```
stress-test/
├── backend/                      # FastAPI Python backend
│   ├── main.py                   # App entry point
│   ├── api/routes.py             # REST API endpoints
│   ├── models/schemas.py         # Pydantic data models
│   ├── services/
│   │   ├── stress_engine.py      # Core stress computation + Monte Carlo
│   │   ├── csv_parser.py         # Portfolio CSV ingestion
│   │   └── scenario_library.py  # Predefined scenario definitions
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                     # React + Recharts dashboard
│   ├── src/App.jsx               # Full SPA dashboard
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── data/                         # CSV drop folder
└── docker-compose.yml
```

## 🎮 How to Use

### 1. Upload a Portfolio
Navigate to the dashboard at `http://localhost:5173`. Click **Upload Portfolio** and select a CSV file matching the format below (or download the sample via the API).

### 2. Select a Scenario
Choose from the predefined scenario library or configure a custom shock. Click **Run Stress Test** to apply the scenario to your portfolio.

### 3. Review Results
- **P&L Impact**: Total stressed loss/gain vs. current market value
- **By Asset Class**: Breakdown of impact across equity, fixed income, FX, and credit positions
- **VaR / ES**: Monte Carlo-derived 95% and 99% risk estimates
- **Batch Mode**: Run all scenarios at once and compare results in a table

## 📋 CSV Format

```csv
position_id,asset_class,notional,market_value,currency,pd,lgd,beta,duration,ltv_ratio,fx_sensitivity
POS001,loan,1000000,980000,USD,0.02,0.45,,3.5,,
POS002,mortgage,500000,495000,USD,0.015,0.35,,7.2,0.75,
POS003,equity,250000,260000,USD,,,1.2,,,
POS004,bond,750000,740000,USD,,,, 5.1,,
POS005,fx,200000,198000,EUR,,,,,,0.85
```

**Required columns:** `position_id`, `asset_class`, `notional`, `market_value`, `currency`

**Optional columns** (used when relevant to asset class):

| Column | Used By | Description |
|--------|---------|-------------|
| `pd` | loan, mortgage | Probability of default |
| `lgd` | loan, mortgage | Loss given default |
| `beta` | equity | Market beta coefficient |
| `duration` | bond, loan, mortgage | Modified duration (years) |
| `ltv_ratio` | mortgage | Loan-to-value ratio |
| `fx_sensitivity` | fx | FX rate sensitivity coefficient |

**Supported asset classes:** `loan` · `mortgage` · `equity` · `bond` · `collateral` · `fx`

## 🔬 Technical Details

### Stress Engine Logic

| Asset Class | Shock Type | Formula |
|-------------|------------|---------|
| Equity | Equity shock | `MV × (1 + β × shock)` |
| Loan / Bond / Mortgage | Rate shock | `MV × (1 − D × Δr + 0.5 × C × Δr²)` |
| All credit | Credit spread | `MV × (1 − D × Δspread)` |
| FX positions | FX shock | `MV × (1 + fx_sensitivity × shock)` |

Where: `MV` = market value, `β` = beta, `D` = modified duration, `C` = convexity, `Δr` = rate shock, `Δspread` = credit spread shock.

### Monte Carlo VaR / ES
- **1,000 simulations** per stress test run
- Each simulation perturbs the base scenario shocks with Gaussian noise
- **VaR 95% / 99%**: the 5th / 1st percentile of the simulated P&L distribution
- **ES (CVaR)**: mean loss in the tail beyond the VaR threshold

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/scenarios` | List all predefined scenarios |
| `GET` | `/api/v1/scenarios/{id}` | Get scenario details and shock parameters |
| `POST` | `/api/v1/portfolio/upload` | Upload CSV portfolio |
| `GET` | `/api/v1/portfolio/{id}` | Get portfolio summary |
| `POST` | `/api/v1/stress-test/run` | Run single scenario stress test |
| `POST` | `/api/v1/stress-test/batch` | Run all scenarios in batch |
| `GET` | `/api/v1/sample-csv` | Download sample portfolio CSV |

Full interactive documentation available at `http://localhost:8000/docs` (Swagger UI).

## 📉 Predefined Scenarios

| Scenario | Equity | Rates | Credit Spreads | FX |
|----------|--------|-------|----------------|----|
| **2008 Financial Crisis** | −45% | — | +400 bps | −12% |
| **COVID-19 Shock** | −34% | −100 bps | +250 bps | — |
| **Aggressive Rate Hike** | −20% | +300 bps | +150 bps | — |
| **EM Currency Crisis** | −25% | — | +200 bps | −30% |
| **Mild Recession** | −15% | +50 bps | +75 bps | — |

To add a custom scenario, extend `SCENARIO_LIBRARY` in `backend/services/scenario_library.py`.

## 🗺️ Roadmap (MVP → Enterprise)

- [ ] PostgreSQL / TimescaleDB persistence
- [ ] User authentication (JWT)
- [ ] Historical backtesting engine
- [ ] Regulatory scenarios — DFAST, EBA, PRA
- [ ] Real-time market data feeds
- [ ] PDF report export
- [ ] Multi-portfolio aggregation and netting
- [ ] Counterparty credit risk (CCR) module

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss scope.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push and open a Pull Request

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

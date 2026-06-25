# Finugreek Quant & Analytics Platform

Welcome to the Finugreek Quant & Analytics Platform. This document is the single source of truth for the codebase in its current form. It has been prepared by exhaustively crawling the existing file system, ignoring all historical conversations or deprecated roadmaps. 

This repository is a full-stack, institutional-grade quantitative finance platform built to ingest raw market data, run advanced Machine Learning (XGBoost/PyTorch) inferences, calculate SHAP feature attributions, and display everything on a rich React/Vite dashboard powered by an LLM-driven AI Agent.

---

## 🧭 Crucial Context Files for New Agents

To instantly understand the features, data fields, and underlying schema of this platform, immediately inspect the following specific files:

1. **For the Data Schema & Fields:** Run DuckDB queries against `datasets/active/market_data.parquet`. This file contains the deeply nested JSON payload (`absolute_data` and `relative_data`) housing all P/E ratios, OHLCV arrays, and quarterly financials.
2. **For the ML Features:** Read `ml_engine/predictor.py`. Look specifically at the `fundamental_feats`, `momentum_feats`, and `forensic_feats` lists to understand exactly which fields are fed into the XGBoost models.
3. **For Frontend API Contracts:** Read `frontend/src/api.ts` to see exactly what JSON shapes the React application expects from the backend.
4. **For AI Agent Tools & State:** Read `backend/agent_api.py` and `backend/agent_engine/graph.py` to understand the LangGraph state machine and how Server-Sent Events (SSE) stream to the UI.
5. **For Frontend Routing & Views:** Read `frontend/src/App.tsx` to understand the exact page structure and URL parameters (e.g., `/terminal/:slug`).

---

## 1. High-Level Architecture Overview

The platform operates on a robust, 4-tier architecture designed for speed and explainability:

1. **Data Aggregation & Storage (`scripts/`, `datasets/`)**: Nightly cron jobs pull raw JSON from market APIs and compile them into massive `.parquet` files and DuckDB databases.
2. **Machine Learning Inference (`ml_engine/`)**: Predictive scripts load pre-trained PyTorch and XGBoost models to generate T+1 and T+5 predictions. Crucially, they also calculate SHAP values to explain *why* a stock is moving.
3. **Backend & AI Layer (`backend/`)**: A FastAPI server that exposes the DuckDB data to the frontend. It embeds LangChain and Google Generative AI to act as an autonomous "AI Research Desk."
4. **Visual Dashboard (`frontend/`)**: A React + Vite + Tailwind application that renders market heatmaps, pair trading strategies, portfolio analysis, and deep-dive company snapshots.

---

## 2. Data Aggregation & The Ingestion Pipeline

The data ingestion pipeline is entirely automated via shell scripts and Python workers.

### `scripts/update_data.sh`
This is the master cron job that runs the entire daily pipeline. Its sequence of execution is critical:
1. **Blue/Green Deployment**: It manages two buffers (`datasets/A` and `datasets/B`) and performs a differential sync. 
2. **Data Generation**: It runs `scripts/generate_datasets.py` with 16 parallel workers to scrape and compile stock data. It also runs `generate_mf_datasets.py` for Mutual Funds.
3. **Compilation**: `backend/data_loader.py` compiles the raw data into optimized Parquet files.
4. **Inference Execution**: It triggers the machine learning models (`ml_engine/predictor.py` and `ml_engine/quant_inference.py`) to run over the fresh data.
5. **Atomic Swap**: It swaps the symlink of `datasets/active` to point to the newly updated buffer.
6. **Backend Reload**: It fires an API call to `http://localhost:8000/api/admin/reload_db` to seamlessly hot-swap the backend database without downtime.

### Storage Format (`datasets/`)
We rely on **Parquet files** and **DuckDB**. DuckDB is an in-process SQL OLAP database management system. It allows the FastAPI backend to run lightning-fast SQL queries (`SELECT slug, ticker, pe_ratio FROM 'datasets/active/market_data.parquet'`) directly against the columnar Parquet files, eliminating the need for a bloated Postgres/MySQL server.

---

## 3. The Machine Learning Engine (`ml_engine/`)

The `ml_engine/` directory contains the quantitative backbone of the platform. *Note: Training scripts have been pruned. This directory is strictly for inference, screening, and SHAP explainability.*

### Predictive Inference (`predictor.py`)
This script executes a multi-model ensemble to generate an `alpha_score` for every stock:
* **The Accountant (`accountant.pkl`)**: An XGBoost model trained purely on fundamental features (e.g., `pe_ratio`, `debt_to_equity`).
* **The Strategist (`strategist.pkl`)**: Evaluates technical momentum (e.g., `rs_rating`, `volatility_squeeze`).
* **The Auditor (`auditor.pkl`)**: Analyzes forensic/fraud risks (`qes_flag`, `tax_divergence`).
* **The Meta Learner (`meta_learner.pkl`)**: Combines the probabilities to generate a 1-Year Forward Alpha Probability (`alpha_score`).

**SHAP Explainability:**
Crucially, `predictor.py` generates SHAP (SHapley Additive exPlanations) values for the top 20% and bottom 10% of stocks. It saves the top 3 driving features into the database columns `shap_reason_1`, `shap_reason_2`, and `shap_reason_3`. This allows the AI Agent to explain the model's logic to the user in plain English.

### Walk-Forward Inference (`quant_inference.py`)
This script loads PyTorch `.pth` models to predict ultra-short-term (T+1 and T+5) price movements based on structured tensors.

### Quantitative Screeners
The engine includes specialized mathematical screeners that can be run independently:
* **CANSLIM Engine (`canslim_builder.py` / `canslim_screener.py`)**: A strict momentum strategy that requires a stock to have >25% Quarterly/Annual EPS growth, high institutional backing, and to be breaking out within 10% of its 52-week high.
* **Deep Value Engine (`deep_value_builder.py` / `deep_value_screener.py`)**: A contrarian "Buy Low, Sell High" strategy targeting companies that have crashed >20% from their highs, trade at a P/E < 25, but are posting >20% profit growth.

---

## 4. Backend Services & The AI Agent (`backend/`)

The backend is built with FastAPI and heavily leverages LangChain and LangGraph for AI orchestration.

### The REST API (`main.py`)
* `GET /api/stocks`: Queries DuckDB to return a massive payload of all stocks, including their basic metrics (`pe_ratio`), ML metrics (`alpha_score`), and AI explanations (`shap_reason_1`, etc.).
* `POST /api/admin/reload_db`: The hot-swap endpoint called by the cron job to refresh the DuckDB view when new Parquet files are generated.

### The AI Research Desk (`agent_api.py` & `agent_engine/`)
The platform features an autonomous AI Agent powered by `ChatGoogleGenerativeAI`.
* **Streaming SSE**: The endpoint `/api/agent/research` uses Server-Sent Events (SSE) to stream the AI's "thought process" and text output directly to the React frontend in real-time.
* **LangGraph Orchestration**: The AI is built using a LangGraph state machine (`agent_engine/graph.py`). It receives the user's query, looks up fundamental data and SHAP reasons in DuckDB, and streams a highly educated analysis back to the user.

---

## 5. Visual Dashboard (`frontend/`)

The frontend is a modern React application utilizing Vite, Tailwind CSS, React Router, and React Query.

### Routing Architecture (`App.tsx`)
The application is wrapped in a `TerminalLayout` or a standard sidebar `Layout`. It features a robust Global Search component that instantly searches across all loaded stocks.

**Primary Routes:**
* `/` (`LandingPage.tsx`): The main entry point.
* `/overview` (`MarketOverview.tsx`): High-level macro metrics.
* `/heatmap` (`MarketHeatmap.tsx`): Visualizes sector rotations and money flow across industries.
* `/screener` (`Screener.tsx`): A UI to filter the massive dataset based on technicals and fundamentals.
* `/ai-research` (`AIResearchDesk.tsx`): A dedicated terminal interface to interact with the LangGraph LLM agent.

### Company Snapshot (`frontend/src/pages/CompanySnapshot/`)
When a user clicks on a specific stock (`/terminal/:slug`), they are taken to the Company Snapshot layout. This is modularized into several components:
* `TopStrip.tsx`: Price and basic metrics.
* `PriceChart.tsx` & `AdvancedCharting.tsx`: Technical charting views.
* `FactorAttribution.tsx`: The UI that displays the ML Engine's SHAP values.
* `DeepFinancials.tsx`, `NewsSentiment.tsx`, `OwnershipTrends.tsx`, `PeerComparison.tsx`.

---

## 6. Future Additions & Next Steps

For any incoming AI Agent taking over this codebase, your immediate focus should be on marrying the newly built ML Screeners with the React Frontend:

1. **Wire the Deep Value Screener to the UI:** The `deep_value_screener.py` logic successfully identifies "Buy Low, Sell High" turnarounds. Convert this mathematical logic into a DuckDB query inside `backend/main.py` and expose it via an endpoint (e.g., `/api/screener/deep-value`) so the React `Screener.tsx` page can display it.
2. **Enhance the AI Agent's Tools:** Currently, the LLM reads basic database rows. Expand the `agent_engine/` tools to allow the LLM to dynamically trigger the `canslim_screener` or `deep_value_screener`.
3. **Advanced Visualizations:** Expand the `FactorAttribution.tsx` component to utilize D3.js or Recharts to map the actual numerical weight of the SHAP values.

---
*End of Document. Good luck.*

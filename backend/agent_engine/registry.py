import json

# Define the Master Semantic Registry
# Each component explicitly lists its required tools to prevent agent hallucination

COMPONENT_REGISTRY = {
    # Category 1: Corporate Valuation & Performance Matrix
    "current_valuation_grid": {
        "description": "Compact 4-card metric grid showing current valuation multiples (P/E, P/B, EV/EBITDA, Price/Sales). Useful for understanding how cheap or expensive a stock is.",
        "schema": '{"current_valuation_grid": {"pe_ratio": 0.0, "pb_ratio": 0.0, "ev_ebitda": 0.0, "price_sales": 0.0}}',
        "required_tools": ["query_quant_database"]
    },
    "historical_valuation_discrepancy": {
        "description": "Dual-line trend chart comparing current multiples against 5-year rolling medians. Identifies if the stock is historically undervalued.",
        "schema": '{"historical_valuation_discrepancy": [{"year": "STR", "current_pe": 0.0, "median_pe": 0.0}]}',
        "required_tools": ["query_quant_database"]
    },
    "price_to_target_range_slider": {
        "description": "Linear range progress bar mapping current price against institutional consensus targets (min, median, max).",
        "schema": '{"price_to_target_range_slider": {"current_price": 0.0, "min_target": 0.0, "median_target": 0.0, "max_target": 0.0}}',
        "required_tools": ["query_quant_database"]
    },
    "financial_health_summary": {
        "description": "High-density typography card with explicit line spacing. Core descriptive thesis of the company's financial stability, debt, and cash flow.",
        "schema": '{"financial_health_summary": {"summary": "STR", "health_score": "STR"}}',
        "required_tools": ["fetch_macro_context", "query_quant_database"]
    },
    "earnings_performance_surprises": {
        "description": "Alternating row data grid mapping reported EPS/Revenue versus market expectations. Tracks earning beats or misses.",
        "schema": '{"earnings_performance_surprises": [{"quarter": "STR", "eps_estimate": 0.0, "eps_actual": 0.0, "surprise_pct": 0.0}]}',
        "required_tools": ["query_quant_database"]
    },
    "margin_expansion_tracking": {
        "description": "Standard borderless horizontal bar chart tracking Trailing Gross, Operating, and Net margins.",
        "schema": '{"margin_expansion_tracking": {"gross_margin": 0.0, "operating_margin": 0.0, "net_margin": 0.0}}',
        "required_tools": ["query_quant_database"]
    },
    "margin_trajectory_assessment": {
        "description": "Two-bullet analytical breakdown card explaining why margins are compressing or expanding due to costs or pricing power.",
        "schema": '{"margin_trajectory_assessment": {"bullets": ["STR"]}}',
        "required_tools": ["fetch_macro_context"]
    },
    "profit_efficiency_breakdown": {
        "description": "Muted waterfall card decomposing operational returns (ROE, ROA, ROIC).",
        "schema": '{"profit_efficiency_breakdown": {"roe": 0.0, "roa": 0.0, "roic": 0.0}}',
        "required_tools": ["query_quant_database"]
    },
    "capital_allocation_scorecard": {
        "description": "Three-column comparative table mapping R&D spend, CapEx, and share buybacks over 3 years.",
        "schema": '{"capital_allocation_scorecard": [{"year": "STR", "rd_spend": 0.0, "capex": 0.0, "buybacks": 0.0}]}',
        "required_tools": ["query_quant_database"]
    },
    "dividend_yield_safety_gauge": {
        "description": "Horizontal status badge showing current yield alongside payout ratio thresholds to assess dividend safety.",
        "schema": '{"dividend_yield_safety_gauge": {"yield_pct": 0.0, "payout_ratio": 0.0, "safety_status": "STR"}}',
        "required_tools": ["query_quant_database"]
    },
    
    # Category 2: Momentum, Volatility & Technical Bounds
    "key_technical_support_grid": {
        "description": "Structural grid showing flat pill badges labeled S1, S2, and S3 floor levels derived from historical price action.",
        "schema": '{"key_technical_support_grid": {"S1": 0.0, "S2": 0.0, "S3": 0.0}}',
        "required_tools": ["query_quant_database"]
    },
    "key_technical_resistance_grid": {
        "description": "Structural grid showing flat pill badges labeled R1, R2, and R3 ceiling levels derived from historical price action.",
        "schema": '{"key_technical_resistance_grid": {"R1": 0.0, "R2": 0.0, "R3": 0.0}}',
        "required_tools": ["query_quant_database"]
    },
    "moving_average_ribbon_metrics": {
        "description": "Status table showing distance parameters from major exponential moving averages (20, 50, 200 EMAs).",
        "schema": '{"moving_average_ribbon_metrics": {"ema_20_dist": 0.0, "ema_50_dist": 0.0, "ema_200_dist": 0.0}}',
        "required_tools": ["query_quant_database"]
    },
    "momentum_velocity_gauge": {
        "description": "Compact numeric card flagging the 14-day Relative Strength Index (RSI) for overbought/oversold momentum.",
        "schema": '{"momentum_velocity_gauge": {"rsi_14": 0.0, "status": "STR"}}',
        "required_tools": ["query_quant_database"]
    },
    "volatility_compression_badge": {
        "description": "Glowing interactive status badge indicating consolidation patterns using Bollinger Band width tracking to detect price squeezes.",
        "schema": '{"volatility_compression_badge": {"bollinger_width": 0.0, "squeeze_detected": false}}',
        "required_tools": ["query_quant_database"]
    },
    "volume_surge_trigger_card": {
        "description": "Numeric highlight showing today's trading volume relative to its 30-day average. Highlights accumulation or distribution.",
        "schema": '{"volume_surge_trigger_card": {"current_volume": 0, "avg_30d_volume": 0, "surge_ratio": 0.0}}',
        "required_tools": ["query_quant_database"]
    },
    "technical_setup_synthesis": {
        "description": "Sharp, concise summary card highlighting trend direction based on price action and moving averages.",
        "schema": '{"technical_setup_synthesis": {"trend": "STR", "summary": "STR"}}',
        "required_tools": ["fetch_macro_context", "query_quant_database"]
    },
    "absolute_price_drawdown_tracker": {
        "description": "Clean mini-bar chart tracking depth of correction from 52-week highs (peak-to-trough).",
        "schema": '{"absolute_price_drawdown_tracker": {"high_52w": 0.0, "current_price": 0.0, "drawdown_pct": 0.0}}',
        "required_tools": ["query_quant_database"]
    },
    "average_true_range_risk_bracket": {
        "description": "Informative block detailing daily expected trading ranges based on ATR standard deviation volatility.",
        "schema": '{"average_true_range_risk_bracket": {"atr_14": 0.0, "daily_expected_range_pct": 0.0}}',
        "required_tools": ["query_quant_database"]
    },
    "trading_horizon_blueprint": {
        "description": "Dark glassmorphic card presenting explicit Stop-Loss and Tactical Entry thresholds for active traders.",
        "schema": '{"trading_horizon_blueprint": {"stop_loss": 0.0, "entry_range": "STR", "target": 0.0}}',
        "required_tools": ["query_quant_database", "fetch_macro_context"]
    },

    # Category 3: Live Market Intelligence & Catalyst Feeds
    "corporate_news_timeline": {
        "description": "Vertical chronological feed card aggregating breaking news, headlines, and company announcements.",
        "schema": '{"corporate_news_timeline": [{"date": "STR", "headline": "STR", "url": "STR"}]}',
        "required_tools": ["fetch_macro_context"]
    },
    "earnings_sentiment_shift_indicator": {
        "description": "Muted card featuring a directional arrow badge scoring tone changes in the most recent management earnings call.",
        "schema": '{"earnings_sentiment_shift_indicator": {"shift_direction": "POSITIVE|NEGATIVE|NEUTRAL", "reasoning": "STR"}}',
        "required_tools": ["fetch_macro_context"]
    },
    "institutional_analyst_adjustments": {
        "description": "Borderless tracking ledger displaying broker names, analyst upgrades, downgrades, and price target changes.",
        "schema": '{"institutional_analyst_adjustments": [{"broker": "STR", "action": "STR", "old_target": 0.0, "new_target": 0.0}]}',
        "required_tools": ["fetch_macro_context"]
    },
    "corporate_action_alert_core": {
        "description": "Bulleted card showing pending structural events like stock splits, mergers, dividends, or spin-offs.",
        "schema": '{"corporate_action_alert_core": [{"event_type": "STR", "date": "STR", "details": "STR"}]}',
        "required_tools": ["fetch_macro_context"]
    },
    "regulatory_compliance_bulletin": {
        "description": "High-visibility warning card mapping sector-wide legal actions, lawsuits, policy changes, or fines.",
        "schema": '{"regulatory_compliance_bulletin": [{"issue": "STR", "severity": "HIGH|MEDIUM|LOW", "impact": "STR"}]}',
        "required_tools": ["fetch_macro_context"]
    },
    "product_disruption_risk_radar": {
        "description": "Sharp descriptive text block evaluating industry alternatives, tech disruption, and competitor market share threats.",
        "schema": '{"product_disruption_risk_radar": {"threats": ["STR"], "analysis": "STR"}}',
        "required_tools": ["fetch_macro_context"]
    },
    "sector_macro_headwinds_overview": {
        "description": "Compact text summary block evaluating macro constraints like supply chain shifts, input cost inflation, or tariffs.",
        "schema": '{"sector_macro_headwinds_overview": {"headwinds": ["STR"], "summary": "STR"}}',
        "required_tools": ["fetch_macro_context"]
    },
    "management_guidance_tracking_ledger": {
        "description": "Two-column table comparing original corporate goals against actual execution results from transcripts.",
        "schema": '{"management_guidance_tracking_ledger": [{"metric": "STR", "guided": "STR", "actual": "STR", "status": "STR"}]}',
        "required_tools": ["fetch_macro_context"]
    },
    "social_media_buzz_frequency_tracker": {
        "description": "Modern line graph tracing retail chatter volume, sentiment trends, and social media mentions.",
        "schema": '{"social_media_buzz_frequency_tracker": [{"date": "STR", "mention_volume": 0, "sentiment_score": 0.0}]}',
        "required_tools": ["fetch_macro_context"]
    },
    "mergers_and_acquisitions_catalyst_brief": {
        "description": "Segmented analysis block tracing corporate deal rationales and critiques of pending M&A activity.",
        "schema": '{"mergers_and_acquisitions_catalyst_brief": {"deals": [{"target": "STR", "value": "STR", "strategic_rationale": "STR"}]}}',
        "required_tools": ["fetch_macro_context"]
    },

    # Category 4: Ownership Dynamics, Flow & Forensics
    "institutional_accumulation_trend": {
        "description": "Horizontal bar metric representing institutional capital flows, buying, or selling by mutual funds and FIIs.",
        "schema": '{"institutional_accumulation_trend": {"net_flow_str": "STR", "trend": "STR"}}',
        "required_tools": ["query_quant_database"]
    },
    "insider_transaction_tracking_ledger": {
        "description": "Clean, borderless data table mapping executive buy and sell trades, promoter activity, and insider transactions.",
        "schema": '{"insider_transaction_tracking_ledger": [{"insider_name": "STR", "transaction_type": "BUY|SELL", "shares": 0, "price": 0.0}]}',
        "required_tools": ["query_quant_database"]
    },
    "retail_investor_liquidation_index": {
        "description": "Minimal numeric indicator scoring absorption rates and retail exiting to institutional block buyers.",
        "schema": '{"retail_investor_liquidation_index": {"liquidation_score": 0.0, "status": "STR"}}',
        "required_tools": ["query_quant_database"]
    },
    "promoter_pledge_delta_alert": {
        "description": "High-visibility metrics indicator displaying ownership risk changes and shares pledged by founders.",
        "schema": '{"promoter_pledge_delta_alert": {"pledged_pct": 0.0, "change_pct": 0.0, "risk_level": "STR"}}',
        "required_tools": ["query_quant_database"]
    },
    "tax_divergence_discrepancy_card": {
        "description": "Minimalist warning block showing reporting misalignments between book profit and actual cash tax paid.",
        "schema": '{"tax_divergence_discrepancy_card": {"book_tax_rate": 0.0, "cash_tax_rate": 0.0, "discrepancy_flag": false}}',
        "required_tools": ["query_quant_database"]
    },
    "quantitative_earnings_quality_scorecard": {
        "description": "Clean metric rating tracking earnings manipulations, accruals, and cash flow conversions (QES score).",
        "schema": '{"quantitative_earnings_quality_scorecard": {"qes_score": 0.0, "quality_tier": "STR", "flags": ["STR"]}}',
        "required_tools": ["query_quant_database"]
    },
    "shap_global_feature_driver_plot": {
        "description": "Recharts horizontal bar chart mapping machine learning feature attributions explaining the alpha projection.",
        "schema": '{"shap_global_feature_driver_plot": [{"feature": "STR", "contribution": 0.0}]}',
        "required_tools": ["query_quant_database"]
    },
    "block_deal_activity_matrix": {
        "description": "Standard table tracking high-volume block transactions, bulk deals, and dark pool exchanges.",
        "schema": '{"block_deal_activity_matrix": [{"date": "STR", "buyer_seller": "STR", "volume": 0, "price": 0.0}]}',
        "required_tools": ["query_quant_database"]
    },
    "short_interest_float_tracker": {
        "description": "Progress fill bar showing short positions relative to float, days to cover, and short squeeze potential.",
        "schema": '{"short_interest_float_tracker": {"short_pct_of_float": 0.0, "days_to_cover": 0.0, "squeeze_risk": "STR"}}',
        "required_tools": ["query_quant_database"]
    },
    "forensic_accounting_synthesis": {
        "description": "Concise summary card outlining balance sheet anomalies, red flags, and translation of forensic risks.",
        "schema": '{"forensic_accounting_synthesis": {"red_flags": ["STR"], "summary": "STR"}}',
        "required_tools": ["query_quant_database", "fetch_macro_context"]
    },

    # Category 5: Peer Metrics, Macro Stress & Portfolio Strategy
    "macro_rate_hike_impact_card": {
        "description": "Muted border card with risk label modeling causal scenario impact of a +50bps central bank interest rate hike.",
        "schema": '{"macro_rate_hike_impact_card": {"impact_score": "STR", "justification": "STR"}}',
        "required_tools": ["fetch_macro_context"]
    },
    "market_liquidity_shock_analysis": {
        "description": "Muted border card modeling microstructure liquidity metrics and asset resilience during a flash crash.",
        "schema": '{"market_liquidity_shock_analysis": {"resilience_score": "STR", "justification": "STR"}}',
        "required_tools": ["query_quant_database"]
    },
    "supply_chain_geographic_revenue_map": {
        "description": "Clean metric card listing country exposure percentages and geographic revenue segmentation.",
        "schema": '{"supply_chain_geographic_revenue_map": [{"region": "STR", "revenue_pct": 0.0}]}',
        "required_tools": ["query_quant_database"]
    },
    "input_cost_shock_resilience_indicator": {
        "description": "Scenario modeling analyzing exposure to global raw material inflation and commodity price spikes.",
        "schema": '{"input_cost_shock_resilience_indicator": {"resilience_score": "STR", "justification": "STR"}}',
        "required_tools": ["fetch_macro_context"]
    },
    "cross_sectional_peer_multiples_table": {
        "description": "Borderless financial table mapping the target stock against direct competitors (P/E, P/B, EV/EBITDA).",
        "schema": '{"cross_sectional_peer_multiples_table": [{"ticker": "STR", "pe_ratio": 0.0, "pb_ratio": 0.0}]}',
        "required_tools": ["query_quant_database"]
    },
    "sector_alpha_dominance_chart": {
        "description": "Recharts comparative bar graph mapping competitive alpha rankings and multi-factor models across the sector.",
        "schema": '{"sector_alpha_dominance_chart": [{"ticker": "STR", "alpha_score": 0.0}]}',
        "required_tools": ["query_quant_database"]
    },
    "beta_and_systematic_correlation_index": {
        "description": "Numeric data block displaying standard market coefficients (Beta, Correlation) relative to the broad index.",
        "schema": '{"beta_and_systematic_correlation_index": {"beta": 0.0, "correlation": 0.0}}',
        "required_tools": ["query_quant_database"]
    },
    "executive_leadership_stability_tracker": {
        "description": "Informative typography block tracing recent key leadership changes (CEO, CFO departures).",
        "schema": '{"executive_leadership_stability_tracker": [{"role": "STR", "name": "STR", "status": "STR", "tenure_years": 0.0}]}',
        "required_tools": ["fetch_macro_context"]
    },
    "adversarial_bear_thesis_breakdown": {
        "description": "Deep textual review presenting core downside risks and counter-arguments challenging the primary investment thesis.",
        "schema": '{"adversarial_bear_thesis_breakdown": {"thesis": "STR", "key_risks": ["STR"]}}',
        "required_tools": ["fetch_macro_context"]
    },
    "definitive_execution_roadmap": {
        "description": "Ordered typography layout detailing exact portfolio adjustment suggestions, buy/sell rules, and final instructions.",
        "schema": '{"definitive_execution_roadmap": {"action": "STR", "steps": ["STR"]}}',
        "required_tools": ["query_quant_database", "fetch_macro_context"]
    },
    
    # Keeping Narrative Insight for generic textual responses
    "narrative_insight": {
        "description": "Clean text card for generic explanations, simple conversational Q&A, and direct prose answers to general questions not covered by specific metrics.",
        "schema": '{"narrative_insight": {"text": "STR"}}',
        "required_tools": ["fetch_macro_context", "query_quant_database"]
    }
}

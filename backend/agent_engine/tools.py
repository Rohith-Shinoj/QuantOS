import os
import json
import duckdb
from langchain_core.tools import tool
from langchain_community.tools.tavily_search import TavilySearchResults

@tool
def query_quant_database(ticker: str) -> str:
    """
    Connects to the proprietary DuckDB quantitative database.
    Fetches fundamental factors, momentum signals, forensic flags, and ML-generated alpha scores.
    Use this tool to get the hard math and quantitative profile of a stock.
    Accepts either an exact ticker (e.g. 'AAPL', 'HAL') or a company name.
    """
    try:
        # Correct path mapping to project root
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        db_path = os.path.join(project_root, "datasets", "A", "market_data.duckdb")
        
        # Connect read-only to avoid locking issues
        con = duckdb.connect(db_path, read_only=True)
        query = """
            SELECT 
                ticker, 
                name, 
                industry,
                market_cap,
                pe_ratio,
                rs_rating,
                inst_accum,
                volatility_squeeze,
                qes_flag,
                alpha_score,
                pledge_delta,
                tax_divergence,
                shap_reason_1,
                shap_reason_2,
                absolute_data
            FROM stocks
            WHERE ticker = ? OR name ILIKE ?
        """
        result = con.execute(query, [ticker.upper(), f"%{ticker}%"]).fetchone()
        
        if not result:
            con.close()
            return f"Error: Ticker or company name '{ticker}' not found in quantitative database."
            
        columns = [
            "ticker", "name", "industry", "market_cap", "pe_ratio", "rs_rating", 
            "inst_accum", "volatility_squeeze", "qes_flag", "alpha_score", 
            "pledge_delta", "tax_divergence", "shap_reason_1", "shap_reason_2", "absolute_data"
        ]
        
        data = dict(zip(columns, result))
        
        if data.get("absolute_data"):
            import json as pyjson
            try:
                abs_data = pyjson.loads(data["absolute_data"])
                data["pb_ratio"] = abs_data.get("pbRatio", 0.0)
                data["ev_ebitda"] = abs_data.get("evToEbitda", 0.0)
                data["price_sales"] = abs_data.get("priceToSales", 0.0)
            except Exception:
                pass
        
        if "absolute_data" in data:
            del data["absolute_data"]
        
        # Fetch peer comps for the same industry
        peer_query = """
            SELECT ticker, alpha_score, pe_ratio, absolute_data,
                   CASE WHEN pe_ratio < ? THEN 'UNDERVALUED' ELSE 'OVERVALUED' END as valuation_status
            FROM stocks 
            WHERE industry = ? AND ticker != ?
            ORDER BY alpha_score DESC 
            LIMIT 3
        """
        peers = con.execute(peer_query, [data["pe_ratio"] if data["pe_ratio"] else 0, data["industry"], ticker.upper()]).fetchall()
        con.close()
        
        peer_list = []
        import json as pyjson
        for p in peers:
            peer_dict = {"ticker": p[0], "alpha_score": p[1], "pe_ratio": p[2], "valuation_status": p[4]}
            if p[3]:
                try:
                    abs_data = pyjson.loads(p[3])
                    peer_dict["pb_ratio"] = abs_data.get("pbRatio", 0.0)
                except Exception:
                    peer_dict["pb_ratio"] = 0.0
            else:
                peer_dict["pb_ratio"] = 0.0
            peer_list.append(peer_dict)
            
        data["peer_comps"] = peer_list
        
        # Format a nice string for the LLM
        return json.dumps(data, indent=2)
        
    except Exception as e:
        return f"Database Query Error: {str(e)}"

@tool
def fetch_macro_context(ticker: str) -> str:
    """
    Fetches real-time macro-economic context, breaking news, and recent earnings call sentiment from the web.
    Use this tool to find qualitative reasons why a stock might be moving.
    """
    try:
        # Ensure TAVILY_API_KEY is set in environment, otherwise LangChain will throw an error
        if not os.environ.get("TAVILY_API_KEY"):
            return "Error: TAVILY_API_KEY not found in environment."
            
        search_tool = TavilySearchResults(max_results=3, search_depth="advanced")
        # Explicitly append "India NSE BSE" to prevent confusing with US tickers like Halliburton
        query = f"{ticker} stock news India NSE BSE"
        results = search_tool.invoke({"query": query})
        
        # Format the results into a readable string
        formatted_results = f"Web Search Results for {ticker} (India):\n"
        for i, res in enumerate(results):
            formatted_results += f"\n--- Source {i+1} ---\n"
            formatted_results += f"Content: {res.get('content', 'No content')}\n"
            
        return formatted_results
        
    except Exception as e:
        return f"Web Search Error: {str(e)}"

@tool
def execute_duckdb_query(query: str) -> str:
    """
    Executes an arbitrary SQL SELECT query against the DuckDB market_data database.
    Use this tool when you need to answer complex, multi-asset questions or cross-reference performance over time (e.g., "Which stocks grew more than 10% during a NIFTY crash?").
    
    IMPORTANT RULES:
    1. The query MUST be a SELECT statement. No INSERT/UPDATE/DELETE.
    2. A LIMIT 100 will be automatically applied if you don't provide a smaller limit.
    3. Use the following schema to construct your queries:
    
    SCHEMA DDL:
    -- Core Stock Fundamentals
    CREATE TABLE stocks (
        slug VARCHAR, ticker VARCHAR, name VARCHAR, market_cap_type VARCHAR, market_cap DOUBLE, pe_ratio DOUBLE,
        day_change VARCHAR, industry VARCHAR, inst_accum DOUBLE, volatility_squeeze DOUBLE, qes_flag INTEGER,
        tax_divergence DOUBLE, pledge_delta DOUBLE, absolute_data JSON, relative_data JSON, rs_rating DOUBLE, alpha_score DOUBLE
    );
    
    -- Daily Equities Timeseries (OLAP)
    CREATE TABLE daily_prices (
        ticker VARCHAR, date DATE, close DOUBLE, adj_close DOUBLE, volume DOUBLE
    );
    
    -- Daily Index Timeseries (OLAP)
    CREATE TABLE daily_index_prices (
        index_name VARCHAR, date DATE, close DOUBLE
    );
    
    -- Quarterly Fundamentals Timeseries (OLAP)
    CREATE TABLE quarterly_fundamentals (
        ticker VARCHAR, quarter_end_date DATE, revenue DOUBLE, net_profit DOUBLE, eps DOUBLE, roe DOUBLE, debt_to_equity DOUBLE, pe_ratio DOUBLE
    );
    
    -- Pre-calculated Advanced Ratios & CAGRs
    CREATE TABLE stock_metrics (
        ticker VARCHAR, roe DOUBLE, roic DOUBLE, debt_to_equity DOUBLE, dividend_yield DOUBLE, eps_ttm DOUBLE, pb_ratio DOUBLE, price_to_sales DOUBLE, peg_ratio DOUBLE, return_on_assets DOUBLE, ev_to_ebitda DOUBLE, revenue_3yr_cagr DOUBLE, revenue_5yr_cagr DOUBLE, profit_3yr_cagr DOUBLE, profit_5yr_cagr DOUBLE, net_worth_3yr_cagr DOUBLE
    );

    GOLDEN QUERY EXAMPLES:
    -- Example 1: Finding stocks that dropped during a specific date window
    SELECT ticker, MIN(adj_close) as min_p, MAX(adj_close) as max_p FROM daily_prices WHERE date >= '2020-02-01' AND date <= '2020-11-01' GROUP BY ticker HAVING (max_p - min_p) / max_p < -0.2;
    
    -- Example 2: Checking ROE from snapshot json data
    SELECT ticker, CAST(absolute_data->>'$.roe' AS DOUBLE) as roe FROM stocks WHERE CAST(absolute_data->>'$.roe' AS DOUBLE) > 15;
    
    -- Example 3: Cross-asset ASOF join to compare stock vs Nifty on a specific date
    SELECT s.ticker, s.date, s.close as stock_price, i.close as nifty_price
    FROM daily_prices s
    ASOF JOIN daily_index_prices i ON s.date >= i.date AND i.index_name = 'NIFTY50'
    WHERE s.date = '2023-01-05' AND s.ticker = 'HDFC';
    """
    try:
        if not query.strip().upper().startswith("SELECT") and not query.strip().upper().startswith("WITH"):
            return "Error: Only SELECT queries are permitted for safety reasons."
            
        # Ensure LIMIT 100 if no explicit limit exists
        if "LIMIT" not in query.upper():
            query = f"{query}\nLIMIT 100"
            
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        db_path = os.path.join(project_root, "datasets", "A", "market_data.duckdb")
        con = duckdb.connect(db_path, read_only=True)
        
        # Execute query
        results = con.execute(query).fetchall()
        columns = [desc[0] for desc in con.description]
        con.close()
        
        if not results:
            return "Query executed successfully but returned 0 rows."
            
        # Format as string
        formatted = " | ".join(columns) + "\n" + "-" * 50 + "\n"
        for row in results:
            formatted += " | ".join([str(val) for val in row]) + "\n"
            
        return formatted
        
    except Exception as e:
        return f"SQL Execution Error: {str(e)}"


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

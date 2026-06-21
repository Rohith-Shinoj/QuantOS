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
                shap_reason_2
            FROM stocks
            WHERE ticker = ?
        """
        result = con.execute(query, [ticker]).fetchone()
        
        if not result:
            con.close()
            return f"Error: Ticker {ticker} not found in quantitative database."
            
        columns = [
            "ticker", "name", "industry", "market_cap", "pe_ratio", "rs_rating", 
            "inst_accum", "volatility_squeeze", "qes_flag", "alpha_score", 
            "pledge_delta", "tax_divergence", "shap_reason_1", "shap_reason_2"
        ]
        
        data = dict(zip(columns, result))
        
        # Fetch peer comps for the same industry
        peer_query = """
            SELECT ticker, alpha_score, pe_ratio, 
                   CASE WHEN pe_ratio < ? THEN 'UNDERVALUED' ELSE 'OVERVALUED' END as valuation_status
            FROM stocks 
            WHERE industry = ? AND ticker != ?
            ORDER BY alpha_score DESC 
            LIMIT 3
        """
        peers = con.execute(peer_query, [data["pe_ratio"] if data["pe_ratio"] else 0, data["industry"], ticker]).fetchall()
        con.close()
        
        peer_list = [
            {"ticker": p[0], "alpha_score": p[1], "pe_ratio": p[2], "valuation_status": p[3]}
            for p in peers
        ]
        data["peer_comps"] = peer_list
        
        # Format a nice string for the LLM
        return json.dumps(data, indent=2)
        
    except Exception as e:
        return f"Database Query Error: {str(e)}"

@tool
def fetch_macro_context(ticker: str) -> str:
    """
    Fetches real-time macro-economic context, breaking news, and recent earnings call sentiment from the web.
    Use this tool to find qualitative reasons why a stock might be moving, or to check for red flags like CEO resignations.
    """
    try:
        # Ensure TAVILY_API_KEY is set in environment, otherwise LangChain will throw an error
        if not os.environ.get("TAVILY_API_KEY"):
            return "Error: TAVILY_API_KEY not found in environment."
            
        search_tool = TavilySearchResults(max_results=3, search_depth="advanced")
        query = f"{ticker} stock news earnings sentiment macro headwinds"
        results = search_tool.invoke({"query": query})
        
        # Format the results into a readable string
        formatted_results = f"Web Search Results for {ticker}:\n"
        for i, res in enumerate(results):
            formatted_results += f"\n--- Source {i+1} ---\n"
            formatted_results += f"Content: {res.get('content', 'No content')}\n"
            
        return formatted_results
        
    except Exception as e:
        return f"Web Search Error: {str(e)}"

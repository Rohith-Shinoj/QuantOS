import os
import re
import duckdb
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.realpath(os.path.join(BASE_DIR, "datasets/A/market_data.duckdb"))

class ScreenerQuery(BaseModel):
    query: str
    start_date: str = None
    end_date: str = None

def parse_ast_to_sql(query: str, start_date: str, end_date: str) -> tuple[str, list[str]]:
    if not start_date: start_date = '2025-01-01'
    if not end_date: end_date = '2026-06-26'
        
    sql_conditions = []
    select_columns = {
        'CMP': 'p_end.adj_close as CMP',
        'PE': 's.pe_ratio as PE',
        'MarCap': 's.market_cap as MarCap',
    }
    
    conditions = [c.strip() for c in re.split(r'\s+AND\s+', query, flags=re.IGNORECASE) if c.strip()]
    
    for cond in conditions:
        op_match = re.search(r'(<|>|<=|>=|=)\s*([\d.-]+)%?', cond)
        if not op_match:
            raise ValueError(f"Missing valid operator (<, >, =, etc.) or number in condition: {cond}")
        op, val = op_match.groups()
        
        cond_upper = cond.upper()
        
        # Most Used
        if "MARKET CAPITALIZATION" in cond_upper:
            sql_conditions.append(f"s.market_cap {op} {val}")
        elif "CURRENT PRICE" in cond_upper:
            sql_conditions.append(f"p_end.adj_close {op} {val}")
        elif "PRICE TO EARNING" in cond_upper or "P/E" in cond_upper:
            sql_conditions.append(f"s.pe_ratio {op} {val}")
        elif "RETURN ON CAPITAL EMPLOYED" in cond_upper:
            sql_conditions.append(f"sm.roic {op} {val}")
            select_columns['ROCE'] = 'sm.roic as ROCE'
        elif "RETURN ON EQUITY" in cond_upper or "ROE" in cond_upper:
            sql_conditions.append(f"sm.roe {op} {val}")
            select_columns['ROE'] = 'sm.roe as ROE'
        elif "DEBT TO EQUITY" in cond_upper:
            sql_conditions.append(f"sm.debt_to_equity {op} {val}")
            select_columns['D/E'] = 'sm.debt_to_equity as "D/E"'
        elif "DIVIDEND YIELD" in cond_upper:
            sql_conditions.append(f"sm.dividend_yield {op} {val}")
            select_columns['DivYld'] = 'sm.dividend_yield as DivYld'
        elif "EPS" in cond_upper:
            sql_conditions.append(f"sm.eps_ttm {op} {val}")
            select_columns['EPS'] = 'sm.eps_ttm as EPS'
            
        # Historical
        elif "SALES GROWTH 3YEARS" in cond_upper:
            sql_conditions.append(f"(sm.revenue_3yr_cagr * 100) {op} {val}")
            select_columns['Sales_Gr_3Y'] = '(sm.revenue_3yr_cagr * 100) as Sales_Gr_3Y'
        elif "SALES GROWTH 5YEARS" in cond_upper:
            sql_conditions.append(f"(sm.revenue_5yr_cagr * 100) {op} {val}")
            select_columns['Sales_Gr_5Y'] = '(sm.revenue_5yr_cagr * 100) as Sales_Gr_5Y'
        elif "PROFIT GROWTH 3YEARS" in cond_upper:
            sql_conditions.append(f"(sm.profit_3yr_cagr * 100) {op} {val}")
            select_columns['Profit_Gr_3Y'] = '(sm.profit_3yr_cagr * 100) as Profit_Gr_3Y'
        elif "AVERAGE RETURN ON EQUITY 5YEARS" in cond_upper:
            # Fallback to general ROE if 5Y not explicitly parsed
            sql_conditions.append(f"sm.roe {op} {val}")
            select_columns['ROE_5Y'] = 'sm.roe as ROE_5Y'
        elif "RETURN OVER 1YEAR" in cond_upper:
            sql_conditions.append(f"((p_end.adj_close - p_start.adj_close) / p_start.adj_close * 100) {op} {val}")
            select_columns['1Y_Return'] = '((p_end.adj_close - p_start.adj_close) / p_start.adj_close * 100) as "1Y_Return"'
            
        # Ratios
        elif "RETURN ON ASSETS" in cond_upper:
            sql_conditions.append(f"sm.return_on_assets {op} {val}")
            select_columns['ROA'] = 'sm.return_on_assets as ROA'
        elif "PRICE TO BOOK VALUE" in cond_upper:
            sql_conditions.append(f"sm.pb_ratio {op} {val}")
            select_columns['P/B'] = 'sm.pb_ratio as "P/B"'
        elif "PRICE TO SALES" in cond_upper:
            sql_conditions.append(f"sm.price_to_sales {op} {val}")
            select_columns['P/S'] = 'sm.price_to_sales as "P/S"'
        elif "ENTERPRISE VALUE" in cond_upper:
            sql_conditions.append(f"sm.ev_to_ebitda {op} {val}")
            select_columns['EV/EBITDA'] = 'sm.ev_to_ebitda as "EV/EBITDA"'
        elif "PEG RATIO" in cond_upper:
            sql_conditions.append(f"sm.peg_ratio {op} {val}")
            select_columns['PEG'] = 'sm.peg_ratio as PEG'
            
        # Quarter P&L (Using quarterly_fundamentals CTE fallback)
        elif "SALES LATEST QUARTER" in cond_upper:
            sql_conditions.append(f"qf.revenue {op} {val}")
            select_columns['Qtr_Sales'] = 'qf.revenue as Qtr_Sales'
        elif "PROFIT AFTER TAX LATEST QUARTER" in cond_upper:
            sql_conditions.append(f"qf.net_profit {op} {val}")
            select_columns['Qtr_Profit'] = 'qf.net_profit as Qtr_Profit'
            
        # Legacy/Fallback
        elif "NIFTY RETURNS" in cond_upper:
            sql_conditions.append(f"((n_end.close - n_start.close) / n_start.close * 100) {op} {val}")
        elif "STOCK PRICE GROWTH" in cond_upper:
            sql_conditions.append(f"((p_end.adj_close - p_start.adj_close) / p_start.adj_close * 100) {op} {val}")
        else:
            raise ValueError(f"Unrecognized metric in condition: {cond}")

    where_clause = " AND ".join(sql_conditions) if sql_conditions else "1=1"
    
    # Construct SELECT fields
    select_str = ",\n            ".join(["s.ticker", "s.name as Name"] + list(select_columns.values()))
    
    final_sql = f"""
        WITH stock_start AS (
            SELECT ticker, adj_close FROM daily_prices WHERE date = (SELECT MAX(date) FROM daily_prices WHERE date <= '{start_date}')
        ),
        stock_end AS (
            SELECT ticker, adj_close FROM daily_prices WHERE date = (SELECT MAX(date) FROM daily_prices WHERE date <= '{end_date}')
        ),
        nifty_start AS (
            SELECT close FROM daily_index_prices WHERE index_name = 'NIFTY50' AND date = (SELECT MAX(date) FROM daily_index_prices WHERE date <= '{start_date}') LIMIT 1
        ),
        nifty_end AS (
            SELECT close FROM daily_index_prices WHERE index_name = 'NIFTY50' AND date = (SELECT MAX(date) FROM daily_index_prices WHERE date <= '{end_date}') LIMIT 1
        ),
        fundamentals_start AS (
            SELECT ticker, revenue, net_profit, eps
            FROM quarterly_fundamentals q1
            WHERE quarter_end_date = (SELECT MAX(quarter_end_date) FROM quarterly_fundamentals q2 WHERE q1.ticker = q2.ticker AND quarter_end_date <= '{start_date}')
        )
        
        SELECT 
            {select_str}
        FROM stocks s
        JOIN stock_start p_start ON s.ticker = p_start.ticker
        JOIN stock_end p_end ON s.ticker = p_end.ticker
        LEFT JOIN stock_metrics sm ON s.ticker = sm.ticker
        LEFT JOIN fundamentals_start qf ON s.ticker = qf.ticker
        CROSS JOIN nifty_start n_start
        CROSS JOIN nifty_end n_end
        WHERE {where_clause}
        ORDER BY s.market_cap DESC
        LIMIT 100
    """
    
    return final_sql, list(['ticker', 'Name'] + list(select_columns.keys()))


@router.post("/api/screen/custom")
def run_custom_screen(req: ScreenerQuery):
    try:
        sql, display_cols = parse_ast_to_sql(req.query, req.start_date, req.end_date)
        
        con = duckdb.connect(DB_PATH, read_only=True)
        results = con.execute(sql).fetchall()
        columns = [desc[0] for desc in con.description]
        con.close()
        
        output = []
        for i, row in enumerate(results):
            row_dict = {"S.No.": i + 1}
            row_dict.update(dict(zip(columns, row)))
            output.append(row_dict)
            
        return {"status": "success", "data": output, "sql_executed": sql}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Execution Error: {str(e)}")


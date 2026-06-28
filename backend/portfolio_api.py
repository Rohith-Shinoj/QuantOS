import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTFOLIO_FILE = os.path.realpath(os.path.join(BASE_DIR, "datasets/active/portfolio.json"))

class Holding(BaseModel):
    slug: str
    type: str # 'STOCKS' or 'MUTUAL_FUNDS'
    units: float
    invested_amount: float
    holding_value: float = 0.0  # Current market value entered by user

class Portfolio(BaseModel):
    holdings: List[Holding]
    history: Optional[List[dict]] = None

def load_portfolio() -> dict:
    if os.path.exists(PORTFOLIO_FILE):
        try:
            with open(PORTFOLIO_FILE, 'r') as f:
                data = json.load(f)
                if 'holdings' not in data:
                    data['holdings'] = []
                if 'history' not in data:
                    data['history'] = []
                return data
        except Exception:
            pass
    return {"holdings": [], "history": []}

def save_portfolio(data: dict):
    os.makedirs(os.path.dirname(PORTFOLIO_FILE), exist_ok=True)
    with open(PORTFOLIO_FILE, 'w') as f:
        json.dump(data, f, indent=2)

@router.get("/")
def get_portfolio():
    return load_portfolio()

@router.post("/")
def update_portfolio(portfolio: Portfolio):
    try:
        data = load_portfolio()
        # Update holdings, keep history intact
        data["holdings"] = [h.dict() for h in portfolio.holdings]
        if portfolio.history is not None:
            data["history"] = portfolio.history
        save_portfolio(data)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

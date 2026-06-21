import os
import glob
import pandas as pd
import numpy as np
import duckdb
import joblib
import json
from xgboost import XGBRanker
from hmmlearn.hmm import GaussianHMM
from sklearn.impute import SimpleImputer
import warnings

# Suppress warnings for cleaner logs
warnings.filterwarnings('ignore')

class AdvancedQuantTrainer:
    def __init__(self, snapshot_dir="datasets/snapshots", model_dir="ml_engine/models"):
        self.snapshot_dir = snapshot_dir
        self.model_dir = model_dir
        os.makedirs(self.model_dir, exist_ok=True)
        
        self.fundamental_feats = ['pe_ratio', 'debt_to_equity', 'return_on_equity', 'net_profit_margin', 'equity_multiplier', 'sustainable_growth_rate', 'revenue_yoy', 'profit_yoy']
        self.momentum_feats = ['rs_rating', 'volatility_squeeze', 'inst_accum']
        self.forensic_feats = ['qes_flag', 'tax_divergence', 'pledge_delta']
        self.microstructure_feats = ['amihud_illiquidity']
        
        self.all_features = self.fundamental_feats + self.momentum_feats + self.forensic_feats + self.microstructure_feats

    def _compute_amihud(self, ohlcv_str):
        """
        Computes Amihud Illiquidity from OHLCV JSON string.
        Amihud = Mean(|R_t| / (Close_t * Volume_t))
        """
        if not ohlcv_str:
            return np.nan
        try:
            ohlcv = json.loads(ohlcv_str)
            if not ohlcv or len(ohlcv) < 2:
                return np.nan
                
            df = pd.DataFrame(ohlcv)
            # Ensure required columns exist
            if 'Close' not in df.columns or 'Volume' not in df.columns:
                return np.nan
                
            df['Return'] = df['Close'].pct_change()
            df = df.dropna()
            
            # Filter out zero volume to avoid division by zero
            df = df[df['Volume'] > 0]
            if len(df) == 0:
                return np.nan
                
            # Amihud Ratio = |Return| / (Price * Volume)
            df['Amihud'] = df['Return'].abs() / (df['Close'] * df['Volume'])
            
            # Scale it up for readability (e.g. * 10^6)
            return df['Amihud'].mean() * 1e6
        except Exception:
            return np.nan

    def build_panel(self):
        print("🔨 Constructing Advanced Historical Panel with Microstructure Factors...")
        files = sorted(glob.glob(os.path.join(self.snapshot_dir, "snapshot_*.parquet")))
        if len(files) < 2:
            print("⚠️ Insufficient snapshots for training (need at least 2 with ~1-year gap).")
            return None
            
        con = duckdb.connect(":memory:")
        
        for f in files:
            date_str = os.path.basename(f).replace("snapshot_", "").replace(".parquet", "")
            table_name = f"snap_{date_str.replace('-', '_')}"
            con.execute(f"CREATE TABLE {table_name} AS SELECT * FROM '{f}'")
            
        dates = [os.path.basename(f).replace("snapshot_", "").replace(".parquet", "") for f in files]
        training_frames = []
        
        for i in range(len(dates) - 1):
            t0 = dates[i]
            t0_date = pd.to_datetime(t0)
            t1 = None
            
            # Point-in-time matching: Find closest snapshot roughly 1 year ahead
            for d in dates[i+1:]:
                if (pd.to_datetime(d) - t0_date).days >= 300:
                    t1 = d
                    break
            
            if not t1: continue
            
            print(f"  - Extracting T0: {t0} paired with Forward T1: {t1}")
            t0_table = f"snap_{t0.replace('-', '_')}"
            t1_table = f"snap_{t1.replace('-', '_')}"
            
            query = f"""
                SELECT 
                    t0.slug,
                    '{t0}' as snapshot_date,
                    t0.pe_ratio,
                    CAST(json_extract_string(t0.relative_data, '$.normalized_fundamentals.debt_to_equity') AS DOUBLE) as debt_to_equity,
                    CAST(json_extract_string(t0.relative_data, '$.normalized_fundamentals.return_on_equity') AS DOUBLE) as return_on_equity,
                    CAST(json_extract_string(t0.relative_data, '$.normalized_fundamentals.net_profit_margin') AS DOUBLE) as net_profit_margin,
                    CAST(json_extract_string(t0.relative_data, '$.structural_capital_efficiency.equity_multiplier') AS DOUBLE) as equity_multiplier,
                    CAST(json_extract_string(t0.relative_data, '$.structural_capital_efficiency.sustainable_growth_rate') AS DOUBLE) as sustainable_growth_rate,
                    CAST(json_extract_string(t0.relative_data, '$.financial_growth_signals.revenue_yoy') AS DOUBLE) as revenue_yoy,
                    CAST(json_extract_string(t0.relative_data, '$.financial_growth_signals.profit_yoy') AS DOUBLE) as profit_yoy,
                    t0.rs_rating,
                    t0.volatility_squeeze,
                    t0.inst_accum,
                    t0.qes_flag,
                    t0.tax_divergence,
                    t0.pledge_delta,
                    json_extract_string(t0.absolute_data, '$.OHLCV') as ohlcv_str,
                    CAST(regexp_replace(json_extract_string(t0.absolute_data, '$.live price'), '[^0-9.]', '', 'g') AS DOUBLE) as price_t0,
                    CAST(regexp_replace(json_extract_string(t1.absolute_data, '$.live price'), '[^0-9.]', '', 'g') AS DOUBLE) as price_t1
                FROM {t0_table} t0
                LEFT JOIN {t1_table} t1 ON t0.slug = t1.slug
            """
            df = con.execute(query).df()
            
            # Require starting price to exist
            df = df.dropna(subset=['price_t0'])
            df = df[df['price_t0'] > 0]
            
            # FIX SURVIVORSHIP BIAS: If price_t1 is missing (delisted/bankrupt), fill with 0 so return is -1.0
            df['price_t1'] = df['price_t1'].fillna(0.0)
            
            # Calculate Microstructure factor: Amihud Illiquidity
            df['amihud_illiquidity'] = df['ohlcv_str'].apply(self._compute_amihud)
            
            # Forward 1Y Continuous Alpha (No binary conversion!)
            df['stock_return'] = (df['price_t1'] / df['price_t0']) - 1.0
            benchmark_return = df['stock_return'].median()
            df['forward_1y_alpha'] = df['stock_return'] - benchmark_return
            
            training_frames.append(df)
            
        con.close()
        
        if not training_frames:
            print("❌ No valid training pairs found.")
            return None
            
        full_panel = pd.concat(training_frames, ignore_index=True)
        
        # Missing data imputation specific to factor types
        full_panel['qes_flag'] = full_panel['qes_flag'].fillna(0)
        
        print(f"✅ Advanced Panel constructed with {len(full_panel)} samples.")
        return full_panel

    def train_hmm_regime(self, panel):
        print("🧠 Fitting Gaussian HMM Market Regime Overlay...")
        
        # We proxy market regime by looking at the cross-sectional median of volatility & returns per snapshot
        regime_data = panel.groupby('snapshot_date').agg({
            'volatility_squeeze': 'median',
            'stock_return': 'median',
            'rs_rating': 'median'
        }).sort_index()
        
        if len(regime_data) < 2:
            print("⚠️ Not enough distinct time periods to fit HMM.")
            return None
            
        # Fit a 2-state Gaussian HMM (e.g. Risk-On vs Risk-Off)
        # Drop or fill NaNs first
        regime_data = regime_data.ffill().bfill().fillna(0)
        X_hmm = regime_data[['volatility_squeeze', 'rs_rating']].values
        hmm_model = GaussianHMM(n_components=2, covariance_type="diag", n_iter=1000, random_state=42)
        hmm_model.fit(X_hmm)
        
        states = hmm_model.predict(X_hmm)
        regime_data['hmm_state'] = states
        
        print(f"✅ HMM Fitted. Found {len(set(states))} distinct regimes.")
        joblib.dump(hmm_model, os.path.join(self.model_dir, "advanced_hmm.pkl"))
        
        # Map regimes back to panel
        regime_map = regime_data['hmm_state'].to_dict()
        panel['hmm_state'] = panel['snapshot_date'].map(regime_map)
        
        return hmm_model

    def train_ltr_ranker(self, panel):
        print("🚀 Training Institutional XGBoost Ranker (LambdaMART) for Cross-Sectional Alpha...")
        
        # Sort panel by query ID (snapshot_date) which is strictly required by XGBRanker
        panel = panel.sort_values(by='snapshot_date')
        
        # Define Group sizes for LTR (number of items per snapshot date)
        groups = panel.groupby('snapshot_date').size().values
        
        # Prepare features and continuous target
        X = panel[self.all_features].copy()
        
        # XGBoost natively handles NaNs, but we can do a simple fallback
        X_imputed = X.fillna(X.median(numeric_only=True)).fillna(0)
        
        # LambdaMART requires integer relevance labels (e.g., 0 to 4 quintiles) instead of continuous floats
        # We will bin the forward_1y_alpha cross-sectionally per snapshot date
        panel['relevance'] = panel.groupby('snapshot_date')['forward_1y_alpha'].transform(
            lambda x: pd.qcut(x, q=5, labels=False, duplicates='drop')
        )
        # Fill any NaNs with the median rank (2)
        panel['relevance'] = panel['relevance'].fillna(2).astype(int)
        y = panel['relevance'].values
        
        # LambdaMART optimizes for Normalized Discounted Cumulative Gain (NDCG)
        ranker = XGBRanker(
            tree_method="hist",
            objective="rank:ndcg",
            n_estimators=150,
            learning_rate=0.05,
            max_depth=5,
            subsample=0.8,
            random_state=42
        )
        
        ranker.fit(
            X_imputed, 
            y, 
            group=groups,
            verbose=False
        )
        
        # Save model
        joblib.dump(ranker, os.path.join(self.model_dir, "advanced_ranker.pkl"))
        joblib.dump(self.all_features, os.path.join(self.model_dir, "advanced_features.pkl"))
        
        print("📈 Microstructure & Factor Importance (XGB Ranker):")
        for feat, imp in zip(self.all_features, ranker.feature_importances_):
            if imp > 0.01:
                print(f"    {feat}: {imp:.4f}")
                
        print("✅ Phase 4 Upgrades: LTR Model and HMM Regime Overlay persisted.")

if __name__ == "__main__":
    trainer = AdvancedQuantTrainer()
    panel = trainer.build_panel()
    if panel is not None:
        trainer.train_hmm_regime(panel)
        trainer.train_ltr_ranker(panel)

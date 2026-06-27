import os
import glob
import pandas as pd
import numpy as np
import duckdb
import joblib
from xgboost import XGBClassifier
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
import warnings
import json
from ml_engine.feature_extractor import calculate_macro_drawdown, calculate_liquidity_gates, winsorize_series, extract_forensics

warnings.filterwarnings('ignore')

class DualEngineTrainer:
    def __init__(self, snapshot_dir="datasets/snapshots", model_dir="ml_engine/models"):
        self.snapshot_dir = snapshot_dir
        self.model_dir = model_dir
        os.makedirs(self.model_dir, exist_ok=True)
        
        self.base_fundamental_feats = ['pe_ratio', 'debt_to_equity', 'return_on_equity', 'equity_multiplier', 'sustainable_growth_rate', 'revenue_yoy', 'profit_yoy', 'operating_profit_margin', 'net_profit_margin', 'discount_from_high']
        self.fundamental_feats = [f"{feat}_z" for feat in self.base_fundamental_feats]
        self.momentum_feats = ['rs_rating', 'volatility_squeeze', 'inst_accum']
        self.forensic_feats = ['z_score', 'm_score', 'f_score', 'qes_flag', 'tax_divergence', 'pledge_delta']

    def build_panels(self):
        print("Constructing Historical Panels for Dual Engines...")
        files = sorted(glob.glob(os.path.join(self.snapshot_dir, "snapshot_*.parquet")))
        if len(files) < 3: return None, None

        con = duckdb.connect(":memory:")
        for f in files:
            table_name = f"snap_{os.path.basename(f).replace('snapshot_', '').replace('.parquet', '').replace('-', '_')}"
            con.execute(f"CREATE TABLE {table_name} AS SELECT * FROM '{f}'")
            
        dates = [os.path.basename(f).replace("snapshot_", "").replace(".parquet", "") for f in files]
        
        cons_frames = []
        moon_frames = []
        
        from tqdm import tqdm
        for i in tqdm(range(1, len(dates) - 1), desc="Building Dual Panels"):
            t_minus1 = dates[i-1]
            t0 = dates[i]
            t0_date = pd.to_datetime(t0)
            t1 = None
            for d in dates[i+1:]:
                if (pd.to_datetime(d) - t0_date).days >= 300:
                    t1 = d
                    break
            if not t1: continue
            
            query = f"""
                SELECT 
                    t0.slug,
                    '{t0}' as snapshot_date,
                    t0.industry,
                    t0.pe_ratio,
                    CAST(json_extract_string(t0.absolute_data, '$.marketCap') AS DOUBLE) as market_cap,
                    CAST(json_extract_string(t0.relative_data, '$.normalized_fundamentals.debt_to_equity') AS DOUBLE) as debt_to_equity,
                    CAST(json_extract_string(t0.relative_data, '$.normalized_fundamentals.return_on_equity') AS DOUBLE) as return_on_equity,
                    CAST(json_extract_string(t0.relative_data, '$.structural_capital_efficiency.equity_multiplier') AS DOUBLE) as equity_multiplier,
                    CAST(json_extract_string(t0.relative_data, '$.structural_capital_efficiency.sustainable_growth_rate') AS DOUBLE) as sustainable_growth_rate,
                    CAST(json_extract_string(t0.relative_data, '$.financial_growth_signals.revenue_yoy') AS DOUBLE) as revenue_yoy,
                    CAST(json_extract_string(t0.relative_data, '$.financial_growth_signals.profit_yoy') AS DOUBLE) as profit_yoy,
                    CAST(json_extract_string(t0.absolute_data, '$.operatingProfitMargin') AS DOUBLE) as operating_profit_margin,
                    CAST(json_extract_string(t_minus1.absolute_data, '$.operatingProfitMargin') AS DOUBLE) as operating_profit_margin_tminus1,
                    CAST(json_extract_string(t0.absolute_data, '$.netProfitMargin') AS DOUBLE) as net_profit_margin,
                    t0.rs_rating,
                    t0.volatility_squeeze,
                    t0.inst_accum,
                    t0.qes_flag,
                    t0.tax_divergence,
                    t0.pledge_delta,
                    t_minus1.absolute_data as abs_tminus1,
                    t0.absolute_data as abs_t0,
                    json_extract_string(t0.absolute_data, '$.OHLCV') as ohlcv_t0,
                    json_extract_string(t1.absolute_data, '$.OHLCV') as ohlcv_t1
                FROM '{self.snapshot_dir}/snapshot_{t0}.parquet' t0
                JOIN '{self.snapshot_dir}/snapshot_{t1}.parquet' t1 ON t0.slug = t1.slug
                JOIN '{self.snapshot_dir}/snapshot_{t_minus1}.parquet' t_minus1 ON t0.slug = t_minus1.slug
            """
            df = con.execute(query).df()
            
            cons_idx = []
            moon_idx = []
            new_cols_cons = {'discount_from_high': [], 'm_score': [], 'z_score': [], 'f_score': [], 'max_return': [], 'max_dd': []}
            new_cols_moon = {'discount_from_high': [], 'm_score': [], 'z_score': [], 'f_score': [], 'max_return': [], 'max_dd': []}
            
            for idx, row in df.iterrows():
                # Extract max return and drawdown for targets
                ohlcv_1y = json.loads(row['ohlcv_t1']) if row['ohlcv_t1'] else []
                max_ret, max_dd = 0.0, 0.0
                if ohlcv_1y and len(ohlcv_1y) > 0:
                    closes = [float(c.get('Close', 0)) for c in ohlcv_1y[-252:] if c.get('Close')]
                    if len(closes) > 0:
                        p_start = closes[0]
                        if p_start > 0:
                            max_price = max(closes)
                            min_price = min(closes)
                            max_ret = (max_price - p_start) / p_start
                            max_dd = (p_start - min_price) / p_start
                
                discount = calculate_macro_drawdown(row['ohlcv_t0'])
                z_score, f_score = extract_forensics(row['abs_t0'], row['abs_tminus1'], row['industry'])
                m_score = -2.0 
                m_cap = row['market_cap'] if not pd.isna(row['market_cap']) else 0
                
                # --- Track 1: Conservative ---
                is_liquid_cons, _ = calculate_liquidity_gates(row['ohlcv_t0'], min_adtv=10000000, min_price=20.0)
                if is_liquid_cons and m_cap >= 5000 and discount >= 0.20 and z_score >= 1.81 and m_score <= -1.78 and f_score >= 6:
                    cons_idx.append(idx)
                    new_cols_cons['discount_from_high'].append(discount)
                    new_cols_cons['m_score'].append(m_score)
                    new_cols_cons['z_score'].append(z_score)
                    new_cols_cons['f_score'].append(f_score)
                    new_cols_cons['max_return'].append(max_ret)
                    new_cols_cons['max_dd'].append(max_dd)
                    
                # --- Track 2: Moonshot ---
                is_liquid_moon, _ = calculate_liquidity_gates(row['ohlcv_t0'], min_adtv=2500000, min_price=5.0)
                rev_yoy = row['revenue_yoy'] if not pd.isna(row['revenue_yoy']) else 0
                opm_t0 = row['operating_profit_margin'] if not pd.isna(row['operating_profit_margin']) else 0
                opm_t1 = row['operating_profit_margin_tminus1'] if not pd.isna(row['operating_profit_margin_tminus1']) else 0
                dOPM = opm_t0 - opm_t1
                rs = row['rs_rating'] if not pd.isna(row['rs_rating']) else 0
                
                if is_liquid_moon and m_cap <= 15000:
                    moon_idx.append(idx)
                    new_cols_moon['discount_from_high'].append(discount)
                    new_cols_moon['m_score'].append(m_score)
                    new_cols_moon['z_score'].append(z_score)
                    new_cols_moon['f_score'].append(f_score)
                    new_cols_moon['max_return'].append(max_ret)
                    new_cols_moon['max_dd'].append(max_dd)
                
            if cons_idx:
                df_cons = df.loc[cons_idx].copy()
                for col, vals in new_cols_cons.items(): df_cons[col] = vals
                df_cons['target'] = ((df_cons['max_return'] >= 0.25) & (df_cons['max_dd'] <= 0.20)).astype(int)
                cons_frames.append(df_cons)
                
            if moon_idx:
                df_moon = df.loc[moon_idx].copy()
                for col, vals in new_cols_moon.items(): df_moon[col] = vals
                df_moon['target'] = ((df_moon['max_return'] >= 1.50) & (df_moon['max_dd'] <= 0.45)).astype(int)
                moon_frames.append(df_moon)
            
        con.close()
        
        panel_cons, panel_moon = None, None
        
        if cons_frames:
            panel_cons = pd.concat(cons_frames, ignore_index=True)
            panel_cons['qes_flag'] = panel_cons['qes_flag'].fillna(0)
            for feat in self.base_fundamental_feats:
                if feat in panel_cons.columns:
                    panel_cons[feat] = winsorize_series(panel_cons[feat])
                    z_col = f"{feat}_z"
                    panel_cons[z_col] = panel_cons.groupby(['snapshot_date', 'industry'])[feat].transform(
                        lambda x: (x - x.mean()) / x.std() if x.std() > 0 else 0
                    )
                    panel_cons[z_col] = panel_cons[z_col].fillna(0)
            print(f"Conservative Panel constructed with {len(panel_cons)} elite setups.")
            
        if moon_frames:
            panel_moon = pd.concat(moon_frames, ignore_index=True)
            panel_moon['qes_flag'] = panel_moon['qes_flag'].fillna(0)
            for feat in self.base_fundamental_feats:
                if feat in panel_moon.columns:
                    panel_moon[feat] = winsorize_series(panel_moon[feat])
                    z_col = f"{feat}_z"
                    panel_moon[z_col] = panel_moon.groupby(['snapshot_date', 'industry'])[feat].transform(
                        lambda x: (x - x.mean()) / x.std() if x.std() > 0 else 0
                    )
                    panel_moon[z_col] = panel_moon[z_col].fillna(0)
            print(f"Moonshot Panel constructed with {len(panel_moon)} explosive setups.")
            
        return panel_cons, panel_moon

    def train_ensemble(self, X, y, track_name):
        print(f"\nTraining {track_name} Ensemble (4 Models)...")
        from sklearn.impute import SimpleImputer
        from sklearn.pipeline import Pipeline
        from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit
        from sklearn.base import clone
        
        X = X.sort_values('snapshot_date').reset_index(drop=True)
        y = y.loc[X.index]
        tscv = TimeSeriesSplit(n_splits=2) # Reduced splits to avoid errors on small moonshot datasets
        
        print("  - Optimizing Accountant (GBM)...")
        acc_pipe = Pipeline([
            ('imputer', SimpleImputer(strategy='median')),
            ('model', GradientBoostingClassifier(random_state=42))
        ])
        acc_params = {'model__n_estimators': [50], 'model__max_depth': [3], 'model__learning_rate': [0.1]}
        acc_search = RandomizedSearchCV(acc_pipe, acc_params, n_iter=1, cv=tscv, random_state=42)
        acc_search.fit(X[self.fundamental_feats], y)
        acc_best = acc_search.best_estimator_
        
        print("  - Optimizing Strategist (XGBoost)...")
        str_model = XGBClassifier(eval_metric='logloss', random_state=42)
        str_params = {'n_estimators': [100], 'max_depth': [4], 'learning_rate': [0.05]}
        str_search = RandomizedSearchCV(str_model, str_params, n_iter=1, cv=tscv, random_state=42)
        str_search.fit(X[self.momentum_feats], y)
        str_best = str_search.best_estimator_
        
        print("  - Optimizing Auditor (Random Forest)...")
        # For Auditor, we penalize based on track-specific drawdown risk
        risk_threshold = 0.20 if track_name == 'conservative' else 0.45
        y_risk = (X['max_dd'] > risk_threshold).astype(int) 
        
        aud_pipe = Pipeline([
            ('imputer', SimpleImputer(strategy='constant', fill_value=0)),
            ('model', RandomForestClassifier(random_state=42, class_weight="balanced"))
        ])
        aud_params = {'model__n_estimators': [100], 'model__max_depth': [5]}
        aud_search = RandomizedSearchCV(aud_pipe, aud_params, n_iter=1, cv=tscv, random_state=42)
        aud_search.fit(X[self.forensic_feats], y_risk)
        aud_best = aud_search.best_estimator_
        
        meta_feats = ['acc_prob', 'str_prob', 'aud_risk_prob', 'inst_accum', 'volatility_squeeze', 'discount_from_high', 'operating_profit_margin', 'net_profit_margin', 'f_score', 'z_score']
        meta_X = pd.DataFrame(index=X.index, columns=meta_feats, dtype=float)
        for feat in ['inst_accum', 'volatility_squeeze', 'discount_from_high', 'operating_profit_margin', 'net_profit_margin', 'f_score', 'z_score']:
            meta_X[feat] = X[feat]
            
        print("  - Generating OOF predictions for Meta-Learner...")
        for train_idx, test_idx in tscv.split(X):
            m_acc = clone(acc_best)
            m_acc.fit(X.iloc[train_idx][self.fundamental_feats], y.iloc[train_idx])
            meta_X.loc[X.index[test_idx], 'acc_prob'] = m_acc.predict_proba(X.iloc[test_idx][self.fundamental_feats])[:, 1]
            
            m_str = clone(str_best)
            m_str.fit(X.iloc[train_idx][self.momentum_feats], y.iloc[train_idx])
            meta_X.loc[X.index[test_idx], 'str_prob'] = m_str.predict_proba(X.iloc[test_idx][self.momentum_feats])[:, 1]
            
            m_aud = clone(aud_best)
            m_aud.fit(X.iloc[train_idx][self.forensic_feats], y_risk.iloc[train_idx])
            meta_X.loc[X.index[test_idx], 'aud_risk_prob'] = m_aud.predict_proba(X.iloc[test_idx][self.forensic_feats])[:, 1]
            
        valid_idx = meta_X['acc_prob'].dropna().index
        meta_X_clean = meta_X.loc[valid_idx]
        y_clean = y.loc[valid_idx]
        
        print(f"  - Training Meta-Learner ({track_name}) on Asymmetric Target...")
        meta_model = Pipeline([
            ('imputer', SimpleImputer(strategy='median')),
            ('model', LogisticRegression(class_weight='balanced', max_iter=1000))
        ])
        meta_model.fit(meta_X_clean, y_clean)
        
        joblib.dump(acc_best, os.path.join(self.model_dir, f"accountant_{track_name}.pkl"))
        joblib.dump(str_best, os.path.join(self.model_dir, f"strategist_{track_name}.pkl"))
        joblib.dump(aud_best, os.path.join(self.model_dir, f"auditor_{track_name}.pkl"))
        joblib.dump(meta_model, os.path.join(self.model_dir, f"meta_learner_{track_name}.pkl"))
        print(f"Saved {track_name} models.")

if __name__ == "__main__":
    trainer = DualEngineTrainer()
    p_cons, p_moon = trainer.build_panels()
    
    if p_cons is not None and not p_cons.empty:
        trainer.train_ensemble(p_cons, p_cons['target'], 'conservative')
        
    if p_moon is not None and not p_moon.empty:
        trainer.train_ensemble(p_moon, p_moon['target'], 'moonshot')

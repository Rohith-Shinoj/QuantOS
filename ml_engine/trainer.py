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

# Suppress annoying sklearn warnings
warnings.filterwarnings('ignore')

class QuantEnsembleTrainer:
    def __init__(self, snapshot_dir="datasets/snapshots", model_dir="ml_engine/models"):
        self.snapshot_dir = snapshot_dir
        self.model_dir = model_dir
        os.makedirs(self.model_dir, exist_ok=True)
        
        self.fundamental_feats = ['pe_ratio', 'debt_to_equity', 'return_on_equity', 'net_profit_margin', 'equity_multiplier', 'sustainable_growth_rate', 'revenue_yoy', 'profit_yoy']
        self.momentum_feats = ['rs_rating', 'volatility_squeeze', 'inst_accum']
        self.forensic_feats = ['qes_flag', 'tax_divergence', 'pledge_delta']

    def build_panel(self):
        print("🔨 Constructing Historical Panel and Forward Targets...")
        files = sorted(glob.glob(os.path.join(self.snapshot_dir, "snapshot_*.parquet")))
        if len(files) < 2:
            print("⚠️ Insufficient snapshots for training (need at least 2 with ~1-year gap).")
            return None, None

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
            
            # Find closest snapshot roughly 1 year ahead
            for d in dates[i+1:]:
                if (pd.to_datetime(d) - t0_date).days >= 300:
                    t1 = d
                    break
            
            if not t1: continue
            
            print(f"  - Pairing T0: {t0} with Target T1: {t1}")
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
                    CAST(regexp_replace(json_extract_string(t0.absolute_data, '$.live price'), '[^0-9.]', '', 'g') AS DOUBLE) as price_t0,
                    CAST(regexp_replace(json_extract_string(t1.absolute_data, '$.live price'), '[^0-9.]', '', 'g') AS DOUBLE) as price_t1
                FROM {t0_table} t0
                JOIN {t1_table} t1 ON t0.slug = t1.slug
            """
            df = con.execute(query).df()
            df = df.dropna(subset=['price_t0', 'price_t1'])
            df = df[df['price_t0'] > 0]
            
            # Forward 1Y Alpha calculation
            df['stock_return'] = (df['price_t1'] / df['price_t0']) - 1.0
            benchmark_return = df['stock_return'].median() # Dynamic benchmark
            df['forward_1y_alpha'] = df['stock_return'] - benchmark_return
            df['target'] = (df['forward_1y_alpha'] > 0.10).astype(int)
            
            training_frames.append(df)
            
        con.close()
        
        if not training_frames:
            print("❌ No valid training pairs found.")
            return None, None
            
        full_panel = pd.concat(training_frames, ignore_index=True)
        
        # DO NOT fillna(0) for everything. This creates a fake "0.0" signal for missing data.
        # XGBoost handles NaNs natively. We only fill categorical flags.
        full_panel['qes_flag'] = full_panel['qes_flag'].fillna(0)
        
        print(f"✅ Panel constructed with {len(full_panel)} samples.")
        return full_panel, full_panel['target']

    def train_committee(self, X, y):
        print("🚀 Training Committee of Experts with Hyperparameter Optimization...")
        
        from sklearn.impute import SimpleImputer
        from sklearn.pipeline import Pipeline
        from sklearn.model_selection import RandomizedSearchCV
        
        # 1. The Accountant (Fundamental GBM)
        print("  - Optimizing Accountant (GBM)...")
        acc_pipe = Pipeline([
            ('imputer', SimpleImputer(strategy='median')),
            ('model', GradientBoostingClassifier(random_state=42))
        ])
        acc_params = {
            'model__n_estimators': [50, 100, 200],
            'model__max_depth': [3, 4, 5],
            'model__learning_rate': [0.05, 0.1]
        }
        acc_search = RandomizedSearchCV(acc_pipe, acc_params, n_iter=5, cv=3, random_state=42)
        acc_search.fit(X[self.fundamental_feats], y)
        acc_best = acc_search.best_estimator_
        
        # 2. The Strategist (Momentum XGBoost)
        print("  - Optimizing Strategist (XGBoost)...")
        str_model = XGBClassifier(eval_metric='logloss', random_state=42)
        str_params = {
            'n_estimators': [100, 200],
            'max_depth': [4, 5, 6],
            'learning_rate': [0.01, 0.05, 0.1],
            'subsample': [0.8, 1.0]
        }
        str_search = RandomizedSearchCV(str_model, str_params, n_iter=5, cv=3, random_state=42)
        str_search.fit(X[self.momentum_feats], y)
        str_best = str_search.best_estimator_
        
        # 3. The Auditor (Forensic RF)
        print("  - Optimizing Auditor (Random Forest)...")
        y_risk = (X['forward_1y_alpha'] < -0.30).astype(int) # Predict severe crash (forensic event proxy)
        aud_pipe = Pipeline([
            ('imputer', SimpleImputer(strategy='constant', fill_value=0)),
            ('model', RandomForestClassifier(random_state=42, class_weight="balanced"))
        ])
        aud_params = {
            'model__n_estimators': [100, 200],
            'model__max_depth': [5, 6, 7]
        }
        aud_search = RandomizedSearchCV(aud_pipe, aud_params, n_iter=5, cv=3, random_state=42)
        aud_search.fit(X[self.forensic_feats], y_risk)
        aud_best = aud_search.best_estimator_
        
        # Meta-Learner preparation using Out-of-Fold (OOF) predictions to prevent leakage
        from sklearn.model_selection import cross_val_predict
        p_acc = cross_val_predict(acc_best, X[self.fundamental_feats], y, cv=3, method='predict_proba')[:, 1]
        p_str = cross_val_predict(str_best, X[self.momentum_feats], y, cv=3, method='predict_proba')[:, 1]
        p_aud = cross_val_predict(aud_best, X[self.forensic_feats], y_risk, cv=3, method='predict_proba')[:, 1]
        
        meta_X = pd.DataFrame({'acc_prob': p_acc, 'str_prob': p_str, 'aud_risk_prob': p_aud})
        
        print("  - Training Meta-Learner...")
        meta_model = LogisticRegression(class_weight='balanced')
        meta_model.fit(meta_X, y)
        
        # Persist
        joblib.dump(acc_best, os.path.join(self.model_dir, "accountant.pkl"))
        joblib.dump(str_best, os.path.join(self.model_dir, "strategist.pkl"))
        joblib.dump(aud_best, os.path.join(self.model_dir, "auditor.pkl"))
        joblib.dump(meta_model, os.path.join(self.model_dir, "meta_learner.pkl"))
        
        # Feature Pruning Diagnostic
        print("\n📈 Model Insight (Feature Importance):")
        importances = str_best.feature_importances_
        for feat, imp in zip(self.momentum_feats, importances):
            print(f"    {feat}: {imp:.4f}")
            
        print("✅ Phase 4: Committee optimized and persisted.")

if __name__ == "__main__":
    trainer = QuantEnsembleTrainer()
    X, y = trainer.build_panel()
    if X is not None:
        trainer.train_committee(X, y)

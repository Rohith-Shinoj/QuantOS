import React, { useState } from 'react';
import { ScreenerResultsTable } from '../components/ScreenerResultsTable';
import { Database, Play } from 'lucide-react';
import axios from 'axios';

// Categories mapping to Screener.in style
const RATIO_CATEGORIES = ['Most Used', 'Annual P&L', 'Quarter P&L', 'Balance Sheet', 'Cash Flow', 'Ratios', 'Price'];

const RATIOS = {
  'Most Used': {
    'RECENT': [
      { name: 'Market Capitalization', formula: 'Market Capitalization' },
      { name: 'Current price', formula: 'Current price' },
      { name: 'Price to Earning', formula: 'Price to Earning' },
      { name: 'Return on capital employed', formula: 'Return on capital employed' },
      { name: 'Return on equity', formula: 'Return on equity' },
      { name: 'Debt to equity', formula: 'Debt to equity' },
      { name: 'Dividend yield', formula: 'Dividend yield' },
      { name: 'EPS', formula: 'EPS' },
    ],
    'HISTORICAL': [
      { name: 'Sales growth 3Years', formula: 'Sales growth 3Years' },
      { name: 'Sales growth 5Years', formula: 'Sales growth 5Years' },
      { name: 'Profit growth 3Years', formula: 'Profit growth 3Years' },
      { name: 'Average return on equity 5Years', formula: 'Average return on equity 5Years' },
      { name: 'Return over 1year', formula: 'Return over 1year' },
    ]
  },
  'Quarter P&L': {
    'RECENT': [
      { name: 'Sales latest quarter', formula: 'Sales latest quarter' },
      { name: 'Profit after tax latest quarter', formula: 'Profit after tax latest quarter' },
      { name: 'YOY Quarterly sales growth', formula: 'YOY Quarterly sales growth' },
      { name: 'YOY Quarterly profit growth', formula: 'YOY Quarterly profit growth' },
    ],
    'HISTORICAL': []
  },
  'Ratios': {
    'RECENT': [
      { name: 'Return on assets', formula: 'Return on assets' },
      { name: 'Price to book value', formula: 'Price to book value' },
      { name: 'Price to Sales', formula: 'Price to Sales' },
      { name: 'Enterprise Value', formula: 'Enterprise Value' },
      { name: 'PEG Ratio', formula: 'PEG Ratio' },
    ],
    'HISTORICAL': []
  }
};

export const Screener = () => {
  const [query, setQuery] = useState(
    "Market Capitalization > 500 AND\nPrice to Earning < 15 AND\nReturn on capital employed > 22"
  );
  
  const [activeCategory, setActiveCategory] = useState('Most Used');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [results, setResults] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sqlExecuted, setSqlExecuted] = useState('');

  const runQuery = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const response = await axios.post('http://127.0.0.1:8000/api/screen/custom', {
        query,
      });
      setResults(response.data.data);
      setSqlExecuted(response.data.sql_executed);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'An error occurred while executing the query.');
    } finally {
      setIsLoading(false);
    }
  };

  const injectMetric = (formula: string) => {
    setQuery(prev => prev + (prev.trim() && !prev.endsWith('\n') ? ' AND\n' : '') + formula);
  };

  const renderRatios = () => {
    const categoryData = RATIOS[activeCategory as keyof typeof RATIOS] || { RECENT: [], HISTORICAL: [] };
    
    return (
      <div className="flex gap-12 mt-4 text-xs">
        <div className="flex-1">
          <h4 className="font-bold text-text-secondary uppercase tracking-widest text-[10px] mb-3">Recent</h4>
          <div className="flex flex-col gap-2">
            {categoryData.RECENT.map(r => (
              <button 
                key={r.name} 
                onClick={() => injectMetric(r.formula)}
                className="text-left py-1.5 px-3 border border-border rounded bg-surface hover:bg-surface-hover hover:border-alpha transition-colors text-text-primary truncate"
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-1">
          <h4 className="font-bold text-text-secondary uppercase tracking-widest text-[10px] mb-3">Preceding</h4>
          <div className="flex flex-col gap-2">
             {/* Empty preceding column matching the screenshot structure */}
          </div>
        </div>
        
        <div className="flex-1">
          <h4 className="font-bold text-text-secondary uppercase tracking-widest text-[10px] mb-3">Historical</h4>
          <div className="flex flex-col gap-2">
            {categoryData.HISTORICAL?.map(r => (
              <button 
                key={r.name} 
                onClick={() => injectMetric(r.formula)}
                className="text-left py-1.5 px-3 border border-border rounded bg-surface hover:bg-surface-hover hover:border-alpha transition-colors text-text-primary truncate"
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 w-full flex flex-col h-full bg-canvas text-text-primary overflow-y-auto">
      <div className="mb-6 flex justify-between items-center border-b border-border pb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Database size={20} className="text-alpha" /> Create new screen
        </h2>
      </div>

      <div className="bg-surface rounded border border-border p-5 mb-8">
        <h3 className="font-bold text-sm mb-2 text-text-primary">Search Query</h3>
        <p className="text-xs text-text-secondary mb-4">You can customize the query below:</p>
        
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1">
            <h4 className="text-xs font-semibold mb-2">Query</h4>
            <div className="border border-border rounded bg-canvas overflow-hidden">
              <textarea
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full h-[180px] p-4 bg-transparent text-sm font-mono text-text-primary focus:outline-none resize-none leading-relaxed"
                spellCheck="false"
              />
            </div>
            {errorMsg && (
              <div className="mt-3 p-3 bg-beta/10 border border-beta text-beta text-xs rounded">
                {errorMsg}
              </div>
            )}
            
            <div className="mt-4 flex items-center gap-3">
              <button 
                onClick={runQuery}
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2 bg-alpha text-canvas font-bold text-xs rounded hover:bg-alpha/90 transition-colors disabled:opacity-50"
              >
                {isLoading ? <span className="animate-spin text-sm">⟳</span> : <Play size={14} />} 
                RUN THIS QUERY
              </button>
            </div>
          </div>
          
          <div className="w-full lg:w-80 border border-border rounded p-4 bg-canvas/50">
            <h4 className="text-sm font-bold mb-3">Custom query example</h4>
            <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap leading-relaxed">
Market capitalization &gt; 500 AND
Price to earning &lt; 15 AND
Return on capital employed &gt; 22%
            </pre>
            <a href="#" className="text-alpha text-xs mt-4 inline-block hover:underline">Detailed guide on creating screens</a>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded border border-border p-5 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-lg text-text-primary">Ratio Gallery</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-text-primary">Search ratio</span>
            <input 
              type="text" 
              placeholder="eg. sales" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border border-border rounded bg-canvas text-xs px-3 py-1.5 focus:outline-none focus:border-alpha text-text-primary w-48"
            />
          </div>
        </div>
        
        {/* Gallery Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-border pb-px mb-4">
          {RATIO_CATEGORIES.map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-2 text-xs font-semibold rounded-t transition-colors ${
                activeCategory === category 
                  ? 'bg-alpha/10 text-alpha border-b-2 border-alpha' 
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
        
        {/* Ratio Grid */}
        {renderRatios()}
        
        <div className="mt-8 pt-4 border-t border-border text-xs text-text-secondary flex gap-1">
          Can't find the ratio you want? You can <a href="#" className="text-alpha hover:underline">create a new ratio.</a>
        </div>
      </div>

      {sqlExecuted && (
        <div className="bg-[#0D1117] border border-border rounded p-4 mb-8">
          <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2">DuckDB SQL Executed</h4>
          <pre className="text-xs text-text-secondary font-mono overflow-x-auto whitespace-pre-wrap">{sqlExecuted}</pre>
        </div>
      )}

      {(results !== null || isLoading) && (
        <ScreenerResultsTable data={results || []} isLoading={isLoading} />
      )}
    </div>
  );
};

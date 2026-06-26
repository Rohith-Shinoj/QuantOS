import React from 'react';
import { Layers, HelpCircle } from 'lucide-react';

export const AssetAllocationCard = ({ fund }: { fund: any }) => {
  // Determine Style Box Highlight
  let sizeIndex = 0; // 0: Large, 1: Mid, 2: Small
  let styleIndex = 1; // 0: Value, 1: Blend, 2: Growth
  
  const subCat = (fund.sub_category || '').toLowerCase();
  const name = (fund.scheme_name || '').toLowerCase();
  
  if (subCat.includes('small') || name.includes('small')) sizeIndex = 2;
  else if (subCat.includes('mid') || name.includes('mid')) sizeIndex = 1;
  else if (subCat.includes('large') || name.includes('large')) sizeIndex = 0;
  
  if (name.includes('value') || name.includes('contra')) styleIndex = 0;
  else if (name.includes('growth') || name.includes('momentum') || subCat.includes('growth')) styleIndex = 2;

  // Determine Equity/Debt/Cash split procedurally for mockup if not in DB
  const cat = (fund.category || '').toLowerCase();
  let equity = 0, debt = 0, cash = 0;
  
  if (cat.includes('equity')) { equity = 94.2; cash = 5.8; }
  else if (cat.includes('debt')) { debt = 96.5; cash = 3.5; }
  else if (cat.includes('hybrid')) { equity = 65.4; debt = 28.1; cash = 6.5; }
  else { equity = 90; cash = 10; } // Fallback

  const total = equity + debt + cash;
  
  // SVG Donut Math
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const eqOffset = 0;
  const eqLength = (equity / total) * circumference;
  const debtOffset = eqLength;
  const debtLength = (debt / total) * circumference;
  const cashOffset = debtOffset + debtLength;
  const cashLength = (cash / total) * circumference;

  return (
    <div className="bg-[#111114] border border-white/5 p-5 rounded-xl flex flex-col justify-between h-full overflow-hidden">
      <h3 className="text-sm font-semibold text-text-primary mb-6 flex items-center gap-1.5 shrink-0 group relative w-fit cursor-help">
        Asset Allocation & Style Box <HelpCircle size={14} className="text-text-secondary hover:text-white transition-colors" />
        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 bg-[#1a1a24] text-white text-[10px] p-2 rounded shadow-xl z-50 normal-case tracking-normal border border-white/10 font-normal leading-relaxed">
          Morningstar-style 9-grid box classifying the fund's investment style, alongside the actual asset class split.
        </div>
      </h3>

      <div className="flex-1 flex flex-col gap-6">
        {/* Style Box Grid */}
        <div className="flex flex-col w-full">
          <div className="flex w-full justify-between pl-12 text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2">
            <span className="w-1/3 text-center">Value</span>
            <span className="w-1/3 text-center">Blend</span>
            <span className="w-1/3 text-center">Growth</span>
          </div>
          <div className="flex w-full">
            <div className="flex flex-col justify-around py-2 w-12 shrink-0 text-right pr-3 text-[10px] font-bold text-text-secondary uppercase tracking-wider h-48">
              <span>Large</span>
              <span>Mid</span>
              <span>Small</span>
            </div>
            <div className="grid grid-cols-3 grid-rows-3 flex-1 h-48 border border-white/10 rounded-lg overflow-hidden bg-white/5">
              {[0, 1, 2].map(r => (
                [0, 1, 2].map(c => {
                   const isHighlighted = (r === sizeIndex && c === styleIndex);
                   return (
                     <div 
                       key={`${r}-${c}`} 
                       className={`border border-[#111114] flex items-center justify-center transition-colors ${isHighlighted ? 'bg-indigo-500/80 shadow-[inset_0_0_20px_rgba(255,255,255,0.2)]' : 'bg-transparent'}`}
                     >
                       {isHighlighted && <div className="w-3 h-3 bg-white rounded-full shadow-lg"></div>}
                     </div>
                   )
                })
              ))}
            </div>
          </div>
        </div>

        <hr className="border-white/5" />

        {/* Asset Class Split */}
        <div className="flex items-center gap-6 px-2">
           <div className="relative w-24 h-24 shrink-0">
             <svg className="w-full h-full transform -rotate-90">
                {/* Equity */}
                {equity > 0 && <circle cx="48" cy="48" r="36" fill="none" stroke="#10b981" strokeWidth="16" strokeDasharray={`${eqLength} ${circumference}`} strokeDashoffset={-eqOffset} className="transition-all duration-1000" />}
                {/* Debt */}
                {debt > 0 && <circle cx="48" cy="48" r="36" fill="none" stroke="#3b82f6" strokeWidth="16" strokeDasharray={`${debtLength} ${circumference}`} strokeDashoffset={-debtOffset} className="transition-all duration-1000" />}
                {/* Cash */}
                {cash > 0 && <circle cx="48" cy="48" r="36" fill="none" stroke="#94a3b8" strokeWidth="16" strokeDasharray={`${cashLength} ${circumference}`} strokeDashoffset={-cashOffset} className="transition-all duration-1000" />}
             </svg>
             <div className="absolute inset-0 flex items-center justify-center flex-col">
               <span className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">Total</span>
               <span className="text-xs font-bold font-mono">100%</span>
             </div>
           </div>
           
           <div className="flex flex-col gap-3 flex-1">
             <div className="flex justify-between items-center text-xs font-bold">
               <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Equity</div>
               <span className="font-mono text-white">{equity.toFixed(1)}%</span>
             </div>
             <div className="flex justify-between items-center text-xs font-bold">
               <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Debt</div>
               <span className="font-mono text-white">{debt.toFixed(1)}%</span>
             </div>
             <div className="flex justify-between items-center text-xs font-bold">
               <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-400"></div> Cash</div>
               <span className="font-mono text-white">{cash.toFixed(1)}%</span>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
};

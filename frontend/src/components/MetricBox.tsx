import React from 'react';
import { HelpCircle } from 'lucide-react';

export const MetricBox = ({ label, value, subtext, color = 'text-text-primary', tooltipDesc, size = 'xl' }: any) => {
  const sizeClasses = {
    'sm': 'text-sm',
    'lg': 'text-lg',
    'xl': 'text-xl',
    '2xl': 'text-2xl',
  };
  
  const valueSizeClass = sizeClasses[size as keyof typeof sizeClasses] || 'text-xl';

  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1 flex items-center gap-1 group relative w-fit cursor-help">
        {label}
        {tooltipDesc && (
          <>
            <HelpCircle size={14} className="text-text-secondary hover:text-text-primary transition-colors" />
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 bg-surface-hover text-text-primary text-[10px] p-2 rounded shadow-xl z-50 normal-case tracking-normal border border-border font-normal leading-relaxed">
              {tooltipDesc}
            </div>
          </>
        )}
      </span>
      <div className="flex items-end gap-2">
        <span className={`${valueSizeClass} font-bold font-mono ${color}`}>{value}</span>
        {subtext && <span className="text-xs font-semibold text-text-secondary mb-1">{subtext}</span>}
      </div>
    </div>
  );
};

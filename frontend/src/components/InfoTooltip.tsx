import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

export const InfoTooltip = ({ text, position = 'top' }: { text: string, position?: 'top' | 'bottom' | 'right' }) => {
  const [show, setShow] = useState(false);

  let posClasses = "bottom-full left-1/2 -translate-x-1/2 mb-2";
  let arrowClasses = "top-full left-1/2 -translate-x-1/2 border-t-surface-hover";
  
  if (position === 'bottom') {
    posClasses = "top-full left-1/2 -translate-x-1/2 mt-2";
    arrowClasses = "bottom-full left-1/2 -translate-x-1/2 border-b-surface-hover";
  } else if (position === 'right') {
    posClasses = "left-full top-1/2 -translate-y-1/2 ml-2";
    arrowClasses = "right-full top-1/2 -translate-y-1/2 border-r-surface-hover";
  }

  return (
    <div 
      className="relative inline-flex items-center justify-center ml-1.5 align-middle z-50 group"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <HelpCircle size={14} className="text-text-secondary hover:text-text-primary cursor-help transition-colors" />
      
      {show && (
        <div className={`absolute ${posClasses} w-48 md:w-64 p-2.5 bg-surface-hover border border-border rounded-lg text-xs text-text-primary shadow-xl font-normal normal-case tracking-normal z-[100] text-left`}>
          {text}
          <div className={`absolute border-4 border-transparent ${arrowClasses}`} />
        </div>
      )}
    </div>
  );
};

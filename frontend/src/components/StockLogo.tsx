import React, { useState } from 'react';

interface StockLogoProps {
  ticker: string;
  name?: string;
  className?: string;
  textClass?: string;
  fallbackClass?: string;
}

export const StockLogo: React.FC<StockLogoProps> = ({ 
  ticker, 
  name, 
  className = "w-8 h-8", 
  textClass = "text-[10px]",
  fallbackClass = "bg-surface-hover text-text-primary"
}) => {
  const [error, setError] = useState(false);
  
  React.useEffect(() => {
    setError(false);
  }, [ticker]);

  let finalTicker = ticker;
  if (ticker?.toLowerCase().includes('gold') || name?.toLowerCase().includes('gold')) {
    finalTicker = 'gold-metal';
  } else if (ticker?.toLowerCase().includes('silver') || name?.toLowerCase().includes('silver')) {
    finalTicker = 'silver-metal';
  }

  const displayName = finalTicker === '1' ? 'BSE SENSEX' : (finalTicker || '');
  
  if (error || !finalTicker) {
    return (
      <div className={`rounded-lg flex items-center justify-center overflow-hidden border border-border/50 shrink-0 ${fallbackClass} ${className}`}>
        <span className={`font-bold uppercase ${textClass}`}>{displayName.substring(0, 2)}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg flex items-center justify-center overflow-hidden shrink-0 ${className}`}>
      <img 
        src={`/logos/${finalTicker}.webp`} 
        alt={displayName}
        className="w-full h-full object-contain"
        onError={() => setError(true)}
      />
    </div>
  );
};

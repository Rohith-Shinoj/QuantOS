import React from 'react';
import { AlertCircle } from 'lucide-react';

interface InsufficientDataBadgeProps {
  className?: string;
  size?: 'sm' | 'md';
}

export const InsufficientDataBadge: React.FC<InsufficientDataBadgeProps> = ({ 
  className = '', 
  size = 'md' 
}) => {
  const isSmall = size === 'sm';
  
  return (
    <div 
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-canvas border border-border/50 text-alpha font-medium ${isSmall ? 'text-[10px]' : 'text-xs'} ${className}`}
      title="This metric is missing from the database or could not be calculated."
    >
      <AlertCircle className={isSmall ? "w-3 h-3" : "w-3.5 h-3.5"} />
      <span>N/A</span>
    </div>
  );
};

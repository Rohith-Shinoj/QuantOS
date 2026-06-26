import React from 'react';

export const Skeleton = ({ className }: { className?: string }) => {
  return (
    <div className={`animate-pulse bg-surface-hover/70 rounded ${className || ''}`}></div>
  );
};

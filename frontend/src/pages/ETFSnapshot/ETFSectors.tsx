import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

export const ETFSectors = ({ sectors }: { sectors: any[] }) => {
  if (!sectors || sectors.length === 0) return (
    <div className="bg-surface border border-border rounded-xl p-6 h-[400px] flex items-center justify-center text-text-secondary">
      No sector data available
    </div>
  );

  return (
    <div className="bg-surface border border-border p-5 rounded-xl flex flex-col h-[400px]">
      <h3 className="text-sm font-semibold text-text-primary mb-6">Sector Allocation</h3>
      <div className="flex-1 w-full h-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={sectors}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={110}
              paddingAngle={5}
              dataKey="sectorSharePercentage"
              nameKey="sectorName"
              stroke="none"
            >
              {sectors.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
              itemStyle={{ color: '#e4e4e7' }}
              formatter={(value: any) => [`${value}%`, 'Allocation']}
            />
            <Legend 
              layout="vertical" 
              verticalAlign="middle" 
              align="right"
              wrapperStyle={{ fontSize: '12px', color: '#a1a1aa' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, Cell, Legend } from 'recharts';
import { ChevronRight } from 'lucide-react';

export const DeepFinancials = ({ data }: { data: any }) => {
  const [period, setPeriod] = useState<'annual' | 'quarterly'>('annual');
  const [viewIndex, setViewIndex] = useState(0); // 0: tabular, 1: charts
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  const financialStatement = data?.absolute?.financialStatement || [];

  const tableData = useMemo(() => {
    if (!financialStatement.length) return [];
    return financialStatement.map((item: any) => {
      const dataKey = period === 'annual' ? 'yearly' : 'quarterly';
      const periodData = item[dataKey] || {};
      return {
        metric: item.title,
        ...periodData
      };
    });
  }, [financialStatement, period]);

  const columns = useMemo(() => {
    if (!financialStatement.length) return [];
    
    // Extract all unique dates from the selected period across all metrics
    const allDates = new Set<string>();
    financialStatement.forEach((item: any) => {
      const dataKey = period === 'annual' ? 'yearly' : 'quarterly';
      const periodData = item[dataKey] || {};
      Object.keys(periodData).forEach(date => allDates.add(date));
    });

    // Sort dates (assuming format "MMM 'YY") - Simple reverse chronological sort
    // For a robust app, we'd parse the date, but for now we trust the API's implicit ordering 
    // or just sort by the keys as they usually come sorted from the backend
    const sortedDates = Array.from(allDates); 
    // Wait, let's parse them to ensure reverse chronological (newest first)
    sortedDates.sort((a, b) => {
      const parseDate = (dStr: string) => {
        // Handle plain year strings like "2022", "2023"
        if (/^\d{4}$/.test(dStr)) return new Date(parseInt(dStr), 0, 1).getTime();
        // Handle "MMM 'YY" format like "Mar '26"
        const [m, y] = dStr.split(" '");
        const months: any = { "Jan":1, "Feb":2, "Mar":3, "Apr":4, "May":5, "Jun":6, "Jul":7, "Aug":8, "Sep":9, "Oct":10, "Nov":11, "Dec":12 };
        return new Date(2000 + parseInt(y), months[m] - 1, 1).getTime();
      };
      try { return parseDate(b) - parseDate(a); } catch { return 0; }
    });

    const columnHelper = createColumnHelper<any>();
    
    const cols = [
      columnHelper.accessor('metric', {
        header: 'Metric (Cr)',
        cell: info => <span className="font-medium text-text-primary whitespace-nowrap">{info.getValue()}</span>,
      })
    ];

    sortedDates.forEach((date, i) => {
      const prevDate = sortedDates[i + 1];

      cols.push(
        columnHelper.accessor(date, {
          header: date,
          cell: info => {
            const val = info.getValue();
            if (val === undefined || val === null || val === '-') return <span className="text-text-secondary opacity-50">-</span>;
            
            const numVal = Number(val);
            if (isNaN(numVal)) return <span className="text-text-secondary">{val}</span>;

            let yoy: number | null = null;
            if (prevDate) {
              const prevVal = Number(info.row.original[prevDate]);
              if (!isNaN(prevVal) && prevVal !== 0) {
                yoy = ((numVal - prevVal) / Math.abs(prevVal)) * 100;
              }
            }

            return (
              <div className="flex flex-col items-start gap-1 min-w-[80px]">
                <span className="tabular-nums text-text-primary font-medium">{numVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                {yoy !== null && (
                  <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded tabular-nums ${yoy > 0 ? 'bg-[#42bd7f]/20 text-[#42bd7f]' : yoy < 0 ? 'bg-[#f23645]/20 text-[#f23645]' : 'bg-surface-hover text-text-secondary'}`}>
                    {yoy > 0 ? '+' : ''}{yoy.toFixed(1)}%
                  </span>
                )}
              </div>
            );
          }
        })
      );
    });

    return cols;
  }, [financialStatement, period]);

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (!financialStatement.length) {
    return <div className="bg-surface p-6 rounded-lg border border-border">No financial data available.</div>;
  }

  return (
    <div className="h-full flex flex-col bg-canvas border border-border rounded-lg overflow-visible">
      <div className="flex justify-between items-center p-4 border-b border-border bg-surface shrink-0">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Deep Financials</h2>
          <p className="text-sm text-text-secondary mt-1">Income Statement & Financial Ratios</p>
        </div>
        
        <div className="flex bg-canvas p-1 rounded-lg border border-border">
          <button
            onClick={() => setPeriod('annual')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${period === 'annual' ? 'bg-surface border border-border text-alpha shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Annual
          </button>
          <button
            onClick={() => setPeriod('quarterly')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${period === 'quarterly' ? 'bg-surface border border-border text-alpha shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Quarterly
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-visible relative flex flex-col z-10">
        {viewIndex === 0 ? (
          <div className="overflow-x-scroll overflow-y-auto flex-1 custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-surface-hover sticky top-0 z-10">
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header, i) => (
                      <th 
                        key={header.id} 
                        className={`p-3 text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover ${i === 0 ? 'sticky left-0 z-20 border-r border-border' : ''}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-border/30 bg-surface">
                {table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="hover:bg-surface-hover/50 transition-colors">
                    {row.getVisibleCells().map((cell, i) => (
                      <td 
                        key={cell.id} 
                        className={`p-3 text-sm border-b border-border/30 ${i === 0 ? 'sticky left-0 z-10 bg-surface border-r border-border group-hover:bg-surface-hover/50' : ''}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 custom-scrollbar">
            {viewIndex === 1 && (() => {
              const chartData = columns
                .filter((c: any) => c.header && c.header !== 'Metric (Cr)')
                .map((c: any) => c.header)
                .reverse()
                .map((date: string) => {
                  const revData = tableData.find((d: any) => d.metric.toLowerCase().includes('revenue'));
                  const profitData = tableData.find((d: any) => d.metric.toLowerCase().includes('profit'));
                  return {
                    date,
                    Revenue: Number(revData?.[date]) || 0,
                    Profit: Number(profitData?.[date]) || 0
                  };
                });
              const activeIndex = hoveredIndex !== null ? hoveredIndex : chartData.length - 1;
              const activeData = chartData[activeIndex];
              const prevData = activeIndex > 0 ? chartData[activeIndex - 1] : null;

              const revGrowth = prevData ? (((activeData.Revenue - prevData.Revenue) / Math.abs(prevData.Revenue)) * 100).toFixed(2) : null;
              const profGrowth = prevData ? (((activeData.Profit - prevData.Profit) / Math.abs(prevData.Profit)) * 100).toFixed(2) : null;
                
              return (
              <div className="bg-canvas/50 border border-border/50 rounded-lg p-4 h-full flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-2">{activeData?.date || ''}</h3>
                    <div className="flex gap-8">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-sm bg-[#8ba1b5]"></div>
                          <span className="text-[10px] text-text-secondary font-bold tracking-wider">REVENUE (CR)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-medium text-text-primary">₹{activeData?.Revenue?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0'}</span>
                          {revGrowth && <span className={`text-[11px] font-bold ${Number(revGrowth) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{Number(revGrowth) >= 0 ? '+' : ''}{revGrowth}%</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-sm bg-[#10b981]"></div>
                          <span className="text-[10px] text-text-secondary font-bold tracking-wider">PROFIT (CR)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-medium text-text-primary">₹{activeData?.Profit?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0'}</span>
                          {profGrowth && <span className={`text-[11px] font-bold ${Number(profGrowth) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{Number(profGrowth) >= 0 ? '+' : ''}{profGrowth}%</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-h-0 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={chartData} 
                      margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                      onMouseMove={(e: any) => {
                        if (e.isTooltipActive && e.activeTooltipIndex !== undefined) setHoveredIndex(e.activeTooltipIndex);
                      }}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                      <XAxis dataKey="date" stroke="#888" fontSize={10} tickMargin={8} />
                      <YAxis stroke="#888" fontSize={10} tickFormatter={val => val.toLocaleString('en-IN', { notation: 'compact' })} />
                      <Bar dataKey="Revenue" fill="#8ba1b5" radius={[4, 4, 0, 0]} maxBarSize={40}>
                        {chartData.map((_: any, index: number) => (
                          <Cell key={`cell-rev-${index}`} fill="#8ba1b5" fillOpacity={hoveredIndex !== null ? (hoveredIndex === index ? 1 : 0.4) : (index === chartData.length - 1 ? 1 : 0.4)} />
                        ))}
                      </Bar>
                      <Bar dataKey="Profit" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40}>
                        {chartData.map((_: any, index: number) => (
                          <Cell key={`cell-prof-${index}`} fill="#10b981" fillOpacity={hoveredIndex !== null ? (hoveredIndex === index ? 1 : 0.4) : (index === chartData.length - 1 ? 1 : 0.4)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              );
            })()}
            
            {viewIndex === 2 && (() => {
              const metricData = tableData.find((d: any) => d.metric.toLowerCase().includes('net worth'));
              if (!metricData) return null;
              
              const chartData = columns
                .filter((c: any) => c.header && c.header !== 'Metric (Cr)')
                .map((c: any) => c.header)
                .reverse()
                .map((date: string) => ({ date, value: Number(metricData[date]) || 0 }));
                
              const activeIndex = hoveredIndex !== null ? hoveredIndex : chartData.length - 1;
              const activeData = chartData[activeIndex];
              const prevData = activeIndex > 0 ? chartData[activeIndex - 1] : null;
              const growth = prevData ? (((activeData.value - prevData.value) / Math.abs(prevData.value)) * 100).toFixed(2) : null;
                
              return (
                <div className="bg-canvas/50 border border-border/50 rounded-lg p-4 h-full flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-2">{activeData?.date || ''}</h3>
                      <div className="flex gap-8">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-[#a855f7]"></div>
                            <span className="text-[10px] text-text-secondary font-bold tracking-wider">{metricData.metric.toUpperCase()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-medium text-text-primary">₹{activeData?.value?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0'}</span>
                            {growth && <span className={`text-[11px] font-bold ${Number(growth) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{Number(growth) >= 0 ? '+' : ''}{growth}%</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 relative">
                    <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={chartData} 
                      margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                      onMouseMove={(e: any) => {
                        if (e.isTooltipActive && e.activeTooltipIndex !== undefined) setHoveredIndex(e.activeTooltipIndex);
                      }}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                      <XAxis dataKey="date" stroke="#888" fontSize={10} tickMargin={8} />
                      <YAxis stroke="#888" fontSize={10} tickFormatter={val => val.toLocaleString('en-IN', { notation: 'compact' })} />
                      <Bar dataKey="value" name={metricData.metric} fill="#a855f7" radius={[4, 4, 0, 0]} maxBarSize={40}>
                         {chartData.map((_: any, index: number) => (
                           <Cell key={`cell-nw-${index}`} fill="#a855f7" fillOpacity={hoveredIndex !== null ? (hoveredIndex === index ? 1 : 0.4) : (index === chartData.length - 1 ? 1 : 0.4)} />
                         ))}
                      </Bar>
                    </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
        
        {/* Pagination Dots */}
        <div className="h-10 border-t border-border bg-surface shrink-0 flex items-center justify-center gap-3">
          {[0, 1, 2].map((dotIndex) => (
            <button 
              key={dotIndex}
              onClick={() => setViewIndex(dotIndex)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${viewIndex === dotIndex ? 'bg-alpha scale-125' : 'bg-text-secondary/30 hover:bg-text-secondary/60'}`}
              title={dotIndex === 0 ? "Tabular View" : dotIndex === 1 ? "Revenue & Profit" : "Net Worth"}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

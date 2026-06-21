import React, { useState, useMemo } from 'react';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';

export const DeepFinancials = ({ data }: { data: any }) => {
  const [period, setPeriod] = useState<'annual' | 'quarterly'>('annual');
  
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
        // In a real app we'd use Tanstack's pin feature, but standard CSS sticky is easier for a simple table
      })
    ];

    sortedDates.forEach(date => {
      cols.push(
        columnHelper.accessor(date, {
          header: date,
          cell: info => {
            const val = info.getValue();
            if (!val || val === '-') return <span className="text-text-secondary opacity-50">-</span>;
            return <span className="tabular-nums text-text-secondary">{val}</span>;
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
    <div className="h-full flex flex-col bg-canvas border border-border rounded-lg overflow-hidden">
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

      <div className="overflow-auto border border-border rounded flex-1">
        <table className="w-full text-left border-collapse min-w-max">
          <thead className="bg-surface-hover sticky top-0 z-10">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, i) => (
                  <th 
                    key={header.id} 
                    className={`p-4 text-xs font-bold text-text-secondary uppercase tracking-wider border-b border-border bg-surface-hover ${i === 0 ? 'sticky left-0 z-20 border-r border-border' : ''}`}
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
                    className={`p-4 text-sm border-b border-border/30 ${i === 0 ? 'sticky left-0 z-10 bg-surface border-r border-border group-hover:bg-surface-hover/50' : ''}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

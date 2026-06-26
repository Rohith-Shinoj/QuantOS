import React from 'react';
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';
import { Download, ArrowUpDown, Edit } from 'lucide-react';

export const ScreenerResultsTable = ({ data, isLoading }: { data: any[], isLoading: boolean }) => {
  const columnHelper = createColumnHelper<any>();

  if (!data || data.length === 0) {
    if (isLoading) {
      return <div className="p-12 animate-pulse text-center text-sm text-text-secondary">Executing complex query across OLAP databases...</div>;
    }
    return null;
  }

  // Dynamically generate columns based on the keys present in the first data row
  const dataKeys = Object.keys(data[0] || {});
  
  // Specific formatting rules for known columns to match screener.in
  const columns = dataKeys.map(key => {
    if (key === 'S.No.' || key === 's_no') {
      return columnHelper.accessor(key, {
        header: 'S.No.',
        cell: info => <span className="tabular-nums text-xs text-text-secondary">{info.getValue() || info.row.index + 1}.</span>,
      });
    }
    if (key === 'Name' || key === 'name' || key === 'ticker') {
      return columnHelper.accessor(key, {
        header: 'Name',
        cell: info => <span className="text-xs font-medium text-alpha hover:underline cursor-pointer truncate max-w-[150px] inline-block">{info.getValue()}</span>,
      });
    }
    
    // Format numbers
    return columnHelper.accessor(key, {
      header: key.replace(/_/g, ' '),
      cell: info => {
        const val = info.getValue();
        if (typeof val === 'number') {
          return <span className="tabular-nums text-xs text-text-primary text-right block">{val.toFixed(2)}</span>;
        }
        return <span className="text-xs text-text-primary">{val || '-'}</span>;
      },
    });
  });

  const table = useReactTable({
    data: data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const exportCSV = () => {
    if (!data || data.length === 0) return;
    const headers = columns.map((c: any) => c.header).join(',');
    const rows = data.map(row => Object.values(row).join(','));
    const csvContent = "data:text/csv;charset=utf-8," + headers + "\\n" + rows.join("\\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "screener_results.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-canvas border-t-4 border-alpha pt-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm text-text-secondary">{data.length} results found: Showing page 1 of 1</h3>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-text-primary border border-border rounded hover:bg-surface-hover transition-colors">
            <Edit size={12} /> INDUSTRY
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-text-primary border border-border rounded hover:bg-surface-hover transition-colors">
            <Download size={12} /> EXPORT
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-alpha border border-alpha rounded hover:bg-alpha/10 transition-colors">
            <Edit size={12} /> EDIT COLUMNS
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-border bg-surface/50">
                {headerGroup.headers.map((header, i) => (
                  <th 
                    key={header.id} 
                    className={`px-3 py-2.5 text-[10px] font-bold text-alpha uppercase cursor-pointer hover:bg-surface-hover select-none group ${i > 1 ? 'text-right' : 'text-left'}`}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className={`flex items-center gap-1 ${i > 1 ? 'justify-end' : 'justify-start'}`}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, idx) => (
              <tr 
                key={row.id} 
                className={`border-b border-border hover:bg-surface-hover transition-colors ${idx % 2 === 0 ? 'bg-canvas' : 'bg-surface/30'}`}
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2">
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

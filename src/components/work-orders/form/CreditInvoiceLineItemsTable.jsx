import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, Ban } from 'lucide-react';

export default function CreditInvoiceLineItemsTable({ 
  lineItems, 
  selectedLines, 
  onToggleLine 
}) {
  
  const isLineCredited = (line) => {
    return line.credit && typeof line.credit === 'string';
  };

  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0;
    return `$${num.toFixed(2)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          Line Items - Select Items to Credit
        </CardTitle>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Check the items you want to include in this credit invoice. Already credited items are disabled.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300 w-16">Credit</th>
                <th className="text-center p-3 font-semibold text-slate-700 dark:text-slate-300 w-16">Qty</th>
                <th className="text-center p-3 font-semibold text-slate-700 dark:text-slate-300 w-16">Hrs</th>
                <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300 flex-1">Description</th>
                <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300 w-32">Part Number</th>
                <th className="text-right p-3 font-semibold text-slate-700 dark:text-slate-300 w-24">Parts Ea.</th>
                <th className="text-right p-3 font-semibold text-slate-700 dark:text-slate-300 w-24">Tot. Parts</th>
                <th className="text-right p-3 font-semibold text-slate-700 dark:text-slate-300 w-24">Labour</th>
                <th className="text-center p-3 font-semibold text-slate-700 dark:text-slate-300 w-12">Tx</th>
                <th className="text-right p-3 font-semibold text-slate-700 dark:text-slate-300 w-24">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line, index) => {
                const isCredited = isLineCredited(line);
                const isSelected = selectedLines[index];
                const isBlankLine = !line.description && !line.part_number;
                
                // Skip completely blank lines in the display
                if (isBlankLine) return null;

                return (
                  <TooltipProvider key={index}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <tr 
                          className={`border-b border-slate-100 dark:border-slate-800 transition-colors ${
                            isCredited
                              ? 'bg-slate-100 dark:bg-slate-800 opacity-60 cursor-not-allowed'
                              : isSelected
                                ? 'bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          {/* Credit Checkbox */}
                          <td className="p-3 text-center">
                            {isCredited ? (
                              <div className="flex items-center justify-center">
                                <Ban className="w-5 h-5 text-slate-400" />
                              </div>
                            ) : (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => onToggleLine(index)}
                                disabled={isCredited}
                              />
                            )}
                          </td>

                          {/* Quantity */}
                          <td className="p-3 text-center text-slate-700 dark:text-slate-300">
                            {line.qty || ''}
                          </td>

                          {/* Hours */}
                          <td className="p-3 text-center text-slate-700 dark:text-slate-300">
                            {line.hrs || ''}
                          </td>

                          {/* Description */}
                          <td className={`p-3 ${line.bold ? 'font-bold' : ''} ${isCredited ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                            <div className="flex items-center gap-2">
                              <span>{line.description}</span>
                              {isCredited && (
                                <Badge variant="outline" className="bg-slate-200 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600">
                                  Credited
                                </Badge>
                              )}
                            </div>
                          </td>

                          {/* Part Number */}
                          <td className={`p-3 text-sm ${isCredited ? 'text-slate-500 dark:text-slate-400' : 'text-slate-600 dark:text-slate-300'}`}>
                            {line.part_number || ''}
                          </td>

                          {/* Parts Each */}
                          <td className={`p-3 text-right ${isCredited ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {line.parts_ea > 0 ? formatCurrency(line.parts_ea) : ''}
                          </td>

                          {/* Total Parts */}
                          <td className={`p-3 text-right ${isCredited ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {line.tot_parts > 0 ? formatCurrency(line.tot_parts) : ''}
                          </td>

                          {/* Labour */}
                          <td className={`p-3 text-right ${isCredited ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {line.labour > 0 ? formatCurrency(line.labour) : ''}
                          </td>

                          {/* Tax */}
                          <td className="p-3 text-center text-slate-700 dark:text-slate-300">
                            {line.taxable !== false ? 'Y' : 'N'}
                          </td>

                          {/* Total */}
                          <td className={`p-3 text-right font-semibold ${isCredited ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                            {formatCurrency(line.total)}
                          </td>
                        </tr>
                      </TooltipTrigger>
                      {isCredited && (
                        <TooltipContent side="top" className="bg-slate-900 text-white">
                          <p className="font-semibold">Already Credited</p>
                          <p className="text-sm">Credit Invoice: {line.credit}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </tbody>
          </table>

          {lineItems.filter(line => line.description || line.part_number).length === 0 && (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              No line items to display
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
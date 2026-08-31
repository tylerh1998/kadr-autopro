import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildBatchId, conceptualKey, resolveConceptualInvoiceIds } from "../_shared/glBatch.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any, options: any = {}) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    let user: any = { email: 'System', id: null };
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || supabaseSecret, {
          auth: { persistSession: false }
        });
        const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(token);
        if (authUser) {
          user = authUser;
        } else if (authError) {
          console.error('Auth error resolving user:', authError);
        }
      } catch (err) {
        console.error('Failed to resolve user from auth header:', err);
      }
    }

    const payload = await req.json();
    const { supplierId, addedLines = [], modifiedLines = [], deletedLineIds = [] } = payload;

    if (!supplierId) {
      return res({ success: false, error: 'Missing supplierId' });
    }

    // Server-side backstop: the client normalizes invoice_date to ISO (YYYY-MM-DD) before it ever
    // gets here, but nothing enforced that server-side, so a client bug could silently persist a
    // malformed date (e.g. "07/15/2026") that later crashes date-fns parsing in the payment UI.
    const isValidIsoDate = (value: any) => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const [y, m, d] = value.split('-').map(Number);
      const parsed = new Date(Date.UTC(y, m - 1, d));
      return parsed.getUTCFullYear() === y && parsed.getUTCMonth() + 1 === m && parsed.getUTCDate() === d;
    };
    const badDateLines = [...addedLines, ...modifiedLines].filter((l: any) => !isValidIsoDate(l.invoice_date));
    if (badDateLines.length > 0) {
      return res({ success: false, error: `Invalid invoice_date on ${badDateLines.length} line(s); expected YYYY-MM-DD format.` });
    }

    let anyAmountChanged = false;
    const skippedDeletions: any[] = [];
    const getCurrentMountainTimeISO = () => {
      const mountainNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
      return mountainNow.toISOString();
    };
    const userDisplay = user.user_metadata?.full_name || user.email || user.id;

    // Helper to create GL transactions
    const createGLTransactions = async (linesToProcess: any[], action: string, oldValues?: any) => {
      if (!linesToProcess || linesToProcess.length === 0) return;

      let allLinesForData = [...linesToProcess];
      if (action === 'update') {
        if (Array.isArray(oldValues)) {
          allLinesForData.push(...oldValues);
        } else if (oldValues) {
          allLinesForData.push(oldValues);
        }
      }

      const uniqueSupplierIds = [...new Set(allLinesForData.map(l => l.supplier_id).filter(Boolean))];
      const uniqueGLAccounts = [...new Set(allLinesForData.map(l => l.gl_account).filter(Boolean))];

      const supplierMap: any = {};
      const glAccountMap: any = {};

      if (uniqueSupplierIds.length > 0) {
        const { data: suppliers } = await supabase.from('Supplier').select('id, name').in('id', uniqueSupplierIds);
        (suppliers || []).forEach((s: any) => {
          if (s && s.id) supplierMap[s.id] = s.name;
        });
      }

      if (uniqueGLAccounts.length > 0) {
        const { data: allAccounts, error: accountsError } = await supabase
          .from('ChartOfAccount')
          .select('account_number, account_name')
          .in('account_number', uniqueGLAccounts);

        if (accountsError) {
          console.error('Error fetching ChartOfAccount records:', accountsError);
        }

        (allAccounts || []).forEach((acc: any) => {
          glAccountMap[acc.account_number] = `${acc.account_number} - ${acc.account_name}`;
        });
      }

      const glTransactions: any[] = [];

      const createGLEntries = (line: any, isReversal = false) => {
        const multiplier = isReversal ? -1 : 1;
        const reversalPrefix = isReversal ? 'REVERSAL - ' : '';
        const nowIso = getCurrentMountainTimeISO();

        const purchaseAmount = parseFloat(line.purchase_amount || 0);
        const gstAmount = parseFloat(line.gst_amount || 0);
        const lineTotal = purchaseAmount + gstAmount;

        const supplierName = supplierMap[line.supplier_id] || 'Unknown Supplier';
        const glAccountName = glAccountMap[line.gl_account] || line.gl_account || 'Unknown';

        const baseDescription = `Supplier Inv Line: ${line.description || 'No description'} - ${supplierName}`;

        if (purchaseAmount !== 0) {
          glTransactions.push({
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            created_date: nowIso,
            updated_date: nowIso,
            created_by: userDisplay,
            created_by_id: user.id,
            updated_by: userDisplay,
            account_number: String(line.gl_account),
            transaction_date: line.invoice_date,
            description: `${reversalPrefix}${baseDescription} - ${glAccountName}`,
            reference: `${supplierName} - ${line.invoice_number || 'N/A'}`,
            debit_amount: multiplier * purchaseAmount > 0 ? multiplier * purchaseAmount : 0,
            credit_amount: multiplier * purchaseAmount < 0 ? Math.abs(multiplier * purchaseAmount) : 0,
            source_type: 'supplier_invoice',
            source_id: line.id || '',
            batch_id: buildBatchId('supplier_invoice', line.conceptual_invoice_id)
          });
        }

        if (gstAmount !== 0) {
          glTransactions.push({
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            created_date: nowIso,
            updated_date: nowIso,
            created_by: userDisplay,
            created_by_id: user.id,
            updated_by: userDisplay,
            account_number: '2003',
            transaction_date: line.invoice_date,
            description: `${reversalPrefix}${baseDescription} - GST Paid`,
            reference: `${supplierName} - ${line.invoice_number || 'N/A'}`,
            debit_amount: multiplier * gstAmount > 0 ? multiplier * gstAmount : 0,
            credit_amount: multiplier * gstAmount < 0 ? Math.abs(multiplier * gstAmount) : 0,
            source_type: 'supplier_invoice',
            source_id: line.id || '',
            batch_id: buildBatchId('supplier_invoice', line.conceptual_invoice_id)
          });
        }

        if (lineTotal !== 0) {
          glTransactions.push({
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            created_date: nowIso,
            updated_date: nowIso,
            created_by: userDisplay,
            created_by_id: user.id,
            updated_by: userDisplay,
            account_number: '2000',
            transaction_date: line.invoice_date,
            description: `${reversalPrefix}${baseDescription} - Accounts Payable`,
            reference: `${supplierName} - ${line.invoice_number || 'N/A'}`,
            debit_amount: multiplier * lineTotal < 0 ? Math.abs(multiplier * lineTotal) : 0,
            credit_amount: multiplier * lineTotal > 0 ? multiplier * lineTotal : 0,
            source_type: 'supplier_invoice',
            source_id: line.id || '',
            batch_id: buildBatchId('supplier_invoice', line.conceptual_invoice_id)
          });
        }
      };

      for (let i = 0; i < linesToProcess.length; i++) {
        const line = linesToProcess[i];
        if (action === 'create') {
          createGLEntries(line, false);
        } else if (action === 'update') {
          const oldVal = Array.isArray(oldValues) ? oldValues[i] : oldValues;
          if (oldVal) createGLEntries(oldVal, true);
          createGLEntries(line, false);
        } else if (action === 'delete') {
          createGLEntries(line, true);
        }
      }

      if (glTransactions.length > 0) {
        const sanitizedTxs = glTransactions.map(glTx => ({
          ...glTx,
          debit_amount: Math.round(parseFloat(glTx.debit_amount) * 100) / 100,
          credit_amount: Math.round(parseFloat(glTx.credit_amount) * 100) / 100
        }));
        try {
          const { error } = await supabase.from('GLTransaction').insert(sanitizedTxs);
          if (error) {
            throw error;
          }
        } catch (error) {
          console.error('Error creating GL transactions:', error);
        }
      }
    };

    // 1. Process Deletions
    const deletedLinesForGL: any[] = [];
    for (const lineId of deletedLineIds) {
      try {
        const { data: lineToDelete, error: selectError } = await supabase.from('SupplierInvoiceLine').select('*').eq('id', lineId).maybeSingle();

        if (selectError) {
          console.error(`Error fetching line ${lineId} for deletion:`, selectError);
          continue;
        }

        if (lineToDelete) {
          const paidAmount = parseFloat(lineToDelete.paid_amount || 0);
          if (paidAmount !== 0) {
            const skipMessage = `Skipping deletion of line ${lineId} because it has paid amount ${paidAmount}`;
            console.warn(skipMessage);
            skippedDeletions.push({ lineId, paid_amount: paidAmount, message: skipMessage });
            continue;
          }

          if (lineToDelete.pending_cash_flow_entry_id) {
            const skipMessage = `Skipping deletion of line ${lineId} because it is queued for payment on the cash flow sheet`;
            console.warn(skipMessage);
            skippedDeletions.push({ lineId, pending_cash_flow_entry_id: lineToDelete.pending_cash_flow_entry_id, message: skipMessage });
            continue;
          }

          const { error: deleteError } = await supabase.from('SupplierInvoiceLine').delete().eq('id', lineId);
          if (deleteError) throw deleteError;

          anyAmountChanged = true;
          deletedLinesForGL.push(lineToDelete);
        }
      } catch (error) {
        console.error(`Error processing deletion for line ${lineId}:`, error);
      }
    }

    if (deletedLinesForGL.length > 0) {
      try {
        await createGLTransactions(deletedLinesForGL, 'delete');
      } catch (error: any) {
        throw new Error(`GL creation failed during deletion stage: ${error.message || 'Unknown error'}`);
      }
    }

    // 2. Process Additions
    let createdLinesForGL: any[] = [];
    if (addedLines.length > 0) {
      const addedConceptualIds = await resolveConceptualInvoiceIds(
        supabase,
        addedLines.map((line: any) => ({ supplier_id: supplierId, invoice_number: line.invoice_number }))
      );

      const linesToInsert = addedLines.map((line: any) => {
        const nowIso = getCurrentMountainTimeISO();
        return {
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          supplier_id: supplierId,
          invoice_number: line.invoice_number,
          invoice_date: line.invoice_date,
          description: line.description,
          purchase_amount: line.purchase_amount,
          gst_amount: line.gst_amount,
          gl_account: line.gl_account,
          gst_override: line.gst_override,
          paid_amount: 0,
          conceptual_invoice_id: addedConceptualIds[conceptualKey(supplierId, line.invoice_number)],
          created_date: nowIso,
          updated_date: nowIso,
          created_by: userDisplay,
          created_by_id: user.id,
          updated_by: userDisplay
        };
      });

      try {
        const { data: insertedData, error: insertError } = await supabase.from('SupplierInvoiceLine').insert(linesToInsert).select();
        if (insertError) throw insertError;
        if (insertedData && insertedData.length > 0) {
          createdLinesForGL = insertedData;
          anyAmountChanged = true;
        }
      } catch (insertError: any) {
        throw new Error(`Failed to insert lines: ${insertError.message}`);
      }
    }

    if (createdLinesForGL.length > 0) {
      try {
        await createGLTransactions(createdLinesForGL, 'create');
      } catch (error: any) {
        throw new Error(`GL creation failed during addition stage: ${error.message || 'Unknown error'}`);
      }
    }

    // 3. Process Modifications
    const updatedLinesForGL: any[] = [];
    const oldValuesForGL: any[] = [];
    const skippedModifications: any[] = [];

    // A line's conceptual invoice only changes when supplier_id/invoice_number changes - not
    // on every edit - so amount-only edits keep the same batch and never touch the resolver.
    const isGroupingChanged = (nextSupplierId: any, invoiceNumber: any, existingLine: any) => (
      String(nextSupplierId || '') !== String(existingLine.supplier_id || '') ||
      String(invoiceNumber || '') !== String(existingLine.invoice_number || '')
    );

    const existingLinesById: Record<string, any> = {};
    for (const line of modifiedLines) {
      const { data: existingLine } = await supabase.from('SupplierInvoiceLine').select('*').eq('id', line.id).single();
      if (existingLine) existingLinesById[line.id] = existingLine;
    }

    // Resolve every regrouped line's new conceptual_invoice_id in one batched call so that,
    // e.g., two lines both being retyped to the same new invoice number in this same save
    // land in the same new group instead of each minting their own.
    const regroupKeys: any[] = [];
    for (const line of modifiedLines) {
      const existingLine = existingLinesById[line.id];
      if (!existingLine) continue;
      const nextSupplierId = line.supplier_id || existingLine.supplier_id || supplierId;
      if (isGroupingChanged(nextSupplierId, line.invoice_number, existingLine)) {
        regroupKeys.push({ supplier_id: nextSupplierId, invoice_number: line.invoice_number, exclude_id: line.id });
      }
    }
    const regroupedConceptualIds = await resolveConceptualInvoiceIds(supabase, regroupKeys);

    for (const line of modifiedLines) {
      try {
        const existingLine = existingLinesById[line.id];
        if (!existingLine) continue;

        const existingPaidAmount = parseFloat(existingLine.paid_amount || 0);
        if (existingPaidAmount !== 0) {
          const skipMessage = `Skipping update of line ${line.id} because it has paid amount ${existingPaidAmount}`;
          console.warn(skipMessage);
          skippedModifications.push({ lineId: line.id, paid_amount: existingPaidAmount, message: skipMessage });
          continue;
        }

        if (existingLine.pending_cash_flow_entry_id) {
          const skipMessage = `Skipping update of line ${line.id} because it is queued for payment on the cash flow sheet`;
          console.warn(skipMessage);
          skippedModifications.push({ lineId: line.id, pending_cash_flow_entry_id: existingLine.pending_cash_flow_entry_id, message: skipMessage });
          continue;
        }

        const currentPurchaseAmount = parseFloat(line.purchase_amount) || 0;
        const currentGstAmount = parseFloat(line.gst_amount) || 0;
        const oldPurchaseAmount = parseFloat(existingLine.purchase_amount) || 0;
        const oldGstAmount = parseFloat(existingLine.gst_amount) || 0;
        const nextSupplierId = line.supplier_id || existingLine.supplier_id || supplierId;

        if (currentPurchaseAmount !== oldPurchaseAmount || currentGstAmount !== oldGstAmount) {
          anyAmountChanged = true;
        }

        const glRelevantChanged = (
          String(line.invoice_number || '') !== String(existingLine.invoice_number || '') ||
          String(line.invoice_date || '') !== String(existingLine.invoice_date || '') ||
          String(line.description || '') !== String(existingLine.description || '') ||
          String(line.gl_account || '') !== String(existingLine.gl_account || '') ||
          currentPurchaseAmount !== oldPurchaseAmount ||
          currentGstAmount !== oldGstAmount
        );

        // On a regroup, the old reversal (below) reads existingLine.conceptual_invoice_id
        // (still the pre-update value) so it lands in the OLD batch; the fresh entries read
        // updatedLine.conceptual_invoice_id (the new value persisted here) so they land in
        // the NEW batch. No explicit "delete old batch" step - reversal + repost handles it,
        // same as every other GL-relevant edit already does.
        const nextConceptualInvoiceId = isGroupingChanged(nextSupplierId, line.invoice_number, existingLine)
          ? regroupedConceptualIds[conceptualKey(nextSupplierId, line.invoice_number)]
          : existingLine.conceptual_invoice_id;

        const updateData = {
          supplier_id: nextSupplierId,
          invoice_number: line.invoice_number,
          invoice_date: line.invoice_date,
          description: line.description,
          purchase_amount: line.purchase_amount,
          gst_amount: line.gst_amount,
          gl_account: line.gl_account,
          gst_override: line.gst_override,
          conceptual_invoice_id: nextConceptualInvoiceId,
          updated_date: getCurrentMountainTimeISO(),
          updated_by: userDisplay
        };

        const { data: updatedLine, error: updateError } = await supabase.from('SupplierInvoiceLine').update(updateData).eq('id', line.id).select().single();
        if (updateError) throw updateError;

        if (updatedLine && glRelevantChanged) {
          updatedLinesForGL.push(updatedLine);
          oldValuesForGL.push(existingLine);
        }
      } catch (updateError: any) {
        throw new Error(`Failed to update line ${line.id}: ${updateError.message}`);
      }
    }

    if (updatedLinesForGL.length > 0) {
      try {
        await createGLTransactions(updatedLinesForGL, 'update', oldValuesForGL);
      } catch (error: any) {
        throw new Error(`GL creation failed during modification stage: ${error.message || 'Unknown error'}`);
      }
    }

    // 4. Payment Reallocation (if needed)
    if (anyAmountChanged) {
      try {
        console.log("Invoice line amounts changed. Reallocating payments.");
        const { data: payments, error: paymentsError } = await supabase
          .from('SupplierPayment')
          .select('*')
          .eq('supplier_id', supplierId);

        if (paymentsError) {
          throw paymentsError;
        }

        for (const payment of (payments || [])) {
          let appliedInvoices: any[] = [];
          try {
            const parsed = JSON.parse(payment.invoice_number || '[]');
            if (Array.isArray(parsed)) {
              appliedInvoices = parsed;
            } else if (payment.invoice_number && typeof payment.invoice_number === 'string' && payment.invoice_number !== 'On Account') {
              appliedInvoices = [{
                invoice_number: payment.invoice_number,
                amount_applied: payment.amount
              }];
            }
          } catch (error) {
            if (payment.invoice_number && typeof payment.invoice_number === 'string' && payment.invoice_number !== 'On Account') {
              appliedInvoices = [{
                invoice_number: payment.invoice_number,
                amount_applied: payment.amount
              }];
            }
          }

          for (const appliedDetail of appliedInvoices) {
            if (appliedDetail.invoice_number === "On Account") continue;

            const { data: invoiceLines } = await supabase.from('SupplierInvoiceLine')
              .select('*')
              .eq('supplier_id', supplierId)
              .eq('invoice_number', appliedDetail.invoice_number);

            if (invoiceLines && invoiceLines.length > 0) {
              const invoiceTotal = invoiceLines.reduce((sum: number, l: any) => {
                const lineTotal = (l.purchase_amount || 0) + (l.gst_amount || 0);
                return sum + lineTotal;
              }, 0);

              for (const l of invoiceLines) {
                const lineTotal = (l.purchase_amount || 0) + (l.gst_amount || 0);
                const proportion = invoiceTotal !== 0 ? lineTotal / invoiceTotal : 0;
                const newPaidAmount = appliedDetail.amount_applied * proportion;

                await supabase.from('SupplierInvoiceLine')
                  .update({
                    updated_date: getCurrentMountainTimeISO(),
                    updated_by: userDisplay,
                    paid_amount: Math.round(newPaidAmount * 100) / 100
                  })
                  .eq('id', l.id);
              }
            }
          }
        }
      } catch (error: any) {
        throw new Error(`Payment reallocation failed: ${error.message || 'Unknown error'}`);
      }
    }

    const skippedMessages: string[] = [];
    if (skippedDeletions.length > 0) {
      skippedMessages.push(`${skippedDeletions.length} line deletion(s) were skipped because they are paid or queued for payment.`);
    }
    if (skippedModifications.length > 0) {
      skippedMessages.push(`${skippedModifications.length} line edit(s) were skipped because they are paid or queued for payment.`);
    }

    return res({
      success: true,
      skippedDeletions,
      skippedModifications,
      message: skippedMessages.length > 0 ? skippedMessages.join(' ') : undefined
    });
  } catch (error: any) {
    console.error('Error in saveSupplierInvoiceTransactions:', error);
    return res({ success: false, error: error.message });
  }
});

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Authenticate the user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse the request body
        const { fileContent, fileName } = await req.json();
        
        if (!fileContent) {
            return Response.json({ error: 'File content is required' }, { status: 400 });
        }

        console.log('Parsing payroll file:', fileName);
        console.log('File content length:', fileContent.length);

        // Determine transaction type based on filename or content
        const isPaycheque = fileName?.toLowerCase().includes('paycheque') || 
                           fileContent.includes('Pay Period:') ||
                           (fileContent.includes('Gross Pay:') && fileContent.includes('EMPLOYEE DEDUCTIONS'));
        
        const isRemittance = fileName?.toLowerCase().includes('remittance') ||
                            fileContent.includes('Government Remittance Statement') ||
                            fileContent.includes('REMITTANCE BREAKDOWN');

        if (!isPaycheque && !isRemittance) {
            return Response.json({ 
                error: 'Unable to determine file type. Please ensure the file is a valid paycheque or remittance file.' 
            }, { status: 400 });
        }

        let parsedData = {};

        if (isPaycheque) {
            // Parse Paycheque file
            parsedData.transaction_type = 'Paycheque';
            
            // Extract paycheque number
            const paychequeNumMatch = fileContent.match(/Paycheque Number:\s*([\w-]+)/i);
            if (paychequeNumMatch) {
                parsedData.paycheque_number = paychequeNumMatch[1];
                console.log('Extracted paycheque_number:', parsedData.paycheque_number);
            }
            
            // Extract pay period
            const payPeriodMatch = fileContent.match(/Pay Period:\s*(\d{4}-\d{2}-\d{2})\s*to\s*(\d{4}-\d{2}-\d{2})/i);
            if (payPeriodMatch) {
                parsedData.pay_period_start = payPeriodMatch[1];
                parsedData.pay_period_end = payPeriodMatch[2];
                console.log('Extracted pay period:', parsedData.pay_period_start, 'to', parsedData.pay_period_end);
            }
            
            // Extract pay date
            const payDateMatch = fileContent.match(/Pay Date:\s*(\d{4}-\d{2}-\d{2})/i);
            if (payDateMatch) {
                parsedData.pay_date = payDateMatch[1];
                console.log('Extracted pay_date:', parsedData.pay_date);
            }
            
            // Extract gross pay
            const grossPayMatch = fileContent.match(/Gross Pay:\s+\$?\s*([\d,]+\.?\d*)/i);
            if (grossPayMatch) {
                parsedData.gross_pay = parseFloat(grossPayMatch[1].replace(/,/g, ''));
                console.log('Extracted gross_pay:', parsedData.gross_pay);
            }
            
            // Extract Federal Tax
            const federalTaxMatch = fileContent.match(/Federal Tax\s+\$?\s*([\d,]+\.?\d*)/i);
            let federalTax = 0;
            if (federalTaxMatch) {
                federalTax = parseFloat(federalTaxMatch[1].replace(/,/g, ''));
                console.log('Extracted Federal Tax:', federalTax);
            }
            
            // Extract Provincial Tax
            const provincialTaxMatch = fileContent.match(/Provincial Tax\s+\$?\s*([\d,]+\.?\d*)/i);
            let provincialTax = 0;
            if (provincialTaxMatch) {
                provincialTax = parseFloat(provincialTaxMatch[1].replace(/,/g, ''));
                console.log('Extracted Provincial Tax:', provincialTax);
            }
            
            // Calculate Income Tax (Federal + Provincial)
            parsedData.income_tax = Math.round((federalTax + provincialTax) * 100) / 100;
            console.log('Calculated income_tax:', parsedData.income_tax);
            
            // Extract CPP Contribution
            const cppMatch = fileContent.match(/CPP Contribution\s+\$?\s*([\d,]+\.?\d*)/i);
            if (cppMatch) {
                parsedData.cpp_contribution = parseFloat(cppMatch[1].replace(/,/g, ''));
                console.log('Extracted cpp_contribution:', parsedData.cpp_contribution);
            }
            
            // Extract CPP2 Contribution
            const cpp2Match = fileContent.match(/CPP2 Contribution\s+\$?\s*([\d,]+\.?\d*)/i);
            if (cpp2Match) {
                parsedData.cpp2_contribution = parseFloat(cpp2Match[1].replace(/,/g, ''));
                console.log('Extracted cpp2_contribution:', parsedData.cpp2_contribution);
            }
            
            // Extract EI Premium (Employee)
            const eiMatch = fileContent.match(/(?:^|\n)EI Premium\s+\$?\s*([\d,]+\.?\d*)/im);
            if (eiMatch) {
                parsedData.ei_premium = parseFloat(eiMatch[1].replace(/,/g, ''));
                console.log('Extracted ei_premium:', parsedData.ei_premium);
            }
            
            // Extract total employee deductions
            const deductionsMatch = fileContent.match(/Total Employee Deductions:\s+\$?\s*([\d,]+\.?\d*)/i);
            if (deductionsMatch) {
                parsedData.deductions = parseFloat(deductionsMatch[1].replace(/,/g, ''));
                console.log('Extracted deductions:', parsedData.deductions);
            }

            // Extract Additional Deductions (with GL codes)
            const additionalDeductions = [];
            // Regex to match lines like: "Description (GL: 1234) $ 123.45"
            // Note: We use global flag 'g' with matchAll
            const additionalDeductionRegex = /^(.*?)\s+\(GL:\s*(\d+)\)\s+\$?\s*([\d,]+\.?\d*)/gm;
            
            // We need to look through the whole file or just the deduction section. 
            // Since the pattern includes (GL: XXXX), it's likely unique enough to run on the whole file content.
            const additionalMatches = fileContent.matchAll(additionalDeductionRegex);
            
            for (const match of additionalMatches) {
                const description = match[1].trim();
                const glAccount = match[2];
                const amount = parseFloat(match[3].replace(/,/g, ''));
                
                additionalDeductions.push({
                    description: description,
                    gl_account: glAccount,
                    amount: amount
                });
            }
            
            if (additionalDeductions.length > 0) {
                parsedData.additional_deductions = additionalDeductions;
                console.log('Extracted additional deductions:', additionalDeductions);
            }
            
            // Extract CPP Employer Contribution
            const cppEmployerMatch = fileContent.match(/CPP Employer Contribution\s+\$?\s*([\d,]+\.?\d*)/i);
            if (cppEmployerMatch) {
                parsedData.cpp_employer = parseFloat(cppEmployerMatch[1].replace(/,/g, ''));
                console.log('Extracted cpp_employer:', parsedData.cpp_employer);
            }
            
            // Extract CPP2 Employer Contribution
            const cpp2EmployerMatch = fileContent.match(/CPP2 Employer Contribution\s+\$?\s*([\d,]+\.?\d*)/i);
            if (cpp2EmployerMatch) {
                parsedData.cpp2_employer = parseFloat(cpp2EmployerMatch[1].replace(/,/g, ''));
                console.log('Extracted cpp2_employer:', parsedData.cpp2_employer);
            }
            
            // Extract EI Employer Premium
            const eiEmployerMatch = fileContent.match(/EI Employer Premium[^$]*\$?\s*([\d,]+\.?\d*)/i);
            if (eiEmployerMatch) {
                parsedData.ei_employer = parseFloat(eiEmployerMatch[1].replace(/,/g, ''));
                console.log('Extracted ei_employer:', parsedData.ei_employer);
            }
            
            // Extract Total Employer Cost
            const employerCostMatch = fileContent.match(/Total Employer Cost:\s+\$?\s*([\d,]+\.?\d*)/i);
            if (employerCostMatch) {
                parsedData.employer_cost = parseFloat(employerCostMatch[1].replace(/,/g, ''));
                console.log('Extracted employer_cost:', parsedData.employer_cost);
            }
            
            // Extract net pay
            const netPayMatch = fileContent.match(/NET PAY\s+\$?\s*([\d,]+\.?\d*)/i);
            if (netPayMatch) {
                parsedData.net_pay = parseFloat(netPayMatch[1].replace(/,/g, ''));
                console.log('Extracted net_pay:', parsedData.net_pay);
            }
            
            // Extract Total Cost to Employer
            const totalEmployerCostMatch = fileContent.match(/TOTAL COST TO EMPLOYER[^$]*:\s+\$?\s*([\d,]+\.?\d*)/i);
            if (totalEmployerCostMatch) {
                parsedData.total_employer_cost = parseFloat(totalEmployerCostMatch[1].replace(/,/g, ''));
                console.log('Extracted total_employer_cost:', parsedData.total_employer_cost);
            }
            
            // Extract employee reference from paycheque number
            if (paychequeNumMatch) {
                parsedData.employee_reference = paychequeNumMatch[1];
            }

        } else if (isRemittance) {
            // Parse Remittance file - Combined format
            parsedData.transaction_type = 'Remittance';
            
            // Extract remittance date
            const remittanceDateMatch = fileContent.match(/Remittance Date:\s*(\d{4}-\d{2}-\d{2})/i);
            if (remittanceDateMatch) {
                parsedData.pay_date = remittanceDateMatch[1];
                console.log('Extracted remittance pay_date:', parsedData.pay_date);
            }
            
            // Extract remittance period
            const remittancePeriodMatch = fileContent.match(/Remittance Period:\s*(\d{4}-\d{2}-\d{2})\s*to\s*(\d{4}-\d{2}-\d{2})/i);
            if (remittancePeriodMatch) {
                parsedData.remittance_period_start = remittancePeriodMatch[1];
                parsedData.remittance_period_end = remittancePeriodMatch[2];
                console.log('Extracted remittance period:', parsedData.remittance_period_start, 'to', parsedData.remittance_period_end);
            }
            
            // Extract paycheque numbers from the detailed table
            const paychequeNumbers = [];
            const paychequeMatches = fileContent.matchAll(/(\d{6}-\d{3})\s+[\w\s]+\s+\d{4}-\d{2}-\d{2}/g);
            for (const match of paychequeMatches) {
                paychequeNumbers.push(match[1]);
            }
            if (paychequeNumbers.length > 0) {
                parsedData.paycheque_numbers_included = paychequeNumbers.join(', ');
                console.log('Extracted paycheque numbers:', parsedData.paycheque_numbers_included);
            }
            
            // Extract Income Tax (combined Federal & Provincial) - Line Total column
            const incomeTaxMatch = fileContent.match(/Income Tax[^$]*\$?\s*([\d,]+\.?\d*)\s+N\/A\s+\$?\s*([\d,]+\.?\d*)/i);
            if (incomeTaxMatch) {
                parsedData.income_tax = parseFloat(incomeTaxMatch[2].replace(/,/g, ''));
                console.log('Extracted income_tax:', parsedData.income_tax);
            }
            
            // Extract CPP (Line Total = Employee + Employer)
            const cppMatch = fileContent.match(/Canada Pension Plan[^$]*\$?\s*([\d,]+\.?\d*)\s+\$?\s*([\d,]+\.?\d*)\s+\$?\s*([\d,]+\.?\d*)/i);
            if (cppMatch) {
                const employeeAmount = parseFloat(cppMatch[1].replace(/,/g, ''));
                const employerAmount = parseFloat(cppMatch[2].replace(/,/g, ''));
                const totalAmount = parseFloat(cppMatch[3].replace(/,/g, ''));
                
                parsedData.cpp_contribution = employeeAmount;
                parsedData.cpp_employer = employerAmount;
                console.log('Extracted CPP - Employee:', employeeAmount, 'Employer:', employerAmount, 'Total:', totalAmount);
            }
            
            // Extract EI (Line Total = Employee + Employer)
            const eiMatch = fileContent.match(/Employment Insurance[^$]*\$?\s*([\d,]+\.?\d*)\s+\$?\s*([\d,]+\.?\d*)\s+\$?\s*([\d,]+\.?\d*)/i);
            if (eiMatch) {
                const employeeAmount = parseFloat(eiMatch[1].replace(/,/g, ''));
                const employerAmount = parseFloat(eiMatch[2].replace(/,/g, ''));
                const totalAmount = parseFloat(eiMatch[3].replace(/,/g, ''));
                
                parsedData.ei_premium = employeeAmount;
                parsedData.ei_employer = employerAmount;
                console.log('Extracted EI - Employee:', employeeAmount, 'Employer:', employerAmount, 'Total:', totalAmount);
            }
            
            // Extract total remittance amount
            const totalRemittanceMatch = fileContent.match(/TOTAL REMITTANCE:\s+\$?\s*([\d,]+\.?\d*)/i);
            if (totalRemittanceMatch) {
                parsedData.amount = parseFloat(totalRemittanceMatch[1].replace(/,/g, ''));
                console.log('Extracted total remittance amount:', parsedData.amount);
            }
        }

        // Store the import metadata
        parsedData.import_file_name = fileName || 'uploaded_file.txt';
        parsedData.import_date = new Date().toISOString();

        console.log('Final parsed data:', parsedData);

        return Response.json({ 
            success: true, 
            data: parsedData 
        });

    } catch (error) {
        console.error('Error parsing payroll file:', error);
        return Response.json({ 
            error: error.message || 'Failed to parse payroll file' 
        }, { status: 500 });
    }
});
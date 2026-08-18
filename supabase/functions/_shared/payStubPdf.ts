import { jsPDF } from 'npm:jspdf@2.5.2';

// Shared pay-stub PDF builder - factored out of PayPRO's two near-duplicate source
// generators (generatePayStubPDF/generatePayStubPDFEmployer) so paypro-generatePayStubPDF,
// paypro-generatePayStubPDFEmployer, and paypro-emailPaystubs (in-process, no HTTP
// round-trip) all produce byte-identical output from one code path.
//
// D8: vacation-pay figures are read from the stub's own stored income_breakdown line
// items, never recomputed from the employee's *current* vacation_pay_rate - a stub's
// PDF can't silently drift if the employee's rate changes after the fact.
// D6: employer EI uses PayPro_TaxYearConstant.ei_rate_employer_multiplier for the
// stub's year, not a hardcoded 1.4 - falls back to 1.4 only if no constant row exists
// for that year (defensive, shouldn't happen for any real stub).

const formatCurrency = (amount: number) => `$${(amount || 0).toFixed(2)}`;

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return 'Not Set';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function buildPayStubPdf(
  stub: any,
  employee: any,
  taxYearConstant: any,
  options: { employerCopy?: boolean } = {},
) {
  const employerCopy = !!options.employerCopy;
  const employerMultiplier = taxYearConstant?.ei_rate_employer_multiplier ?? 1.4;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const darkGray: [number, number, number] = [74, 85, 104];
  const lightGray: [number, number, number] = [241, 245, 249];
  const white: [number, number, number] = [255, 255, 255];
  const green: [number, number, number] = [22, 163, 74];
  const lightGreen: [number, number, number] = [220, 252, 231];

  let y = 10;

  // Company Header - verbatim block, matches autopro-generateARReceiptPDF
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text("Ken's Auto & Diesel Repair", pageWidth / 2, y + 8, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text("5002 49 Ave - PO Box 160, Dewberry, AB T0B 1G0", pageWidth / 2, y + 16, { align: 'center' });

  doc.setFontSize(9);
  doc.text("Phone: 780-847-3002  |  Fax: 780-847-3004  |  Email: Shop@kensauto.ca", pageWidth / 2, y + 23, { align: 'center' });

  if (employerCopy) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 0, 0);
    doc.text("EMPLOYER COPY", pageWidth / 2, y + 32, { align: 'center' });
    y += 40;
  } else {
    y += 32;
  }

  const leftColX = 14;
  const rightColX = pageWidth / 2 + 5;
  const colWidth = (pageWidth - 30) / 2 - 5;

  // Employee Name & Address Box Header
  doc.setFillColor(...darkGray);
  doc.rect(10, y, colWidth + 4, 6, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text("Employee Name & Address", leftColX, y + 4);

  // Statement of Earnings Box Header
  doc.setFillColor(...darkGray);
  doc.rect(rightColX - 4, y, colWidth + 4, 6, 'F');
  doc.setTextColor(...white);
  doc.text("Statement of Earnings", rightColX, y + 4);
  y += 8;

  // Employee Info Content
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`${employee.first_name} ${employee.last_name}`, leftColX, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  let empY = y + 10;
  if (employee.address) {
    doc.text(employee.address, leftColX, empY);
    empY += 4;
  }
  const cityLine = [employee.town, employee.province, employee.postal_code].filter(Boolean).join(', ');
  if (cityLine) {
    doc.text(cityLine, leftColX, empY);
  }

  // Statement of Earnings Content
  doc.setFontSize(9);
  let payY = y + 5;
  doc.setFont('helvetica', 'bold');
  doc.text("Payment Date:", rightColX, payY);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(stub.pay_date), rightColX + 60, payY);
  payY += 5;

  doc.setFont('helvetica', 'bold');
  doc.text("Pay Period Start:", rightColX, payY);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(stub.pay_period_start), rightColX + 60, payY);
  payY += 5;

  doc.setFont('helvetica', 'bold');
  doc.text("Pay Period End:", rightColX, payY);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(stub.pay_period_end), rightColX + 60, payY);
  payY += 7;

  // Payment Amount highlight
  doc.setFillColor(254, 252, 191);
  doc.rect(rightColX - 4, payY - 3, colWidth + 4, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text("Payment Amount:", rightColX, payY + 2);
  doc.text(formatCurrency(stub.net_pay), rightColX + 60, payY + 2);

  y += 35;

  // Income Section Header
  doc.setFillColor(...darkGray);
  doc.rect(10, y, (pageWidth - 25) / 2, 6, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text("Income", leftColX, y + 4);

  // Deductions Section Header
  doc.setFillColor(...darkGray);
  doc.rect(pageWidth / 2 + 2.5, y, (pageWidth - 25) / 2, 6, 'F');
  doc.setTextColor(...white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text("Deductions", rightColX, y + 4);
  y += 8;

  const incomeBreakdown = stub.income_breakdown || [{ type: 'Regular', hours: 0, rate: 0, amount: stub.gross_pay, unit: 'Hour' }];
  const isVacationBanked = employee.is_vacation_banked || false;

  // Income table headers
  doc.setFillColor(...lightGray);
  doc.rect(10, y, (pageWidth - 25) / 2, 5, 'F');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text("Type", 12, y + 3.5);
  doc.text("Units", 38, y + 3.5);
  doc.text("Rate", 50, y + 3.5);
  doc.text("Amount", 87, y + 3.5, { align: 'right' });

  // Deduction subheaders
  doc.setFillColor(...lightGray);
  doc.rect(pageWidth / 2 + 2.5, y, (pageWidth - 25) / 2, 5, 'F');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text("Deduction", rightColX, y + 3.5);
  if (employerCopy) {
    doc.text("Employee", pageWidth - 38, y + 3.5, { align: 'right' });
    doc.text("Employer", pageWidth - 14, y + 3.5, { align: 'right' });
  } else {
    doc.text("Amount", pageWidth - 17, y + 3.5, { align: 'right' });
  }

  y += 6;
  const incomeStartY = y;
  const deductionStartY = y;

  // Income rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  let incomeY = incomeStartY;
  incomeBreakdown.forEach((item: any) => {
    const isBankedVacation = item.type === 'Vacation Pay' && isVacationBanked;
    const isReleased = item.type === 'Vacation Pay (Released from Bank)';

    let rateText = "-";
    if (!item.type.includes('Vacation Pay')) {
      rateText = `${formatCurrency(item.rate || 0)}/ ${item.unit || 'Hour'}`;
    }

    const rateDims = doc.getTextDimensions(rateText, { maxWidth: 22 });
    const rowHeight = Math.max(5, rateDims.h + 2);

    if (isBankedVacation || isReleased) {
      doc.setFillColor(...lightGreen);
      doc.rect(10, incomeY - 1, (pageWidth - 25) / 2, rowHeight, 'F');
      doc.setTextColor(...green);
    } else {
      doc.setTextColor(0, 0, 0);
    }

    const label = isBankedVacation ? 'Vacation Pay (Banked)' : item.type;
    const textY = incomeY + 2.5;

    doc.text(label, 12, textY);

    if (!item.type.includes('Vacation Pay')) {
      doc.text((item.hours || 0).toFixed(2), 38, textY);
      doc.text(rateText, 50, textY, { maxWidth: 22 });
    } else {
      doc.text("-", 38, textY);
      doc.text("-", 50, textY);
    }
    doc.text(formatCurrency(item.amount), 87, textY, { align: 'right' });
    incomeY += rowHeight;
  });

  // Gross Pay total
  incomeY += 2;
  doc.setFillColor(...lightGray);
  doc.rect(10, incomeY - 1, (pageWidth - 25) / 2, 6, 'F');
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text("Gross Income:", 12, incomeY + 3);
  doc.text(formatCurrency(stub.gross_pay), 87, incomeY + 3, { align: 'right' });
  incomeY += 8;

  // D8: vacation pay figures come from the stub's own stored income_breakdown, never
  // recomputed from employee.vacation_pay_rate - true regardless of employer/employee copy.
  const vacationPayEarned = incomeBreakdown
    .filter((item: any) => item.type === 'Vacation Pay')
    .reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  const vacationPayReleased = incomeBreakdown
    .filter((item: any) => item.type === 'Vacation Pay (Released from Bank)')
    .reduce((sum: number, item: any) => sum + (item.amount || 0), 0);

  const previousBalance = stub.vacation_pay_balance_forward != null
    ? stub.vacation_pay_balance_forward
    : (employee.banked_vacation_pay_balance || 0) - vacationPayEarned + vacationPayReleased;

  const newBalance = previousBalance + vacationPayEarned - vacationPayReleased;

  // D3: tighter guard than source's two server functions (which showed this block
  // whenever isVacationBanked, even at all-zero) - matches the client component's guard.
  const shouldShowBankedSummary = isVacationBanked && (previousBalance > 0 || vacationPayEarned > 0 || vacationPayReleased > 0);

  if (shouldShowBankedSummary) {
    incomeY += 4;

    doc.setFillColor(...darkGray);
    doc.rect(10, incomeY, (pageWidth - 25) / 2, 6, 'F');
    doc.setTextColor(...white);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text("Banked Vacation Pay", leftColX, incomeY + 4);
    incomeY += 8;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    doc.text("Previous Balance:", 12, incomeY + 2.5);
    doc.text(formatCurrency(previousBalance), 87, incomeY + 2.5, { align: 'right' });
    incomeY += 5;
    doc.text("Accrued This Period:", 12, incomeY + 2.5);
    doc.text(formatCurrency(vacationPayEarned), 87, incomeY + 2.5, { align: 'right' });
    incomeY += 5;
    doc.text("Released This Period:", 12, incomeY + 2.5);
    doc.text(formatCurrency(vacationPayReleased), 87, incomeY + 2.5, { align: 'right' });
    incomeY += 4;

    doc.setFillColor(...lightGray);
    doc.rect(10, incomeY - 1, (pageWidth - 25) / 2, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("New Balance:", 12, incomeY + 3);
    doc.text(formatCurrency(newBalance), 87, incomeY + 3, { align: 'right' });
    incomeY += 8;
  }

  // Deductions rows
  let deductionY = deductionStartY;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  const incomeTax = (stub.federal_tax || 0) + (stub.provincial_tax || 0);
  const employeeEI = stub.ei_deduction || 0;
  const employeeCPP = stub.cpp_deduction || 0;
  const employeeCPP2 = stub.cpp2_deduction || 0;

  if (employerCopy) {
    const employerEI = employeeEI * employerMultiplier;
    const employerCPP = employeeCPP; // 1:1 match, CRA's own rule - no separate constant
    const employerCPP2 = employeeCPP2;

    const deductionRows = [
      { name: 'Income Tax', employee: incomeTax, employer: 0 },
      { name: 'EI', employee: employeeEI, employer: employerEI },
      { name: 'CPP', employee: employeeCPP, employer: employerCPP },
      { name: 'CPP2', employee: employeeCPP2, employer: employerCPP2 },
    ];

    if (stub.additional_deductions && stub.additional_deductions.length > 0) {
      stub.additional_deductions.forEach((d: any) => {
        deductionRows.push({ name: d.name, employee: d.amount || 0, employer: 0 });
      });
    }

    deductionRows.forEach((d) => {
      doc.text(d.name, rightColX, deductionY + 2.5);
      doc.text(formatCurrency(d.employee), pageWidth - 38, deductionY + 2.5, { align: 'right' });
      doc.text(formatCurrency(d.employer), pageWidth - 14, deductionY + 2.5, { align: 'right' });
      deductionY += 5;
    });

    const totalEmployeeDeductions = incomeTax + employeeCPP + employeeCPP2 + employeeEI +
      (stub.additional_deductions || []).reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
    const totalEmployerDeductions = employerCPP + employerCPP2 + employerEI;

    deductionY += 2;
    doc.setFillColor(...lightGray);
    doc.rect(pageWidth / 2 + 2.5, deductionY - 1, (pageWidth - 25) / 2, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("Total:", rightColX, deductionY + 3);
    doc.text(formatCurrency(totalEmployeeDeductions), pageWidth - 38, deductionY + 3, { align: 'right' });
    doc.text(formatCurrency(totalEmployerDeductions), pageWidth - 14, deductionY + 3, { align: 'right' });
  } else {
    const deductions = [
      { name: 'Income Tax', amount: incomeTax },
      { name: 'EI', amount: employeeEI },
      { name: 'CPP', amount: employeeCPP },
      { name: 'CPP2', amount: employeeCPP2 },
    ];

    if (stub.additional_deductions && stub.additional_deductions.length > 0) {
      stub.additional_deductions.forEach((d: any) => {
        deductions.push({ name: d.name, amount: d.amount || 0 });
      });
    }

    deductions.forEach((d) => {
      doc.text(d.name, rightColX, deductionY + 2.5);
      doc.text(formatCurrency(d.amount), pageWidth - 17, deductionY + 2.5, { align: 'right' });
      deductionY += 5;
    });

    const totalDeductions = incomeTax + employeeCPP + employeeCPP2 + employeeEI;

    deductionY += 2;
    doc.setFillColor(...lightGray);
    doc.rect(pageWidth / 2 + 2.5, deductionY - 1, (pageWidth - 25) / 2, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("Total Deductions:", rightColX, deductionY + 3);
    doc.text(formatCurrency(totalDeductions), pageWidth - 17, deductionY + 3, { align: 'right' });
  }

  // Year to Date Section
  y = Math.max(incomeY, deductionY) + 10;

  if (employerCopy) {
    doc.setFillColor(...darkGray);
    doc.rect(10, y, (pageWidth - 25) / 2, 6, 'F');
    doc.setTextColor(...white);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text("Year to Date - Employee", leftColX, y + 4);

    doc.setFillColor(...darkGray);
    doc.rect(pageWidth / 2 + 2.5, y, (pageWidth - 25) / 2, 6, 'F');
    doc.setTextColor(...white);
    doc.text("Year to Date - Employer", rightColX, y + 4);
    y += 8;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    const ytdLeftX = 12;
    const ytdRightX = pageWidth / 2 + 5;
    const ytdEmployerEI = (stub.ytd_ei || 0) * employerMultiplier;
    const ytdEmployerTotal = (stub.ytd_cpp || 0) + (stub.ytd_cpp2 || 0) + ytdEmployerEI;

    doc.text("Gross Pay:", ytdLeftX, y + 2.5);
    doc.text(formatCurrency(stub.ytd_gross), 87, y + 2.5, { align: 'right' });
    doc.text("CPP:", ytdRightX, y + 2.5);
    doc.text(formatCurrency(stub.ytd_cpp), pageWidth - 14, y + 2.5, { align: 'right' });
    y += 5;

    const ytdIncomeTax = (stub.ytd_federal_tax || 0) + (stub.ytd_provincial_tax || 0);
    doc.text("Income Tax:", ytdLeftX, y + 2.5);
    doc.text(formatCurrency(ytdIncomeTax), 87, y + 2.5, { align: 'right' });
    doc.text("CPP2:", ytdRightX, y + 2.5);
    doc.text(formatCurrency(stub.ytd_cpp2), pageWidth - 14, y + 2.5, { align: 'right' });
    y += 5;

    doc.text("CPP:", ytdLeftX, y + 2.5);
    doc.text(formatCurrency(stub.ytd_cpp), 87, y + 2.5, { align: 'right' });
    doc.text("EI (x" + employerMultiplier + "):", ytdRightX, y + 2.5);
    doc.text(formatCurrency(ytdEmployerEI), pageWidth - 14, y + 2.5, { align: 'right' });
    y += 5;

    doc.text("CPP2:", ytdLeftX, y + 2.5);
    doc.text(formatCurrency(stub.ytd_cpp2), 87, y + 2.5, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text("Total:", ytdRightX, y + 2.5);
    doc.text(formatCurrency(ytdEmployerTotal), pageWidth - 14, y + 2.5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 5;

    doc.text("EI:", ytdLeftX, y + 2.5);
    doc.text(formatCurrency(stub.ytd_ei), 87, y + 2.5, { align: 'right' });
    y += 5;

    doc.text("Net Pay:", ytdLeftX, y + 2.5);
    doc.text(formatCurrency(stub.ytd_net), 87, y + 2.5, { align: 'right' });
    y += 10;
  } else {
    doc.setFillColor(...darkGray);
    doc.rect(10, y, pageWidth - 20, 6, 'F');
    doc.setTextColor(...white);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text("Year to Date", leftColX, y + 4);
    y += 8;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    const ytdLeftX = 12;
    const ytdRightX = pageWidth / 2 + 5;

    doc.text("Gross Pay:", ytdLeftX, y + 2.5);
    doc.text(formatCurrency(stub.ytd_gross), 87, y + 2.5, { align: 'right' });
    doc.text("Net Pay:", ytdRightX, y + 2.5);
    doc.text(formatCurrency(stub.ytd_net), pageWidth - 17, y + 2.5, { align: 'right' });
    y += 5;

    const ytdIncomeTax = (stub.ytd_federal_tax || 0) + (stub.ytd_provincial_tax || 0);
    doc.text("Income Tax:", ytdLeftX, y + 2.5);
    doc.text(formatCurrency(ytdIncomeTax), 87, y + 2.5, { align: 'right' });
    doc.text("CPP:", ytdRightX, y + 2.5);
    doc.text(formatCurrency(stub.ytd_cpp), pageWidth - 17, y + 2.5, { align: 'right' });
    y += 5;

    doc.text("CPP2:", ytdLeftX, y + 2.5);
    doc.text(formatCurrency(stub.ytd_cpp2), 87, y + 2.5, { align: 'right' });
    doc.text("EI:", ytdRightX, y + 2.5);
    doc.text(formatCurrency(stub.ytd_ei), pageWidth - 17, y + 2.5, { align: 'right' });
    y += 10;
  }

  // Comments section if present
  if (stub.comments) {
    doc.setFillColor(239, 246, 255);
    doc.rect(10, y, pageWidth - 20, 15, 'F');
    doc.setTextColor(55, 65, 81);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text("COMMENTS / NOTES:", 14, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(stub.comments, 14, y + 10);
  }

  const pdfDataUri = doc.output('datauristring');
  const employeeName = `${employee.first_name}_${employee.last_name}`.replace(/[^a-zA-Z0-9_]/g, '');
  const filename = `${employerCopy ? 'Employer' : 'Employee'}_Pay_Stub-${employeeName}.pdf`;

  return { pdfDataUri, filename };
}

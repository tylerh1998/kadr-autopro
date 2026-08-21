// TaxCalculator.js - Updated for dynamic 2026 calculations with CPP2

export const calculateTax = (annualTaxableIncome, basicPersonalFederal, basicPersonalProvincial, annualTaxCreditsBase, taxConstants) => {
  const { federal_tax_brackets, provincial_tax_brackets_ab } = taxConstants;

  // --- FEDERAL TAX ---
  // 1. Calculate Gross Federal Tax (Do NOT subtract basic personal amount yet)
  let grossFederalTax = 0;
  let remainingFed = annualTaxableIncome;
  
  for (const bracket of federal_tax_brackets) {
    if (remainingFed <= 0) break;
    const maxInBracket = bracket.max ? bracket.max - bracket.min : Infinity;
    const taxableInBracket = Math.min(remainingFed, maxInBracket);
    grossFederalTax += taxableInBracket * bracket.rate;
    remainingFed -= taxableInBracket;
  }

  // 2. Calculate Federal Tax Credits
  // Tax credits are strictly calculated at the lowest bracket's rate (15%)
  const lowestFedRate = federal_tax_brackets[0].rate; 
  const totalFedCredits = basicPersonalFederal + annualTaxCreditsBase;
  const federalCreditValue = totalFedCredits * lowestFedRate;

  // 3. Apply Credits to get Net Federal Tax
  const federalTax = Math.max(0, grossFederalTax - federalCreditValue);

  // --- PROVINCIAL TAX (ALBERTA) ---
  // 1. Calculate Gross Provincial Tax
  let grossProvincialTax = 0;
  let remainingProv = annualTaxableIncome;
  
  for (const bracket of provincial_tax_brackets_ab) {
    if (remainingProv <= 0) break;
    const maxInBracket = bracket.max ? bracket.max - bracket.min : Infinity;
    const taxableInBracket = Math.min(remainingProv, maxInBracket);
    grossProvincialTax += taxableInBracket * bracket.rate;
    remainingProv -= taxableInBracket;
  }

  // 2. Calculate Provincial Tax Credits
  // Tax credits are strictly calculated at the lowest bracket's rate (10% for AB)
  const lowestProvRate = provincial_tax_brackets_ab[0].rate; 
  const totalProvCredits = basicPersonalProvincial + annualTaxCreditsBase;
  const provincialCreditValue = totalProvCredits * lowestProvRate;

  // 3. Apply Credits to get Net Provincial Tax
  const provincialTax = Math.max(0, grossProvincialTax - provincialCreditValue);

  return {
    federalTax,
    provincialTax
  };
};

export const calculateCPP = (grossPay, payPeriodsPerYear, ytdCPP, isExempt, taxConstants) => {
  if (isExempt) return 0;
  
  const { cpp_max_pensionable_earnings, cpp_basic_exemption, cpp_rate_employee } = taxConstants;
  
  // Annual maximum contribution
  const maxAnnualContribution = (cpp_max_pensionable_earnings - cpp_basic_exemption) * cpp_rate_employee;
  const remainingRoom = Math.max(0, maxAnnualContribution - ytdCPP);
  
  // Pay period basic exemption
  const periodExemption = cpp_basic_exemption / payPeriodsPerYear;
  
  // Contributory earnings for this period
  const contributoryEarnings = Math.max(0, grossPay - periodExemption);
  
  // Calculate contribution
  const contribution = contributoryEarnings * cpp_rate_employee;
  
  // Return lesser of calculated contribution or remaining annual room
  // Round to 2 decimal places as per CRA
  return Math.min(remainingRoom, Math.round(contribution * 100) / 100);
};

export const calculateCPP2 = (grossPay, ytdPensionableEarnings, ytdCPP2, isExempt, taxConstants) => {
  if (isExempt) return 0;

  const { cpp_max_pensionable_earnings, cpp2_max_pensionable_earnings, cpp2_rate_employee } = taxConstants;
  const YMPE = cpp_max_pensionable_earnings;
  const YAMPE = cpp2_max_pensionable_earnings;

  // Maximum annual CPP2 contribution
  const maxAnnualCPP2 = (YAMPE - YMPE) * cpp2_rate_employee;
  const remainingRoom = Math.max(0, maxAnnualCPP2 - ytdCPP2);

  if (remainingRoom <= 0) return 0;

  // Determine earnings subject to CPP2
  // Formula: (PIYTD + PI - W) * Rate
  // Where W is greater of PIYTD or YMPE (we assume YMPE for simplicity of formula transition logic)
  // More precisely:
  // We need to see how much of the current gross pay pushes the YTD earnings into the [YMPE, YAMPE] range.
  
  const previousYtdEarnings = ytdPensionableEarnings;
  const newYtdEarnings = previousYtdEarnings + grossPay;

  // Earnings falling within the CPP2 band [YMPE, YAMPE]
  const startInBand = Math.max(previousYtdEarnings, YMPE);
  const endInBand = Math.min(newYtdEarnings, YAMPE);
  
  const earningsSubjectToCPP2 = Math.max(0, endInBand - startInBand);

  const contribution = earningsSubjectToCPP2 * cpp2_rate_employee;

  return Math.min(remainingRoom, Math.round(contribution * 100) / 100);
};

export const calculateEI = (grossPay, ytdEI, isExempt, taxConstants) => {
  if (isExempt) return 0;
  
  const { ei_max_insurable_earnings, ei_rate_employee } = taxConstants;
  
  const maxAnnualPremium = ei_max_insurable_earnings * ei_rate_employee;
  const remainingRoom = Math.max(0, maxAnnualPremium - ytdEI);
  
  const premium = grossPay * ei_rate_employee;
  
  return Math.min(remainingRoom, Math.round(premium * 100) / 100);
};

export const calculatePayrollDeductions = (grossPay, payFrequency, employee, ytdAmounts = {}, taxConstants) => {
  if (!taxConstants) {
    throw new Error("Tax constants not provided for calculation.");
  }

  const payPeriodsPerYear = {
    weekly: 52,
    bi_weekly: 26,
    semi_monthly: 24,
    monthly: 12
  };
  
  if (!(payFrequency in payPeriodsPerYear)) {
    throw new Error(`Invalid pay frequency: ${payFrequency}`);
  }

  const periods = payPeriodsPerYear[payFrequency];
  const annualGross = grossPay * periods; // For tax bracket estimation only

  // 1. Calculate CPP (Base & Enhanced)
  const cppTotalDeduction = calculateCPP(
    grossPay, 
    periods, 
    ytdAmounts.cpp || 0, 
    employee.is_cpp_exempt, 
    taxConstants
  );
  
  // Isolate the F5 Variable (The Deductible Enhancement)
  // The enhancement is 1.00% out of the total 5.95%
  const cppEnhancedDeduction = cppTotalDeduction * (1.00 / 5.95); 
  // The base credit is 4.95% out of the total 5.95%
  const cppBaseCredit = cppTotalDeduction * (4.95 / 5.95);

  // 2. Calculate CPP2 (Enhanced)
  const cpp2Deduction = calculateCPP2(
    grossPay,
    ytdAmounts.gross || 0, // PIYTD
    ytdAmounts.cpp2 || 0,
    employee.is_cpp_exempt,
    taxConstants
  );

  // 3. Calculate EI (Credit)
  const eiDeduction = calculateEI(
    grossPay, 
    ytdAmounts.ei || 0, 
    employee.is_ei_exempt, 
    taxConstants
  );

  // 4. Calculate Income Tax
  // Annualize for tax calculations
  const annualCppEnhanced = cppEnhancedDeduction * periods;
  const annualCpp2 = cpp2Deduction * periods;
  
  // ONLY subtract true deductions from the Gross to get Taxable Income
  const netTaxableAnnual = annualGross - annualCppEnhanced - annualCpp2; 

  // Pass the annualized credits to the tax function
  const annualCppBase = cppBaseCredit * periods;
  const annualEi = eiDeduction * periods;
  const annualTaxCreditsBase = annualCppBase + annualEi;

  const { federalTax: annualFedTax, provincialTax: annualProvTax } = calculateTax(
    netTaxableAnnual,
    (employee.federal_td1_basic !== undefined && employee.federal_td1_basic !== null) ? employee.federal_td1_basic : taxConstants.federal_basic_personal_amount,
    (employee.provincial_td1_basic !== undefined && employee.provincial_td1_basic !== null) ? employee.provincial_td1_basic : taxConstants.provincial_basic_personal_amount,
    annualTaxCreditsBase,
    taxConstants
  );

  const federalTax = annualFedTax / periods;
  const provincialTax = annualProvTax / periods;
  const cppDeduction = cppTotalDeduction;

  const totalDeductions = federalTax + provincialTax + cppDeduction + cpp2Deduction + eiDeduction;
  const netPay = grossPay - totalDeductions;

  return {
    grossPay: Math.round(grossPay * 100) / 100,
    federalTax: Math.round(federalTax * 100) / 100,
    provincialTax: Math.round(provincialTax * 100) / 100,
    cppDeduction: Math.round(cppDeduction * 100) / 100,
    cpp2Deduction: Math.round(cpp2Deduction * 100) / 100,
    eiDeduction: Math.round(eiDeduction * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    netPay: Math.round(netPay * 100) / 100
  };
};
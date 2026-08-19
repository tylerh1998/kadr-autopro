import { CRA_EMPLOYER } from './companyInfo';

// Element names, nesting order, required/optional flags and lengths below are
// transcribed directly from CRA's published tax-year-2026 technical specifications:
//   - T4/T4Summary: .../t619-2026/t4-2026.html
//   - T619 Electronic Transmittal: .../t619-2026.html
// Do not edit tag names without checking the current spec on canada.ca first -
// CRA schema-validates on upload and rejects anything that doesn't match exactly.

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/'/g, '&apos;')
  .replace(/"/g, '&quot;');

// CRA: "please ensure optional fields without values are removed from the XML
// file" - an empty <tag></tag> is treated differently than an absent one, so
// optional fields are omitted entirely rather than emitted blank.
const opt = (name, value) => {
  if (value === null || value === undefined || value === '') return '';
  return `<${name}>${escapeXml(value)}</${name}>`;
};

const req = (name, value, context) => {
  if (value === null || value === undefined || value === '') {
    throw new Error(`Missing required CRA XML field <${name}> for ${context}`);
  }
  return `<${name}>${escapeXml(value)}</${name}>`;
};

const money = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);
const digitsOnly = (s) => (s || '').replace(/\D/g, '');
const alnumOnly = (s) => (s || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

function validateEmployeeForXml(employee) {
  const missing = [];
  if (digitsOnly(employee.sin).length !== 9) missing.push('SIN (must be 9 digits)');
  if (!employee.address) missing.push('address');
  if (!employee.town) missing.push('city');
  if (!employee.postal_code) missing.push('postal code');
  return missing;
}

function buildT4SlipXml(employee, t4Data, reportTypeCode) {
  const context = `${employee.first_name} ${employee.last_name} (${employee.employee_id})`;
  const surname = (employee.last_name || '').toUpperCase().slice(0, 20);
  const givenName = (employee.first_name || '').toUpperCase().slice(0, 12);
  const province = (employee.province || CRA_EMPLOYER.province).toUpperCase().slice(0, 2);

  const empeName = `<EMPE_NM>${req('snm', surname, context)}${opt('gvn_nm', givenName)}</EMPE_NM>`;

  const empeAddr = `<EMPE_ADDR>${opt('addr_l1_txt', (employee.address || '').slice(0, 30))}` +
    `${opt('cty_nm', (employee.town || '').slice(0, 28))}${opt('prov_cd', province)}` +
    `${opt('cntry_cd', 'CAN')}${opt('pstl_cd', alnumOnly(employee.postal_code).slice(0, 10))}</EMPE_ADDR>`;

  const amounts = `<T4_AMT>${opt('empt_incamt', money(t4Data.box14))}` +
    `${opt('cpp_cntrb_amt', money(t4Data.box16))}${opt('cppe_cntrb_amt', t4Data.box16A > 0 ? money(t4Data.box16A) : '')}` +
    `${opt('empe_eip_amt', money(t4Data.box18))}${opt('itx_ddct_amt', money(t4Data.box22))}` +
    `${req('ei_insu_ern_amt', money(t4Data.box24), context)}${req('cpp_qpp_ern_amt', money(t4Data.box26), context)}` +
    `${t4Data.box52 > 0 ? opt('padj_amt', money(t4Data.box52)) : ''}</T4_AMT>`;

  return `<T4Slip>${empeName}${empeAddr}` +
    `${req('sin', digitsOnly(employee.sin) || '000000000', context)}` +
    `${req('bn', CRA_EMPLOYER.payrollAccountNumber, context)}` +
    `${req('cpp_qpp_xmpt_cd', employee.is_cpp_exempt ? '1' : '0', context)}` +
    `${req('ei_xmpt_cd', employee.is_ei_exempt ? '1' : '0', context)}` +
    `${req('rpt_tcd', reportTypeCode, context)}` +
    `${req('empt_prov_cd', province, context)}` +
    // No per-employee dental-benefit tracking exists yet - defaults every slip to
    // "1: not eligible". Verify against each employee's actual coverage before filing;
    // this is the one field in this file that is a real assumption, not spec-derived.
    `${req('empr_dntl_ben_rpt_cd', '1', context)}` +
    `${amounts}</T4Slip>`;
}

function buildT4SummaryXml(t4SummaryData, year, reportTypeCode, transmitterContact) {
  const grand = t4SummaryData.reduce((acc, { t4Data }) => {
    acc.income += t4Data.box14 || 0;
    acc.cpp += t4Data.box16 || 0;
    acc.cpp2 += t4Data.box16A || 0;
    acc.ei += t4Data.box18 || 0;
    acc.tax += t4Data.box22 || 0;
    acc.padj += t4Data.box52 || 0;
    acc.employerCpp += t4Data.employerCpp || 0;
    acc.employerEi += t4Data.employerEi || 0;
    return acc;
  }, { income: 0, cpp: 0, cpp2: 0, ei: 0, tax: 0, padj: 0, employerCpp: 0, employerEi: 0 });

  const emprName = `<EMPR_NM>${req('l1_nm', CRA_EMPLOYER.legalName.slice(0, 30), 'T4Summary')}</EMPR_NM>`;
  const emprAddr = `<EMPR_ADDR>${opt('addr_l1_txt', CRA_EMPLOYER.addressLine1.slice(0, 30))}` +
    `${opt('cty_nm', CRA_EMPLOYER.city.slice(0, 28))}${opt('prov_cd', CRA_EMPLOYER.province)}` +
    `${opt('cntry_cd', CRA_EMPLOYER.country)}${opt('pstl_cd', alnumOnly(CRA_EMPLOYER.postalCode))}</EMPR_ADDR>`;
  const cntc = `<CNTC>${req('cntc_nm', transmitterContact.name, 'T4Summary contact')}` +
    `${req('cntc_area_cd', transmitterContact.areaCode, 'T4Summary contact')}` +
    `${req('cntc_phn_nbr', transmitterContact.phoneNumber, 'T4Summary contact')}</CNTC>`;

  const tamt = `<T4_TAMT>${opt('tot_empt_incamt', money(grand.income))}` +
    `${opt('tot_empe_cpp_amt', money(grand.cpp))}${grand.cpp2 > 0 ? opt('tot_empe_cppe_amt', money(grand.cpp2)) : ''}` +
    `${opt('tot_empe_eip_amt', money(grand.ei))}${opt('tot_itx_ddct_amt', money(grand.tax))}` +
    `${grand.padj > 0 ? opt('tot_padj_amt', money(grand.padj)) : ''}` +
    `${opt('tot_empr_cpp_amt', money(grand.employerCpp))}${opt('tot_empr_eip_amt', money(grand.employerEi))}</T4_TAMT>`;

  return `<T4Summary>${req('bn', CRA_EMPLOYER.payrollAccountNumber, 'T4Summary')}${emprName}${emprAddr}${cntc}` +
    `${req('tx_yr', year, 'T4Summary')}${req('slp_cnt', t4SummaryData.length, 'T4Summary')}` +
    `${req('rpt_tcd', reportTypeCode, 'T4Summary')}${tamt}</T4Summary>`;
}

function buildT619Xml(submissionRefId, transmitterContact) {
  const context = 'T619 transmitter record';
  const transmitterAccount = `<TransmitterAccountNumber>${req('bn9', CRA_EMPLOYER.businessNumber9, context)}</TransmitterAccountNumber>`;
  const transmitterName = `<TransmitterName>${req('l1_nm', CRA_EMPLOYER.legalName.slice(0, 35), context)}</TransmitterName>`;
  const cntc = `<CNTC>${req('cntc_nm', transmitterContact.name, context)}` +
    `${req('cntc_area_cd', transmitterContact.areaCode, context)}` +
    `${req('cntc_phn_nbr', transmitterContact.phoneNumber, context)}` +
    `${req('cntc_email_area', transmitterContact.email, context)}</CNTC>`;

  return `<T619>${transmitterAccount}${opt('sbmt_ref_id', submissionRefId)}` +
    `${req('summ_cnt', '1', context)}${req('lang_cd', transmitterContact.language, context)}` +
    `${transmitterName}${req('TransmitterCountryCode', CRA_EMPLOYER.country, context)}${cntc}</T619>`;
}

// t4SummaryData: [{ employee, t4Data }] - same shape T4s.jsx already builds for the
// PDF generator. transmitterContact: { name, email, areaCode, phoneNumber, language } -
// collected per-export via CraXmlExportModal, since CRA requires a real contact person
// on every T619 record. reportTypeCode: 'O' (original), 'A' (amendment) or 'C' (cancel) -
// only 'O' is exposed in the UI for now.
export function buildT4XmlSubmission(t4SummaryData, year, transmitterContact, reportTypeCode = 'O') {
  if (!transmitterContact?.name || !transmitterContact?.email) {
    throw new Error('A transmitter contact name and email are required to generate the CRA XML file.');
  }

  const employeeIssues = t4SummaryData
    .map(({ employee }) => ({ employee, missing: validateEmployeeForXml(employee) }))
    .filter(({ missing }) => missing.length > 0);

  if (employeeIssues.length > 0) {
    const details = employeeIssues
      .map(({ employee, missing }) => `${employee.first_name} ${employee.last_name}: missing ${missing.join(', ')}`)
      .join('\n');
    throw new Error(`Cannot generate CRA XML - some employees are missing required data:\n${details}`);
  }

  const submissionRefId = `T4${year}${Math.floor(Math.random() * 1000000)}`.slice(0, 8);

  const slips = t4SummaryData.map(({ employee, t4Data }) => buildT4SlipXml(employee, t4Data, reportTypeCode)).join('');
  const summary = buildT4SummaryXml(t4SummaryData, year, reportTypeCode, transmitterContact);
  const t619 = buildT619Xml(submissionRefId, transmitterContact);

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Submission xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `${t619}<Return><T4>${slips}${summary}</T4></Return></Submission>`;
}

export function downloadT4Xml(t4SummaryData, year, transmitterContact, reportTypeCode = 'O') {
  const xml = buildT4XmlSubmission(t4SummaryData, year, transmitterContact, reportTypeCode);
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `T4_${year}_${CRA_EMPLOYER.payrollAccountNumber}.xml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

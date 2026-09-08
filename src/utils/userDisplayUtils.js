/**
 * Formats a created_by, updated_by, or user email/name field into a clean display string.
 * Maps legacy system audit strings (@no-reply.base44.com) and nulls to 'System',
 * and resolves employee emails to full names when available.
 * 
 * @param {string} emailOrName - Raw user email or name string from audit records
 * @param {Array} employees - Array of employee objects (optional)
 * @returns {string} Clean user display name
 */
export function formatAuditUserDisplay(emailOrName, employees = []) {
  if (!emailOrName) return 'System';
  
  // System strings & legacy base44 system emails
  if (emailOrName === 'System' || emailOrName.endsWith('@no-reply.base44.com')) {
    return 'System';
  }

  // Resolve against employee list if an email is passed
  if (employees && employees.length > 0) {
    const match = employees.find(e => e.email === emailOrName);
    if (match) {
      return match.full_name || `${match.first_name || ''} ${match.last_name || ''}`.trim() || emailOrName;
    }
  }

  return emailOrName;
}

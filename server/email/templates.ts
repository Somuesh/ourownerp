export function inviteEmailTemplate(params: { appUrl: string; role: string; inviterName: string }) {
  const subject = "You've been invited to Our ERP";
  const text = `${params.inviterName} has invited you to join Our ERP as ${params.role}. Sign in at ${params.appUrl} using this same email address to get started.`;
  const html = `
    <p>${params.inviterName} has invited you to join <strong>Our ERP</strong> as <strong>${params.role}</strong>.</p>
    <p><a href="${params.appUrl}">Sign in at ${params.appUrl}</a> using this same email address to get started.</p>
  `;
  return { subject, text, html };
}

export function invoiceEmailTemplate(params: { invoiceNumber: string; total: string; dueDate: string }) {
  const subject = `Invoice ${params.invoiceNumber}`;
  const text = `Please find attached invoice ${params.invoiceNumber} for ${params.total}, due ${params.dueDate}.`;
  const html = `
    <p>Please find attached invoice <strong>${params.invoiceNumber}</strong> for <strong>${params.total}</strong>, due ${params.dueDate}.</p>
  `;
  return { subject, text, html };
}

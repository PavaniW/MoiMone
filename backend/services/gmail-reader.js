// Gmail API integration (built in Session 11).
// Uses OAuth refresh-token flow (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET /
// GMAIL_REFRESH_TOKEN) to fetch unread emails from GMAIL_BANK_SENDER.

/**
 * Fetch unread bank notification emails.
 * @returns {Promise<Array<{id:string, text:string}>>}
 */
export async function fetchUnreadBankEmails() {
  throw new Error('Not implemented: fetchUnreadBankEmails');
}

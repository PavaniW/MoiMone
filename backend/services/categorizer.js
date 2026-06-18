// Maps a merchant / description to one of the seeded categories.
// Starts rule-based (keyword → category) and can fall back to Claude for
// unknown merchants. Built out alongside the parser in Session 3+.

/**
 * @param {{merchant?:string, description?:string}} txn
 * @returns {Promise<string>} a category name from the `categories` table
 */
export async function categorize(txn) {
  throw new Error('Not implemented: categorize');
}

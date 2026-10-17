export const WORK_STORAGE_LIMIT = 768 * 1024 * 1024;
export const SHARE_STORAGE_LIMIT = 128 * 1024 * 1024;
// ponytail: sum byte reservations while the entire library is capped below 1 GiB.
// For a larger service, move the images to R2 and replace scans with a transactional usage ledger.
export async function ensureByteAccounting(db, table, legacyBytes) {
 if (!['panorama_works','panorama_shares'].includes(table)) throw new Error('Invalid storage table');
 const columns = await db.prepare(`PRAGMA table_info(${table})`).all();
 if (!columns.results.some(column => column.name === 'stored_bytes')) {
   try { await db.prepare(`ALTER TABLE ${table} ADD COLUMN stored_bytes INTEGER NOT NULL DEFAULT ${legacyBytes}`).run(); }
   catch (error) {
     const current = await db.prepare(`PRAGMA table_info(${table})`).all();
     if (!current.results.some(column => column.name === 'stored_bytes')) throw error;
   }
 }
}

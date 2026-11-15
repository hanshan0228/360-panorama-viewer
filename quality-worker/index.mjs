import { initQualityReviewSchema, processQualityReviewBatch } from '../server/qualityReview.mjs';

export default {
  async scheduled(_controller, env, ctx) {
    const processing = processQualityReviewBatch({
      db: env.DB,
      storage: env.PANORAMA_SHARES,
      env,
      limit: 2,
    }).then(results => {
      console.log('[quality-review-worker]', JSON.stringify({ processed: results.length }));
    }).catch(() => {
      console.error('[quality-review-worker] batch failed');
    });
    ctx.waitUntil(processing);
  },
  async fetch(_request, env) {
    await initQualityReviewSchema(env.DB);
    return Response.json({ status: 'ok', worker: 'panorama-quality-reviews' });
  },
};

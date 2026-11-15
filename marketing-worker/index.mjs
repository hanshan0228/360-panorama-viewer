import { sendReminderBatch } from '../server/marketing.mjs';

export default {
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(sendReminderBatch({ db: env.DB, env }).then(result => {
      console.log('[marketing-reminders]', JSON.stringify(result));
    }).catch(() => { console.error('[marketing-reminders] batch failed'); }));
  },
};

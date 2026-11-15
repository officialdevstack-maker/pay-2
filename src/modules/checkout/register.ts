import 'server-only';
import { getHandler, registerHandler } from '@/modules/payments/handlers';
import { post, systemAccountId } from '@/modules/ledger';
import { handleCheckoutFunding } from './transfer-handler';

const previous = getHandler('funding.received');

registerHandler('funding.received', async (event, tx) => {
  if ((await handleCheckoutFunding(event, tx)) === 'matched') return;
  if (previous) return previous(event, tx);

  await post(
    {
      type: 'suspense_funding',
      idempotency: { scope: 'provider', key: event.eventId },
      entries: [
        { accountId: await systemAccountId('provider_clearing', tx), direction: 'debit', amount: event.amount },
        { accountId: await systemAccountId('suspense', tx), direction: 'credit', amount: event.amount },
      ],
      metadata: { event: event.eventId, reason: 'no_matching_account' },
    },
    tx,
  );
});

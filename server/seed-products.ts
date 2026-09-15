import { getUncachableStripeClient } from './stripeClient';
import { BILLING_PERIODS, periodPriceCents, type BillingPeriod } from '@shared/entitlements';

// Stripe products for the CARD path only (EcoCash via Paynow is the default —
// see server/payments/). Run manually: `npx tsx server/seed-products.ts`.
// Prices come from shared/entitlements.ts so they never drift from the app.

const PAID = [
  { tier: 'spark', name: 'Destira Spark', description: 'See who asked to meet you, plus more room to explore.' },
  { tier: 'flame', name: 'Destira Flame', description: 'The full twin-to-twin transcript every time, and host your own events.' },
  { tier: 'ember', name: 'Destira Ember', description: 'Nothing counts down — unlimited likes, interviews, groups and events.' },
] as const;

// Stripe's `recurring` shape per billing period. 6-month isn't a native
// interval — it's month with interval_count 6.
const STRIPE_RECURRING: Record<BillingPeriod, { interval: 'week' | 'month'; interval_count: number }> = {
  weekly: { interval: 'week', interval_count: 1 },
  monthly: { interval: 'month', interval_count: 1 },
  sixMonth: { interval: 'month', interval_count: 6 },
};

// The metadata tag stays `vibeflow` (historical): it's the key existing Stripe
// products are already filed under, and changing it orphans them. Rename here
// only when doing a deliberate Stripe migration.
const STRIPE_APP_TAG = "vibeflow";

async function seedProducts() {
  const stripe = await getUncachableStripeClient();
  const existing = await stripe.products.search({ query: `metadata['app']:'${STRIPE_APP_TAG}'` });
  const byTier = new Map(existing.data.map((p) => [p.metadata?.tier, p]));

  for (const plan of PAID) {
    let product = byTier.get(plan.tier);

    if (!product) {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { app: STRIPE_APP_TAG, tier: plan.tier },
      });
      console.log(`Created product ${plan.name} (${product.id})`);
    }

    const prices = await stripe.prices.list({ product: product.id, active: true });

    for (const period of BILLING_PERIODS) {
      const amount = periodPriceCents(plan.tier, period);
      const recurring = STRIPE_RECURRING[period];
      const current = prices.data.find(
        (pr) => pr.recurring?.interval === recurring.interval && pr.recurring?.interval_count === recurring.interval_count,
      );
      if (current && current.unit_amount === amount) {
        console.log(`  ${plan.name} (${period}): price ${current.id} already $${amount / 100}`);
        continue;
      }
      if (current) {
        await stripe.prices.update(current.id, { active: false });
        console.log(`  ${plan.name} (${period}): archived stale price ${current.id}`);
      }
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: amount,
        currency: 'usd',
        recurring,
        metadata: { app: STRIPE_APP_TAG, tier: plan.tier, period },
      });
      console.log(`  ${plan.name} (${period}): new price ${price.id} $${amount / 100}`);
    }
  }

  // Retire any old-scheme products (Plus / VIP) that aren't in the new set.
  for (const p of existing.data) {
    if (!PAID.some((x) => x.tier === p.metadata?.tier) && p.active) {
      await stripe.products.update(p.id, { active: false });
      console.log(`Archived retired product ${p.name} (${p.id})`);
    }
  }
  console.log('Product seeding complete.');
}

seedProducts().catch((e) => {
  console.error(e);
  process.exit(1);
});

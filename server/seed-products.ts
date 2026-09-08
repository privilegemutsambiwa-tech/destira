import { getUncachableStripeClient } from './stripeClient';
import { LIMITS } from '@shared/entitlements';

// Stripe products for the CARD path only (EcoCash via Paynow is the default —
// see server/payments/). Run manually: `npx tsx server/seed-products.ts`.
// Prices come from shared/entitlements.ts so they never drift from the app.

const PAID = [
  { tier: 'spark', name: 'VibeFlow Spark', description: 'See who asked to meet you, plus more room to explore.' },
  { tier: 'flame', name: 'VibeFlow Flame', description: 'The full twin-to-twin transcript every time, and host your own events.' },
  { tier: 'ember', name: 'VibeFlow Ember', description: 'Nothing counts down — unlimited likes, interviews, groups and events.' },
] as const;

async function seedProducts() {
  const stripe = await getUncachableStripeClient();
  const existing = await stripe.products.search({ query: "metadata['app']:'vibeflow'" });
  const byTier = new Map(existing.data.map((p) => [p.metadata?.tier, p]));

  for (const plan of PAID) {
    const amount = LIMITS[plan.tier].priceCents;
    let product = byTier.get(plan.tier);

    if (!product) {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { app: 'vibeflow', tier: plan.tier },
      });
      console.log(`Created product ${plan.name} (${product.id})`);
    }

    const prices = await stripe.prices.list({ product: product.id, active: true });
    const current = prices.data.find((pr) => pr.recurring?.interval === 'month');
    if (current && current.unit_amount === amount) {
      console.log(`  ${plan.name}: price ${current.id} already $${amount / 100}/month`);
      continue;
    }
    if (current) {
      await stripe.prices.update(current.id, { active: false });
      console.log(`  ${plan.name}: archived stale price ${current.id}`);
    }
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: amount,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { app: 'vibeflow', tier: plan.tier },
    });
    console.log(`  ${plan.name}: new price ${price.id} $${amount / 100}/month`);
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

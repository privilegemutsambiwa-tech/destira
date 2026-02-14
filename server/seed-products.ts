import { getUncachableStripeClient } from './stripeClient';

async function seedProducts() {
  const stripe = await getUncachableStripeClient();

  const existingProducts = await stripe.products.search({ query: "metadata['app']:'vibeflow'" });
  if (existingProducts.data.length > 0) {
    console.log('VibeFlow products already exist in Stripe. Skipping seed.');
    for (const p of existingProducts.data) {
      const prices = await stripe.prices.list({ product: p.id, active: true });
      console.log(`  ${p.name} (${p.id})`);
      for (const pr of prices.data) {
        console.log(`    Price: ${pr.id} - ${pr.unit_amount! / 100} ${pr.currency}/${pr.recurring?.interval}`);
      }
    }
    return;
  }

  console.log('Creating VibeFlow subscription products in Stripe...');

  const plusProduct = await stripe.products.create({
    name: 'VibeFlow Plus',
    description: 'Unlimited AI Twin interviews, priority discovery, advanced matching, and more.',
    metadata: { app: 'vibeflow', tier: 'plus' },
  });

  const plusMonthly = await stripe.prices.create({
    product: plusProduct.id,
    unit_amount: 999,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { app: 'vibeflow', tier: 'plus' },
  });

  console.log(`Created Plus: ${plusProduct.id}, Monthly Price: ${plusMonthly.id}`);

  const vipProduct = await stripe.products.create({
    name: 'VibeFlow VIP',
    description: 'Everything in Plus, plus profile views, read receipts, VIP badge, and monthly boosts.',
    metadata: { app: 'vibeflow', tier: 'vip' },
  });

  const vipMonthly = await stripe.prices.create({
    product: vipProduct.id,
    unit_amount: 1999,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { app: 'vibeflow', tier: 'vip' },
  });

  console.log(`Created VIP: ${vipProduct.id}, Monthly Price: ${vipMonthly.id}`);
  console.log('Product seeding complete!');
}

seedProducts().catch(console.error);

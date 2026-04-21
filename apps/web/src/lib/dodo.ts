/**
 * Thin DODO Payments client. Verified endpoints against DODO's public API docs can be
 * swapped in here — the rest of the app depends only on the shape of these functions.
 *
 * Required env:
 *   DODO_API_KEY — from dodopayments.com dashboard → Developers → API keys
 *   DODO_API_BASE — defaults to production; override to 'https://test.dodopayments.com' for sandbox
 *   DODO_PRODUCT_ID_MANAGED — DODO product id for the Managed tier
 *   DODO_PRODUCT_ID_MANAGED_PRO — DODO product id for the Managed Pro tier
 */

const DODO_BASE = process.env.DODO_API_BASE ?? 'https://live.dodopayments.com';

function apiKey() {
  const key = process.env.DODO_API_KEY;
  if (!key) throw new Error('DODO_API_KEY not configured');
  return key;
}

async function dodoFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${DODO_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DODO ${res.status} on ${path}: ${text.slice(0, 240)}`);
  }
  return (await res.json()) as T;
}

export async function dodoCreateCustomer(params: {
  email: string;
  name: string;
  organizationId: string;
}): Promise<{ id: string }> {
  return dodoFetch('/customers', {
    method: 'POST',
    body: JSON.stringify({
      email: params.email,
      name: params.name,
      // DODO lets us stash our own id as metadata for reconciliation
      metadata: { organizationId: params.organizationId },
    }),
  });
}

export async function dodoCreateSubscriptionCheckout(params: {
  productId: string;
  customerId: string;
  organizationId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ paymentLink: string; subscriptionId?: string }> {
  // DODO's subscription-creation endpoint returns a hosted checkout URL.
  const res = await dodoFetch<{
    payment_link?: string;
    checkout_url?: string;
    id?: string;
  }>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      product_id: params.productId,
      customer: { customer_id: params.customerId },
      return_url: params.successUrl,
      metadata: { organizationId: params.organizationId },
      // DODO rejects the body if payment_link isn't requested explicitly — verify when enabling.
      payment_link: true,
    }),
  });
  const link = res.payment_link ?? res.checkout_url;
  if (!link) throw new Error('DODO did not return a payment link');
  return { paymentLink: link, subscriptionId: res.id };
}

export async function dodoCancelSubscription(subscriptionId: string): Promise<void> {
  await dodoFetch(`/subscriptions/${subscriptionId}/cancel`, { method: 'POST' });
}

export function productIdForPlan(plan: 'managed' | 'managed_pro'): string {
  const id =
    plan === 'managed'
      ? process.env.DODO_PRODUCT_ID_MANAGED
      : process.env.DODO_PRODUCT_ID_MANAGED_PRO;
  if (!id) throw new Error(`DODO product id for ${plan} not configured`);
  return id;
}

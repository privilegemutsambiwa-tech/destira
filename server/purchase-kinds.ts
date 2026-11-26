// One-off purchases (as opposed to plans): the registry of what can be bought
// once. Each kind says what it costs for this member and this thing, and what
// happens when the money is confirmed. server/purchases.ts starts a payment;
// server/payments activateFromPayment calls onPaid inside its transaction, so
// "paid" and "given" commit together or not at all.
//
// Kept free of payment imports so the payments module can import it.

export type PurchaseQuote = { cents: number; label: string; returnTo: string };
export type PurchaseFail = { error: number; message: string };

export interface PurchaseKind {
  /** What this member would pay for `ref` right now, or why they can't. */
  quote(userId: string, ref: number): Promise<PurchaseQuote | PurchaseFail>;
  /** Inside the payment's transaction, once. Must not throw for ordinary cases. */
  onPaid(tx: any, pay: { id: number; userId: string; purchaseRef: number | null; amount: number }): Promise<void>;
  /** Where the member goes after paying (e.g. back to the chat). */
  returnTo(ref: number): Promise<string>;
  /** Bought again and again (a super like): each paid one frees the way for the next. */
  repeatable?: boolean;
}

const kinds = new Map<string, PurchaseKind>();

export function registerPurchaseKind(name: string, kind: PurchaseKind): void {
  kinds.set(name, kind);
}

export function purchaseKind(name: string | null | undefined): PurchaseKind | null {
  return name ? kinds.get(name) ?? null : null;
}

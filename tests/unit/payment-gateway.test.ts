// What the gateways tell us (server/payments): Paynow's signed result is
// checked before we believe it, its statuses map onto ours, and the local
// mock gateway reaches every outcome.
import { createHash } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { PaymentProvider } from "../../server/payments/types";
import { maskPhone } from "../../server/payments/types";
import { MockProvider } from "../../server/payments/mock";

const KEY = "test-integration-key";
let paynow: PaymentProvider;

beforeAll(async () => {
  process.env.PAYNOW_INTEGRATION_ID = "1234";
  process.env.PAYNOW_INTEGRATION_KEY = KEY;
  const { PaynowProvider } = await import("../../server/payments/paynow");
  paynow = new PaynowProvider();
});

/** Paynow's signature: every value in order, then the key; SHA-512, upper case. */
function signed(fields: Record<string, string>, key = KEY) {
  const hash = createHash("sha512").update(Object.values(fields).join("") + key).digest("hex").toUpperCase();
  return { ...fields, hash };
}
const result = (status: string, amount = "9.99") =>
  signed({ reference: "42", paynowreference: "PN-1", amount, status, pollurl: "https://example.test/poll" });

describe("Paynow result", () => {
  it("maps Paynow's statuses onto ours", () => {
    const cases: [string, string][] = [
      ["Paid", "paid"],
      ["Awaiting Delivery", "paid"],
      ["Delivered", "paid"],
      ["Cancelled", "cancelled"],
      ["Created", "pending"],
      ["Sent", "pending"],
      ["Refunded", "failed"],
      ["Disputed", "failed"],
    ];
    for (const [raw, ours] of cases) expect(paynow.handleWebhook(result(raw))?.status, raw).toBe(ours);
  });

  it("reads the settled amount in cents", () => {
    expect(paynow.handleWebhook(result("Paid", "9.99"))).toMatchObject({ reference: "42", settledCents: 999, rawStatus: "Paid" });
  });

  it("refuses anything not signed with our key", () => {
    expect(paynow.handleWebhook(signed({ reference: "42", amount: "9.99", status: "Paid" }, "someone-else"))).toBeNull();
    const tampered = { ...result("Paid", "0.01"), amount: "9.99" };
    expect(paynow.handleWebhook(tampered)).toBeNull();
    const { hash: _drop, ...unsigned } = result("Paid");
    expect(paynow.handleWebhook(unsigned as any)).toBeNull();
    expect(paynow.handleWebhook({} as any)).toBeNull();
  });

  it("allows a 1 cent wobble on the amount, no more", () => {
    expect(paynow.verifyAmount(999, 999)).toBe(true);
    expect(paynow.verifyAmount(998, 999)).toBe(true);
    expect(paynow.verifyAmount(989, 999)).toBe(false);
    expect(paynow.verifyAmount(1999, 999)).toBe(false);
  });
});

describe("mock gateway (PAYMENTS_MOCK_DELAY_MS=0)", () => {
  const mock = new MockProvider();
  const run = async (ref: string, phone: string) => {
    const init = await mock.initiate({ reference: ref, amountCents: 999, currency: "usd", method: "ecocash", phone });
    expect(init.status).toBe("pending");
    return mock.pollStatus(init.pollUrl!);
  };

  it("pays, with the amount settled", async () => {
    expect(await run("m1", "0771234567")).toMatchObject({ status: "paid", settledCents: 999 });
  });
  it("0000 declines, 1111 has no balance, 9999 expires", async () => {
    expect((await run("m2", "0770000000")).status).toBe("failed");
    expect((await run("m3", "0771111111")).status).toBe("failed");
    expect((await run("m4", "0779999999")).status).toBe("expired");
  });
  it("an unknown transaction is a failure, not a payment", async () => {
    expect((await mock.pollStatus("never-started")).status).toBe("failed");
  });
});

it("a phone number is only ever stored masked", () => {
  expect(maskPhone("0771234567")).toBe("07•• ••• 4567");
  expect(maskPhone(undefined)).toBeNull();
  expect(maskPhone("12")).not.toContain("12");
});

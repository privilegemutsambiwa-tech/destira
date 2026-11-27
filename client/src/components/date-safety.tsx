// Date safety kit (Part B6) inside the date card: turn on "Check on me" before
// the date, and answer "All good?" during it. The trusted contact's number
// lives on this phone only (localStorage), never on Destira's servers.
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { VfButton } from "@/components/ui-vf";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isNativeApp } from "@/lib/native";
import { Share } from "@capacitor/share";
import type { DatePlanView } from "@shared/date-plan";
import { helpMessageText, normalizeContactNumber, type SafetyCheckView } from "@shared/date-safety";

const CONTACT_KEY = "destira.trusted-contact";

export function getTrustedContact(): string {
  try { return localStorage.getItem(CONTACT_KEY) || ""; } catch { return ""; }
}
function setTrustedContact(v: string) {
  try { v ? localStorage.setItem(CONTACT_KEY, v) : localStorage.removeItem(CONTACT_KEY); } catch {}
}

export type SafetyState = SafetyCheckView & { plan: DatePlanView; otherName: string };

export const safetyKey = (planId: number) => ["/api/dates/plan", planId, "safety"];
export function useSafetyCheck(planId: number, enabled = true) {
  return useQuery<SafetyState>({
    queryKey: safetyKey(planId),
    queryFn: async () => (await apiRequest("GET", `/api/dates/plan/${planId}/safety`)).json(),
    enabled,
    staleTime: 30_000,
  });
}

/** Writes to the trusted contact from the member's own phone: WhatsApp when
 *  a number is saved, otherwise the share sheet so they can pick someone. */
export async function messageTrustedContact(plan: DatePlanView, otherName: string) {
  const text = helpMessageText(plan, otherName);
  const number = normalizeContactNumber(getTrustedContact());
  if (number) {
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    return;
  }
  if (isNativeApp()) {
    await Share.share({ text, dialogTitle: "Ask for help" }).catch(() => {});
    return;
  }
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e: any) { if (e?.name === "AbortError") return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

/** Before the date: "Check on me 1 hour in", and who to tell if not. */
export function SafetyCheckSetup({ plan }: { plan: DatePlanView }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useSafetyCheck(plan.id);
  const [saving, setSaving] = useState(false);
  const [contact, setContact] = useState(getTrustedContact);
  const on = !!data?.on;

  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      const res = await apiRequest("POST", `/api/dates/plan/${plan.id}/safety`, { on: next });
      qc.setQueryData(safetyKey(plan.id), { ...(data as any), ...(await res.json()) });
    } catch (e: any) {
      toast({ title: "Couldn't change that", description: String(e?.message || "").replace(/^\d+:\s*/, "") || "Try again in a moment.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const contactOk = !contact.trim() || !!normalizeContactNumber(contact);

  return (
    <div className="rounded-[14px] border border-vf-line px-3 py-2.5" data-testid="safety-setup">
      <label className="flex items-center justify-between gap-3">
        <span className="flex items-start gap-2 min-w-0">
          <ShieldCheck className="w-4 h-4 text-vf-mint shrink-0 mt-0.5" />
          <span className="min-w-0">
            <span className="block text-[14px] text-vf-text">Check on me 1 hour in</span>
            <span className="block vf-small text-vf-faint">We'll ask "All good?". Only you see it.</span>
          </span>
        </span>
        <Switch checked={on} disabled={saving || !data} onCheckedChange={toggle} aria-label="Check on me 1 hour in" data-testid="switch-safety-check" />
      </label>
      {on && (
        <div className="mt-2.5">
          <label className="vf-small text-vf-muted" htmlFor={`trusted-${plan.id}`}>Someone to tell if you need help (WhatsApp number)</label>
          <input
            id={`trusted-${plan.id}`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            onBlur={() => contactOk && setTrustedContact(contact.trim())}
            placeholder="077 123 4567"
            className="mt-1 w-full min-h-[44px] rounded-[12px] border border-vf-line bg-vf-surface px-3 text-[16px] text-vf-text placeholder:text-vf-faint outline-none focus:border-vf-text/25"
            data-testid="input-trusted-contact"
          />
          <p className={`vf-small mt-1 ${contactOk ? "text-vf-faint" : "text-vf-ember"}`}>
            {contactOk ? "Kept on this phone only. Leave it empty to choose someone when you need to." : "That doesn't look like a phone number."}
          </p>
        </div>
      )}
    </div>
  );
}

/** During the date: the check-in, once it's time. */
export function SafetyCheckDue({ plan }: { plan: DatePlanView }) {
  const started = plan.startsAt ? new Date(plan.startsAt).getTime() <= Date.now() : false;
  const { data } = useSafetyCheck(plan.id, started);
  const [, setLocation] = useLocation();
  if (!data?.due) return null;
  return (
    <div className="px-3 pb-3">
      <VfButton size="sm" variant="primary" fullWidth onClick={() => setLocation(`/date-check/${plan.id}`)} leading={<ShieldCheck className="w-4 h-4" />} data-testid="button-safety-due">
        All good? Tell us
      </VfButton>
    </div>
  );
}

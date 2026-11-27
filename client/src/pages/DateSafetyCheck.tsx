// "All good?" during a date (Part B6). Opened from the check-in push, the
// bell, or the date card. I'm fine closes it; Get help shows Zimbabwe's
// emergency numbers and writes to the member's trusted contact from their
// own phone. Nothing here is ever shown to the other person.
import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { PageHeader, VfButton } from "@/components/ui-vf";
import { FormSkeleton } from "@/components/ui-vf/skeletons";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { haptic } from "@/lib/haptics";
import { getTrustedContact, messageTrustedContact, safetyKey, useSafetyCheck } from "@/components/date-safety";
import { dateTimeLabel, planTitle } from "@shared/date-plan";
import { EMERGENCY_NUMBERS, type SafetyAnswer } from "@shared/date-safety";

export default function DateSafetyCheck({ params }: { params: { id: string } }) {
  const planId = Number(params.id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data, isLoading, isError } = useSafetyCheck(planId);
  const [saving, setSaving] = useState<SafetyAnswer | null>(null);
  // Get help shows the numbers straight away, even before the server answers.
  const [helping, setHelping] = useState(false);

  const answer = async (a: SafetyAnswer) => {
    setSaving(a);
    if (a === "help") setHelping(true);
    else haptic.success();
    try {
      const res = await apiRequest("POST", `/api/dates/plan/${planId}/safety/answer`, { answer: a });
      qc.setQueryData(safetyKey(planId), { ...(data as any), ...(await res.json()) });
    } catch (e: any) {
      if (a === "fine") toast({ title: "Couldn't save that", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const otherFirst = (data?.otherName || "your date").trim().split(/\s+/)[0];
  const showHelp = helping || data?.answer === "help";
  const hasContact = !!getTrustedContact();

  return (
    <LayoutShell>
      <div className="max-w-[520px] mx-auto">
        {isLoading ? (
          <FormSkeleton />
        ) : isError || !data ? (
          <PageHeader title="Check-in not found" subtitle="It may belong to another account. If you're in danger, call the police on 995." />
        ) : showHelp ? (
          <section data-testid="safety-help">
            <PageHeader eyebrow="Get help" title="Help is a call away" subtitle={`If you're in danger, call now. ${otherFirst} isn't told anything.`} />
            <div className="grid grid-cols-2 gap-2">
              {EMERGENCY_NUMBERS.map((n) => (
                <a
                  key={n.number}
                  href={`tel:${n.number}`}
                  className="rounded-[16px] border border-vf-line bg-vf-surface px-4 py-3 flex flex-col gap-0.5 hover:border-vf-text/25 transition-colors"
                  data-testid={`call-${n.number}`}
                >
                  <span className="vf-small text-vf-muted">{n.label}</span>
                  <span className="flex items-center gap-2 font-display text-[26px] text-vf-text"><Phone className="w-5 h-5 text-vf-ember" />{n.number}</span>
                </a>
              ))}
            </div>
            <VfButton
              className="mt-4"
              variant="primary"
              fullWidth
              leading={<MessageCircle className="w-4 h-4" />}
              onClick={() => messageTrustedContact(data.plan, data.otherName)}
              data-testid="button-tell-contact"
            >
              {hasContact ? "Message my trusted contact" : "Message someone I trust"}
            </VfButton>
            <p className="vf-small text-vf-faint mt-2">
              Sends where you are and who you're with, from your own WhatsApp: {planTitle(data.plan)}
              {data.plan.startsAt ? `, ${dateTimeLabel(data.plan.startsAt)}` : ""}.
            </p>
            {data.answer === "help" && (
              <button type="button" onClick={() => { setHelping(false); answer("fine"); }} className="mt-6 vf-small text-vf-faint hover:text-vf-text" data-testid="button-safe-now">
                I'm safe now
              </button>
            )}
          </section>
        ) : data.answer === "fine" ? (
          <section data-testid="safety-fine">
            <PageHeader eyebrow="Check-in" title="Glad you're good" subtitle={`Enjoy the rest of your date with ${otherFirst}.`} />
            <VfButton variant="secondary" onClick={() => setLocation(`/chat/${data.plan.matchId}`)}>Back to the chat</VfButton>
            <button type="button" onClick={() => setHelping(true)} className="block mt-6 vf-small text-vf-faint hover:text-vf-text" data-testid="button-need-help-later">
              Actually, I need help
            </button>
          </section>
        ) : !data.on ? (
          <section>
            <PageHeader title="Check on me is off for this date" subtitle="If you're in danger, call the police on 995." />
            <VfButton variant="secondary" onClick={() => setHelping(true)}>Show emergency numbers</VfButton>
          </section>
        ) : (
          <section data-testid="safety-ask">
            <PageHeader
              eyebrow="Check-in"
              title="All good?"
              subtitle={`You asked us to check on you during your date with ${otherFirst}: ${planTitle(data.plan)}. Only you see this.`}
            />
            <div className="flex flex-col gap-2">
              <VfButton variant="primary" size="lg" fullWidth loading={saving === "fine"} leading={<ShieldCheck className="w-5 h-5" />} onClick={() => answer("fine")} data-testid="button-im-fine">
                I'm fine
              </VfButton>
              <VfButton variant="destructive" size="lg" fullWidth onClick={() => answer("help")} data-testid="button-get-help">
                Get help
              </VfButton>
            </div>
          </section>
        )}
      </div>
    </LayoutShell>
  );
}

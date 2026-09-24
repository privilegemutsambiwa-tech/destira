import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Users, Sparkles, ExternalLink, Loader2 } from "lucide-react";
import { parseDestiraLink } from "@/lib/link-preview";

const SURFACE = "var(--vf-surface)";
const LINE = "var(--vf-line)";
const MUTED = "var(--vf-muted)";
const FAINT = "var(--vf-faint)";
const TEXT = "hsl(var(--vf-text))";
const EMBER = "hsl(var(--vf-ember))";

interface InvitePreview {
  valid: boolean;
  name?: string;
  description?: string | null;
  photoUrl?: string | null;
  memberCount?: number;
}

function CardShell({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex items-center gap-3 w-full text-left rounded-[14px] p-2.5 transition-colors hover:brightness-95"
      style={{ background: SURFACE, border: `1px solid ${LINE}` }}
      data-testid="link-preview-card"
    >
      {children}
    </button>
  );
}

function GroupInviteCard({ token }: { token: string }) {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<InvitePreview>({
    queryKey: ["/api/groups/join-by-invite", token, "preview"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/join-by-invite/${token}/preview`, { credentials: "include" });
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <CardShell onClick={() => setLocation(`/join/${token}`)}>
        <Loader2 className="w-5 h-5 animate-spin shrink-0" style={{ color: MUTED }} />
        <span className="text-[13px]" style={{ color: MUTED }}>Loading invite…</span>
      </CardShell>
    );
  }

  if (!data?.valid) {
    return (
      <CardShell onClick={() => setLocation(`/join/${token}`)}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--vf-elevated)" }}>
          <Users className="w-5 h-5" style={{ color: MUTED }} />
        </div>
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium" style={{ color: TEXT }}>Group invite</div>
          <div className="text-[12px]" style={{ color: FAINT }}>This link has expired or is no longer valid</div>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell onClick={() => setLocation(`/join/${token}`)}>
      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center" style={{ background: "var(--vf-elevated)" }}>
        {data.photoUrl ? (
          <img src={data.photoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Users className="w-5 h-5" style={{ color: MUTED }} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium truncate" style={{ color: TEXT }}>{data.name || "A group on Destira"}</div>
        <div className="text-[12px]" style={{ color: FAINT }}>
          {typeof data.memberCount === "number" ? `${data.memberCount} member${data.memberCount === 1 ? "" : "s"} · ` : ""}Tap to view invite
        </div>
      </div>
      <ExternalLink className="w-4 h-4 shrink-0" style={{ color: FAINT }} />
    </CardShell>
  );
}

function ReferralCard({ url }: { url: string }) {
  const [, setLocation] = useLocation();
  return (
    <CardShell onClick={() => setLocation(new URL(url).pathname + new URL(url).search)}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "hsl(var(--vf-ember) / 0.15)" }}>
        <Sparkles className="w-5 h-5" style={{ color: EMBER }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium" style={{ color: TEXT }}>You're invited to Destira</div>
        <div className="text-[12px]" style={{ color: FAINT }}>Tap to open</div>
      </div>
      <ExternalLink className="w-4 h-4 shrink-0" style={{ color: FAINT }} />
    </CardShell>
  );
}

function GenericDestiraLinkCard({ path }: { path: string }) {
  const [, setLocation] = useLocation();
  return (
    <CardShell onClick={() => setLocation(path)}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--vf-elevated)" }}>
        <ExternalLink className="w-5 h-5" style={{ color: MUTED }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium" style={{ color: TEXT }}>destira.date</div>
        <div className="text-[12px] truncate" style={{ color: FAINT }}>{path}</div>
      </div>
    </CardShell>
  );
}

/** Renders a real link preview when `content` is exactly one destira.date
 *  link the app itself generates — otherwise null, so the caller falls back
 *  to plain text. Every recognized link type renders *some* card (never
 *  null once parseDestiraLink matched) so a link never turns into a blank
 *  bubble. */
export function LinkPreviewCard({ content }: { content: string }) {
  const parsed = parseDestiraLink(content);
  if (!parsed) return null;
  if (parsed.type === "group_invite") return <GroupInviteCard token={parsed.token} />;
  if (parsed.type === "referral") return <ReferralCard url={content.trim()} />;
  return <GenericDestiraLinkCard path={parsed.path} />;
}

import { cn } from "@/lib/utils";
import { VfSkeleton as S } from "./basics";

/* Loading shapes that match the screens they stand in for, so the page keeps
   its shape when the real content arrives instead of a spinner in a void.
   Each is one live region read out as "Loading". */

function Loading({ className, children, label = "Loading" }: { className?: string; children: React.ReactNode; label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className={className} data-testid="loading-skeleton">
      {children}
    </div>
  );
}

const lineWidths = ["w-3/4", "w-2/3", "w-5/6", "w-1/2"];

/** A grouped list (notifications, a door list): eyebrow, then rows in one box. */
export function ListSkeleton({ rows = 4, eyebrow = true, className }: { rows?: number; eyebrow?: boolean; className?: string }) {
  return (
    <Loading className={className}>
      {eyebrow && <S className="h-3 w-20 mb-3" />}
      <div className="rounded-2xl border border-vf-line overflow-hidden">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3.5 border-b border-vf-line last:border-b-0">
            <S className="w-8 h-8 rounded-full shrink-0" />
            <div className="flex-1 min-w-0 pt-0.5">
              <S className={cn("h-4", lineWidths[i % lineWidths.length])} />
              <S className="h-3 w-1/2 mt-2" />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** A column of cards (Wingman, Vouches, Circles, plans). `media` picks what
 *  sits at the card's left: a 4:5 photo, a round avatar, or nothing.
 *  `intro` adds the two lines of explanation some pages load with the list. */
export function CardsSkeleton({
  cards = 3,
  media = "avatar",
  intro = false,
  className,
}: {
  cards?: number;
  media?: "portrait" | "avatar" | "none";
  intro?: boolean;
  className?: string;
}) {
  return (
    <Loading className={className}>
      {intro && (
        <div className="mb-6">
          <S className="h-3.5 w-full" />
          <S className="h-3.5 w-3/4 mt-2" />
        </div>
      )}
      <div className="flex flex-col gap-3">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="rounded-[20px] border border-vf-line p-4 flex gap-3.5">
            {media === "portrait" && <S className="w-[76px] shrink-0 rounded-[12px] self-start" style={{ aspectRatio: "4 / 5" }} />}
            {media === "avatar" && <S className="w-10 h-10 rounded-full shrink-0" />}
            <div className="flex-1 min-w-0">
              <S className={cn(media === "portrait" ? "h-6" : "h-4", "w-1/2")} />
              <S className="h-3 w-5/6 mt-3" />
              <S className={cn("h-3 mt-2", lineWidths[(i + 1) % lineWidths.length])} />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** Messages: bubbles on both sides, oldest at the top. */
export function ChatSkeleton({ className }: { className?: string }) {
  const bubbles: Array<[boolean, string, number]> = [
    [false, "w-[58%]", 40], [false, "w-[36%]", 40], [true, "w-[48%]", 40],
    [false, "w-[64%]", 60], [true, "w-[30%]", 40], [true, "w-[54%]", 60],
  ];
  return (
    <Loading className={cn("flex flex-col gap-2.5 pt-2", className)} label="Loading messages">
      {bubbles.map(([mine, w, h], i) => (
        <S key={i} className={cn("rounded-[18px]", w, mine ? "self-end" : "self-start")} style={{ height: h }} />
      ))}
    </Loading>
  );
}

/** Someone's profile: cover, the portrait over its edge, name, then cards. */
export function ProfileViewSkeleton() {
  return (
    <Loading className="flex flex-col gap-8" label="Loading profile">
      <div>
        <S className="w-full rounded-[20px]" style={{ aspectRatio: "21 / 9" }} />
        <div className="flex flex-col items-center px-4 -mt-[62px] lg:flex-row lg:items-end lg:px-7 lg:-mt-[104px] lg:gap-6">
          <S className="shrink-0 w-[120px] lg:w-[196px] rounded-[12px]" style={{ aspectRatio: "4 / 5", outline: "4px solid #0C0910" }} />
          <div className="mt-3 lg:mt-0 lg:pb-2 flex flex-col items-center lg:items-start">
            <S className="h-3 w-40 mb-2.5" />
            <S className="h-11 w-56 lg:h-14 lg:w-72" />
            <S className="h-7 w-48 mt-3 rounded-full" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="flex flex-col gap-3">
          <S className="h-3 w-28" />
          <S className="h-7 w-full max-w-[38ch]" />
          <S className="h-7 w-4/5 max-w-[30ch]" />
        </div>
        <S className="h-40 rounded-[20px]" />
      </div>
    </Loading>
  );
}

/** Your own profile: the large lead photo, then the name and sections. */
export function OwnProfileSkeleton() {
  return (
    <Loading className="flex flex-col gap-5" label="Loading your profile">
      <S className="w-full rounded-[28px] aspect-[4/5] sm:aspect-[16/10] max-h-[620px]" />
      <S className="h-10 w-1/2" />
      <S className="h-3.5 w-1/3" />
      <S className="h-24 rounded-[18px] mt-3" />
    </Loading>
  );
}

/** The Discover card: photo on top (beside on wide screens), words under it. */
export function DiscoverCardSkeleton() {
  return (
    <Loading label="Loading people">
      <div className="rounded-[26px] border border-vf-line grid grid-cols-1 md:grid-cols-2 overflow-hidden mb-4">
        <S className="rounded-none h-[clamp(380px,calc(100svh-330px),620px)] md:h-auto md:min-h-[min(74vh,660px)]" />
        <div className="px-5 py-6 md:px-8 md:py-8 flex flex-col gap-3">
          <S className="h-3 w-24" />
          <S className="h-4 w-5/6" />
          <S className="h-4 w-2/3" />
          <S className="h-3 w-24 mt-4" />
          <S className="h-4 w-3/4" />
        </div>
      </div>
    </Loading>
  );
}

/** An event page: the cover with its title, then details beside a side card. */
export function EventSkeleton() {
  return (
    <Loading label="Loading event">
      <S className="h-4 w-16 mb-4" />
      <S className="rounded-[24px] h-[clamp(200px,32vw,320px)]" />
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] gap-6 mt-6">
        <div className="flex flex-col gap-2.5">
          <S className="h-3 w-14 mb-1" />
          <S className="h-4 w-full" />
          <S className="h-4 w-5/6" />
          <S className="h-4 w-2/3" />
        </div>
        <S className="h-44 rounded-[20px]" />
      </div>
    </Loading>
  );
}

/** A settings form: heading, then labelled fields. */
export function FormSkeleton({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <Loading className={className}>
      <S className="h-8 w-1/2" />
      <S className="h-3.5 w-3/4 mt-3" />
      <div className="flex flex-col gap-6 mt-8">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i}>
            <S className="h-3 w-24" />
            <S className="h-12 w-full mt-2.5 rounded-[14px]" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** A grid of photo tiles. */
export function PhotoGridSkeleton({ tiles = 6 }: { tiles?: number }) {
  return (
    <Loading className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" label="Loading photos">
      {Array.from({ length: tiles }, (_, i) => (
        <S key={i} className="rounded-[14px]" style={{ aspectRatio: "4 / 5" }} />
      ))}
    </Loading>
  );
}

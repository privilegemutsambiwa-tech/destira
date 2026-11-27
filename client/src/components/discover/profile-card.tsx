// Discover: the person in front of you. Photos and badges first, then why
// you might click and their own words. Leaves left on a pass, right on a like.

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, MapPin, Star } from "lucide-react";
import { CrownBadge } from "@/components/crown-badge";
import { DetailChips } from "@/components/detail-chips";
import { WhyYouMightClick, type ClickReason } from "@/components/why-click";
import { CardGallery, formatDistance, type GalleryPhoto } from "./card-gallery";

export function ProfileCard({
  profile, exitDir, photos, nearby, isVeryClose, distanceKm, hasStories, onViewStory,
  reasons, onAsk, answers, interests, aboutText, onFullProfile,
}: {
  profile: any;
  exitDir: "left" | "right" | null;
  photos: GalleryPhoto[];
  nearby: boolean;
  isVeryClose: boolean;
  distanceKm: number | null;
  hasStories: boolean;
  onViewStory: () => void;
  reasons: ClickReason[];
  onAsk: () => void;
  answers: { question: string; answer: string }[];
  interests: string[];
  aboutText: string;
  onFullProfile: () => void;
}) {
  return (
      <AnimatePresence mode="wait" custom={exitDir}>
        <motion.div
          key={profile.userId}
          custom={exitDir}
          variants={{
            enter: { opacity: 0, y: 10 },
            show: { opacity: 1, y: 0, x: 0, rotate: 0 },
            leave: (dir: "left" | "right" | null) => ({
              opacity: 0,
              x: dir === "left" ? -140 : dir === "right" ? 140 : 0,
              rotate: dir === "left" ? -3 : dir === "right" ? 3 : 0,
            }),
          }}
          initial="enter"
          animate="show"
          exit="leave"
          transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative rounded-[26px] border border-vf-line bg-vf-surface vf-e2 grid grid-cols-1 md:grid-cols-2 mb-4 overflow-hidden"
          data-testid="card-profile"
        >
          {/* The person first: on a phone the photo fills most of the
              screen before anything else (§7.4). */}
          <div className="relative h-[clamp(380px,calc(100svh-330px),620px)] md:h-auto md:min-h-[min(74vh,660px)] overflow-hidden">
            <CardGallery photos={photos} initial={profile.displayName?.[0] || "?"} seed={profile.userId} />

            <div
              className="absolute inset-x-0 bottom-0 pointer-events-none bg-gradient-to-t from-vf-scrim to-transparent"
              style={{ height: "62%" }}
            />

            {/* Badges sit on the photo, so their colours stay the fixed
                dark-mode shades whatever the theme. */}
            {nearby && (
              <div
                className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md"
                style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(185,216,110,0.4)" }}
                data-testid="badge-nearby-now"
              >
                <div className="w-2 h-2 rounded-full" style={{ background: "#B9D86E", boxShadow: "0 0 6px #B9D86E" }} />
                <span className="text-[11px] font-semibold" style={{ color: "#B9D86E" }}>Nearby now</span>
              </div>
            )}
            {isVeryClose && !nearby && (
              <div
                className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md"
                style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(143,227,199,0.4)" }}
                data-testid="badge-very-close"
              >
                <MapPin className="w-3 h-3" style={{ color: "#8FE3C7" }} />
                <span className="text-[11px] font-semibold" style={{ color: "#8FE3C7" }}>Under 1 km</span>
              </div>
            )}

            {hasStories && (
              <button
                onClick={onViewStory}
                className="absolute top-3 left-3 w-11 h-11 rounded-full p-[2px] vf-press"
                style={{ background: "hsl(var(--vf-ember))" }}
                data-testid="card-story-ring"
                aria-label={`View ${profile.displayName || "their"} story`}
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-vf-surface2 flex items-center justify-center">
                  {profile.coverPhotoUrl || profile.user?.profileImageUrl ? (
                    <img
                      src={profile.coverPhotoUrl || profile.user?.profileImageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="font-serif text-white/70 text-sm">
                      {profile.displayName?.[0] || "?"}
                    </span>
                  )}
                </div>
              </button>
            )}

            {/* On a phone the decision bar floats over the bottom of the
                photo, so the name sits above it rather than under it. */}
            <div className="absolute left-5 right-5 bottom-[100px] md:bottom-6 md:left-6 md:right-6 pointer-events-none">
              {/* Crown Spotlight (server/crown-perks.ts): said plainly, so a
                  lifted card is never mistaken for the deck's own order. */}
              {(profile as any).superLiked && (
                <div
                  className="inline-flex items-center gap-1.5 mb-2 mr-2 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-vf-ember text-vf-ink"
                  data-testid="label-super-liked"
                >
                  <Star className="w-3 h-3" fill="currentColor" strokeWidth={0} /> Super liked you
                </div>
              )}
              {(profile as any).spotlight && (
                <div
                  className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full font-mono text-[10.5px] uppercase tracking-[0.14em]"
                  style={{ color: "#F5E3B0", background: "rgba(26,20,24,0.55)", border: "1px solid rgba(233,185,73,0.45)", backdropFilter: "blur(6px)" }}
                  data-testid="label-spotlight"
                >
                  Crown Spotlight
                </div>
              )}
              <h2
                className="font-display font-normal leading-[1.02] tracking-[-0.01em] mb-1.5 flex items-center gap-2 text-[clamp(32px,9vw,42px)]"
                style={{ color: "#F5F0EA" }}
                data-testid="text-profile-name"
              >
                <span className="truncate">{profile.displayName}{profile.age ? `, ${profile.age}` : ""}</span>
                {profile.isVerified && (
                  <span
                    title="Verified"
                    data-testid="badge-verified"
                    className="inline-flex items-center justify-center rounded-full shrink-0 border border-white/25"
                    style={{ width: 22, height: 22, background: "rgba(255,255,255,0.16)", backdropFilter: "blur(6px)" }}
                  >
                    <Check className="w-3 h-3" strokeWidth={3} style={{ color: "#F5F0EA" }} />
                  </span>
                )}
                <CrownBadge userId={profile.userId} onPhoto />
              </h2>

              {(profile.locationName || profile.location) && (
                <div className="flex items-center gap-1.5 text-[14px] text-[#CFC7DA]">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate" data-testid="text-profile-location">
                    {profile.locationName || profile.location}
                    {profile.showDistance !== false && distanceKm !== null ? ` · ${formatDistance(distanceKm)}` : ""}
                  </span>
                </div>
              )}
              {/* Faith, children, marriage plans: the first three details. */}
              <DetailChips details={(profile as any).details} onPhoto max={3} className="mt-2.5" />
            </div>
          </div>

          {/* The read: why you might click, then their own words. */}
          <div className="relative px-5 py-6 md:px-8 md:py-8 flex flex-col gap-6 min-w-0">
            <WhyYouMightClick name={profile.displayName || ""} reasons={reasons} onAsk={onAsk} />

            {answers.length > 0 ? (
              <div>
                <div className="vf-label text-vf-faint mb-1">In their words</div>
                <div className="flex flex-col">
                  {answers.map((a, i) => (
                    <div
                      key={i}
                      className={`py-3.5 ${i > 0 ? "border-t border-vf-line" : ""}`}
                      data-testid={`profile-answer-${i}`}
                    >
                      <div className="vf-small text-vf-muted mb-1.5">{a.question}</div>
                      <p className="font-display italic text-[22px] leading-[1.35] text-vf-text">"{a.answer}"</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="vf-label text-vf-faint mb-2">In their words</div>
                {aboutText ? (
                  <p className="font-display italic text-[22px] leading-[1.35] text-vf-text">"{aboutText}"</p>
                ) : (
                  <p className="vf-body text-vf-muted">Nothing shared yet. Their twin can tell you more.</p>
                )}
              </div>
            )}

            {answers.length > 0 && aboutText && (
              <p className="vf-body text-vf-soft">{aboutText}</p>
            )}

            {interests.length > 0 && (
              <div className="flex flex-wrap gap-2" data-testid="profile-interests">
                {interests.map((tag) => (
                  <span
                    key={tag}
                    className="border border-vf-line rounded-full px-3.5 py-1.5 text-[13.5px] text-vf-soft"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <button
              onClick={onFullProfile}
              className="self-start inline-flex items-center gap-1.5 min-h-[44px] text-[14px] font-medium text-vf-text hover:text-vf-ember transition-colors"
              data-testid="link-full-profile"
            >
              Full profile <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
  );
}

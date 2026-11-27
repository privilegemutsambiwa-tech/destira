// Landing: what you'll find, over local photos.

import { Hand, Heart, MessageCircle, PartyPopper, Users } from "lucide-react";
import type { Photo } from "@/lib/photos";
import { SignupButtons } from "./hero";
import { PhotoTile } from "./photos";
import { Reveal, Eyebrow, SectionHeading } from "./shared";

/** Right under the hero: everything Destira is for, as four cards, before
 *  any of how it works. */
export function WhatYoullFind({ pick }: { pick: (...ns: number[]) => Photo[] }) {
  const [meet] = pick(39);
  const [love] = pick(64);
  const faces = pick(59, 41, 43, 62);
  const photoCards = [
    {
      p: meet,
      icon: Users,
      title: "Meet new people",
      body: "See people near you, like the ones you'd love to meet, and when they like you back, it's a match. Then just say hello.",
    },
    {
      p: love,
      icon: Heart,
      title: "Find love that lasts",
      body: "Everyone here is looking for something real: a partner, a relationship, someone to build a life with. No games.",
    },
  ];
  const iconCards = [
    {
      icon: MessageCircle,
      title: "Join groups",
      body: "Rooms for what you love: faith, fitness, food, music, your city. Chat, play games together and make friends.",
    },
    {
      icon: PartyPopper,
      title: "Go to events, or host your own",
      body: "Dinners, hikes and game nights near you. Meet people face to face, where it's easy to talk.",
    },
  ];
  return (
    <div>
      <Reveal>
        <Eyebrow tone="ember">What you'll find</Eyebrow>
        <SectionHeading id="find-heading">Everything you need to find your person.</SectionHeading>
      </Reveal>
      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        {photoCards.map((c, n) => (
          <Reveal key={c.title} delay={n * 90}>
            <div className="h-full rounded-[24px] border border-vf-line bg-vf-surface overflow-hidden" data-testid={`find-${n + 1}`}>
              {c.p ? (
                <PhotoTile p={c.p} ratio="16/10" sizes="(min-width: 768px) 46vw, 92vw" />
              ) : (
                <div style={{ aspectRatio: "16/10" }} className="bg-vf-surface2" />
              )}
              <div className="p-6">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-full bg-vf-ember/10 text-vf-ember flex items-center justify-center">
                    <c.icon className="w-[18px] h-[18px]" />
                  </span>
                  <div className="text-[20px] font-semibold text-vf-text">{c.title}</div>
                </div>
                <p className="mt-3 text-[15.5px] leading-[1.6] text-vf-muted">{c.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
        {iconCards.map((c, n) => (
          <Reveal key={c.title} delay={(n + 2) * 90}>
            <div className="h-full rounded-[24px] border border-vf-line bg-vf-surface p-6" data-testid={`find-${n + 3}`}>
              <div className="flex items-center justify-between">
                <span className="w-11 h-11 rounded-full bg-vf-ember/10 text-vf-ember flex items-center justify-center">
                  <c.icon className="w-5 h-5" />
                </span>
                <div className="flex -space-x-2.5" aria-hidden="true">
                  {faces.slice(n * 2, n * 2 + 2).concat(faces.slice(0, 1)).map((p, i) => (
                    <div key={i} className="w-9 h-9 rounded-full overflow-hidden border-2 border-vf-surface">
                      <PhotoTile p={p} ratio="1/1" sizes="40px" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 text-[20px] font-semibold text-vf-text">{c.title}</div>
              <p className="mt-2 text-[15.5px] leading-[1.6] text-vf-muted">{c.body}</p>
            </div>
          </Reveal>
        ))}
        <Reveal delay={4 * 90} className="md:col-span-2">
          <div className="h-full rounded-[24px] border border-vf-mint/30 bg-vf-mint/[0.05] p-6 md:p-7 md:flex md:items-center md:gap-8" data-testid="find-friends">
            <span className="w-11 h-11 shrink-0 rounded-full bg-vf-mint/15 text-vf-mint flex items-center justify-center">
              <Hand className="w-5 h-5" />
            </span>
            <div className="mt-5 md:mt-0">
              <div className="text-[20px] font-semibold text-vf-text">Make friends, not just matches</div>
              <p className="mt-2 text-[15.5px] leading-[1.6] text-vf-muted">
                New in town, or just want more people around you? Destira Friends is its own space, never romantic: wave at people near you who want new friends too.
                And every Sunday, join a table of six for lunch, close to your age and near where you live. Here for love as well? Pick both.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
      <Reveal delay={120}>
        <div className="mt-10 flex flex-col items-center text-center">
          <p className="text-[16px] text-vf-muted">Free to join. It takes about two minutes.</p>
          <SignupButtons className="mt-4" testId="find" />
        </div>
      </Reveal>
    </div>
  );
}

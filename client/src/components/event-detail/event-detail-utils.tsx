// Event page: date and seat-policy helpers (split out of pages/EventDetail.tsx).


export function toLocalInput(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export const SEAT_MODEL_COPY: Record<string, string> = {
  open: "Open — anyone can save a seat",
  capped: "Limited seats — waitlist once full",
  curated: "Seats picked for conversation, not first-come",
};

export function genderLabel(gender: string | null | undefined): string | null {
  if (gender === "man") return "Man";
  if (gender === "woman") return "Woman";
  return null;
}

export function genderPolicyLabel(event: { genderPolicy: string; menSlots: number | null; womenSlots: number | null }): string | null {
  if (event.genderPolicy === "men_only") return "Men only";
  if (event.genderPolicy === "women_only") return "Women only";
  if (event.genderPolicy === "quota" && (event.menSlots != null || event.womenSlots != null)) {
    const parts = [];
    if (event.menSlots != null) parts.push(`${event.menSlots} men`);
    if (event.womenSlots != null) parts.push(`${event.womenSlots} women`);
    return `${parts.join(", ")} needed`;
  }
  return null;
}

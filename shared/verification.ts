// Poses a member copies in their verification selfie. A random one is asked
// for each time, so an old photo can't be reused; the reviewer checks the
// selfie shows it.
export const POSES = [
  { key: "two_fingers", text: "Hold up two fingers next to your face" },
  { key: "thumbs_up", text: "Give a thumbs up next to your face" },
  { key: "hand_on_chin", text: "Rest your chin on your hand" },
  { key: "touch_ear", text: "Touch your ear with one hand" },
  { key: "point_up", text: "Point up with one finger" },
  { key: "open_palm", text: "Show an open palm next to your face" },
] as const;
export type PoseKey = (typeof POSES)[number]["key"];

export function poseText(key: string | null | undefined): string {
  return POSES.find((p) => p.key === key)?.text ?? "No pose (sent from an older app version)";
}

/** Reasons a reviewer can pick when rejecting; shown to the member as-is. */
export const REJECT_REASONS = [
  "We couldn't see your face clearly. Try again in good light, facing the camera.",
  "The pose in your selfie didn't match the one we asked for.",
  "Your selfie doesn't look like the person in your profile photos.",
  "Your profile needs at least one clear photo of your face first.",
  "This looks like a photo of a photo or a screen. Please take a live selfie.",
] as const;

export type VerificationState = "unverified" | "pending" | "verified" | "rejected";

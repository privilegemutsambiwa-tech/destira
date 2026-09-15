import { useAuth } from "@/hooks/use-auth";
import ProfileView from "./ProfileView";

/** The bare profile content for the phone frame in ProfilePreview.tsx, with
 *  no bar of its own. This exists only because Tailwind's `lg:` breakpoints
 *  are viewport-width media queries, not container queries — squeezing
 *  ProfileView into a narrow <div> would leave its desktop row-layout active
 *  (measuring the real browser window, not the div). Loading this route in
 *  an <iframe> at phone width gives it a genuinely separate viewport, so the
 *  mobile layout actually activates. */
export default function ProfilePreviewFrame() {
  const { user } = useAuth();
  if (!user?.id) return null;
  return <ProfileView userId={user.id} preview />;
}

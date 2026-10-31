// The site's public address, for links that leave the server: emails
// (member, alert, invite, password reset), payment return URLs. Set
// PUBLIC_APP_URL to override. Without it, production uses www (the bare
// domain only redirects there) so a missing setting can never put a
// localhost link in front of a member; local dev uses the dev server.
export function publicAppUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ||
    (process.env.NODE_ENV === "production" ? "https://www.destira.date" : "http://localhost:5000")
  ).replace(/\/+$/, "");
}

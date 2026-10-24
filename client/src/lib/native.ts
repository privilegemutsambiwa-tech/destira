// The bridge between the site and the Destira Android/iOS app shell
// (capacitor.config.ts). The app loads the live site, so this same bundle
// runs in a browser and in the app; everything here is a no-op in a browser.
//
//  - status bar follows the app's light/dark theme
//  - Android back button walks history, and leaves the app from a home tab
//  - destira.date links (and the Google sign-in return) open inside the app
//  - Google sign-in runs in a system browser tab, which Google requires
//  - Status cards go out through the phone's native share sheet
//  - push notifications through Firebase, when the build includes it
import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Browser } from "@capacitor/browser";
import { Share } from "@capacitor/share";
import { Filesystem, Directory } from "@capacitor/filesystem";

// Where Google sign-in returns to in the app. Must also be listed under
// Supabase → Authentication → URL Configuration → Redirect URLs.
export const NATIVE_AUTH_REDIRECT = "date.destira.app://auth/callback";

// android/.../DestiraNativePlugin.java
const DestiraNative = registerPlugin<{ hasFirebase(): Promise<{ value: boolean }> }>("DestiraNative");

// Leaving the app with Back only from a top-level screen.
const HOME_PATHS = new Set(["/", "/discover", "/interviews", "/matches", "/lounge", "/events", "/profile"]);

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function resolvedDark(): boolean {
  const pref = document.documentElement.getAttribute("data-theme");
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

async function syncStatusBar() {
  const dark = resolvedDark();
  try {
    // Style.Dark = light text, for a dark background.
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: dark ? "#0C0910" : "#FBF8F5" });
    }
  } catch {
    /* plugin missing on an older app build */
  }
}

/** Turn a link the OS handed to the app into a page inside the app. */
function openInApp(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return;
  }
  // date.destira.app://auth/callback#access_token=… → /auth/callback#…
  const path = url.protocol === "date.destira.app:" ? `/${url.host}${url.pathname === "/" ? "" : url.pathname}` : url.pathname;
  Browser.close().catch(() => {});
  window.location.assign(`${window.location.origin}${path}${url.search}${url.hash}`);
}

/** Once, at startup. Safe to call in a browser (does nothing). */
export function initNative() {
  if (!isNativeApp()) return;
  document.documentElement.classList.add("native-app");

  syncStatusBar();
  new MutationObserver(syncStatusBar).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", syncStatusBar);

  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack && !HOME_PATHS.has(window.location.pathname)) window.history.back();
    else App.minimizeApp();
  });
  App.addListener("appUrlOpen", ({ url }) => openInApp(url));
  initNativePush();
}

// ── push (Firebase) ───────────────────────────────────────────────────

let pushListenersAdded = false;

/** True when this app build can receive push at all (has google-services.json). */
export async function nativePushAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    return (await DestiraNative.hasFirebase()).value;
  } catch {
    return false; // an older build without the plugin
  }
}

/** "granted" | "denied" | "default", in the browser's Notification terms. */
export async function nativePushPermission(): Promise<NotificationPermission> {
  try {
    const { receive } = await PushNotifications.checkPermissions();
    return receive === "granted" ? "granted" : receive === "denied" ? "denied" : "default";
  } catch {
    return "default";
  }
}

function addPushListeners() {
  if (pushListenersAdded) return;
  pushListenersAdded = true;
  PushNotifications.addListener("registration", ({ value }) => {
    fetch("/api/push/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token: value, platform: Capacitor.getPlatform() === "ios" ? "ios" : "android" }),
    }).catch(() => {});
  });
  // A tap on a notification opens the screen it is about.
  PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const url = (notification.data as { url?: string } | undefined)?.url;
    if (url && url.startsWith("/")) window.location.assign(url);
  });
}

/** Ask for permission (Android 13+ shows the system prompt) and register. */
export async function nativeRegisterPush(): Promise<NotificationPermission> {
  if (!(await nativePushAvailable())) return "default";
  addPushListeners();
  let perm = await nativePushPermission();
  if (perm === "default") {
    const r = await PushNotifications.requestPermissions();
    perm = r.receive === "granted" ? "granted" : r.receive === "denied" ? "denied" : "default";
  }
  if (perm === "granted") await PushNotifications.register();
  return perm;
}

/** After a member signs in: hand this phone's token to the server under
 *  their account. At startup nobody may be signed in yet, so the first
 *  attempt can be refused; this is the retry. Silent; no prompt. */
export async function syncNativePushToken() {
  if (!(await nativePushAvailable())) return;
  addPushListeners();
  if ((await nativePushPermission()) === "granted") PushNotifications.register().catch(() => {});
}

// At startup: re-register silently when permission was already given, so the
// server always has this phone's current token (tokens rotate).
async function initNativePush() {
  if (!(await nativePushAvailable())) return;
  addPushListeners();
  if ((await nativePushPermission()) === "granted") PushNotifications.register().catch(() => {});
}

/** Google sign-in for the app: Google refuses sign-in inside an app's web
 *  view, so the consent screen opens in a system browser tab and returns to
 *  the app through NATIVE_AUTH_REDIRECT. */
export async function openNativeOAuth(oauthUrl: string) {
  await Browser.open({ url: oauthUrl, presentationStyle: "popover" });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Share an image (a Status card) through the phone's share sheet. */
export async function nativeShareImage(blob: Blob, filename: string, caption: string): Promise<"shared" | "cancelled"> {
  const data = await blobToBase64(blob);
  const written = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
  try {
    await Share.share({ text: caption, files: [written.uri], dialogTitle: "Share to your Status" });
    return "shared";
  } catch (err: any) {
    // The plugin rejects when the person closes the sheet.
    if (String(err?.message || err).toLowerCase().includes("cancel")) return "cancelled";
    throw err;
  }
}

/** Share a link through the phone's share sheet. */
export async function nativeShareLink(title: string, text: string, url: string): Promise<"shared" | "cancelled"> {
  try {
    await Share.share({ title, text, url, dialogTitle: title });
    return "shared";
  } catch (err: any) {
    if (String(err?.message || err).toLowerCase().includes("cancel")) return "cancelled";
    throw err;
  }
}

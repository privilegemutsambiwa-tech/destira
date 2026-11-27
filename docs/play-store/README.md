# Destira on Google Play

Everything needed to list and release the Android app. The app is a native
shell around https://destira.date (see `capacitor.config.ts`), so most changes
ship by deploying the website. A new Play release is only needed when the
native side changes: plugins, icons, permissions, `android/`.

## 1. Store listing text

Refreshed for 1.4 (Part M5). Love first, like the website's hero: the twin
is how you get there, not the headline.

**App name:** Destira

**Short description** (80 characters max; this is 66):

> Find love. Find your forever. Your AI twin breaks the ice for you.

**Full description:**

> Find love. Find your forever.
>
> Destira is for people in Zimbabwe who want something real. Meet single people who want what you want, start talking when you both like each other, and meet in person when it feels right. Free to join.
>
> Your AI twin breaks the ice
> Answer a few questions and your twin learns how you talk, what you're looking for and what you'd never compromise on. It has the awkward first conversation with other members' twins, then shows you who you'd click with and why. You step in when it's worth it.
>
> - Tonight's three: three people picked for you every evening at 7, each with a reason you'd get on.
> - Ask their twin: find out what you'd want to know before a first coffee. Twins only answer what their person allows.
> - Likes and matches: when someone you like likes you back, it's a match and the chat opens.
> - Chats that feel like you: messages, voice notes, photos, and help planning the first date.
> - Events: dinners, hikes, game nights and more, hosted by Destira and its members. See who's going that you'd get on with.
> - The Lounge: rooms for the things you're into. Chat, play games, then meet.
> - Friends too: wave at people who want new friends, and every Sunday sit down to lunch with five people near you.
> - Vouches: a few words from people who've met you, on your profile if you choose.
>
> Safe by design
> Verify your profile with a selfie. Report or block anyone, and our team reviews every report. You decide what your twin may talk about, you can read everything it has said, and you can delete your account and data at any time.
>
> Made in Harare. Destira is for adults aged 18 and over.

**What's new in 1.4** (release notes, 500 characters max):

> Pages now keep their shape while they load, and the back button closes whatever is open before it leaves the screen. The tab bar steps out of the way while you type. Sending a message and liking someone now come with a gentle buzz.

When video dates ship in this release, add a line for them to "What's new"
and a bullet to the full description; until then neither mentions them.

**Screenshots** (still to capture, 1080 px or more on the short side), with a
caption on each:

1. Discover card: "Someone is looking for someone like you."
2. Tonight's three: "Three people picked for you, every evening at 7."
3. A twin conversation: "Your AI twin breaks the ice."
4. A profile's "why you might click": "See why you'd get on, before you say hello."
5. Events: "Meet people at real events."
6. A chat: "When you both like each other, start talking."

**In-app review:** from 1.4 the app asks for a Play rating once, after a
member's first match, and never within a day of a block, report, unmatch or
error (`client/src/lib/review-prompt.ts`). Play decides whether the card
actually shows; it never shows on a sideloaded APK, only on installs from Play.

**Category:** Dating  
**Contact email:** support@destira.date  
**Website:** https://destira.date  
**Privacy policy:** https://destira.date/privacy  
**Delete account URL:** https://destira.date/delete-account

**Graphics**

| Asset | Size | File |
| --- | --- | --- |
| App icon | 512 × 512 | `client/public/brand/destira-icon-512.png` |
| Feature graphic | 1024 × 500 | `docs/play-store/feature-graphic.png` |
| Phone screenshots | 2 to 8, at least 1080 px on the short side | still to capture (Tonight's three, a profile, a twin interview, events) |

Regenerate the icon and feature graphic with `node scripts/generate-brand-assets.mjs`.

## 2. Content rating and audience

- **Target audience:** 18 and over only.
- **Content rating questionnaire:** a social and dating app where users talk to each other and meet in person; users can share their location (optional); in-app purchases.
- **App access for review:** give Google a working test account (email and password) in "App access", or review will fail at the sign-in screen.

## 3. Data safety form

| Data | Collected | Shared | Why | Optional |
| --- | --- | --- | --- | --- |
| Name, email | Yes | No | Account | No |
| Photos | Yes | No | Profile | No |
| Approximate and precise location | Yes | No | Nearby alerts | Yes (off unless turned on) |
| Messages and in-app chats | Yes | No | App features | No |
| Other user content (twin answers, prompts) | Yes | No | App features, personalisation | No |
| Purchase history | Yes | No | Plans | No |
| App interactions | Yes | No | Analytics | No |
| Device or other IDs (push token) | Yes | No | Notifications | Yes |

- **Encrypted in transit:** yes (HTTPS everywhere).
- **Users can request deletion:** yes, in the app (Settings, Data & Privacy) and at https://destira.date/delete-account.
- "Shared" here means given to another company for its own use. The service providers listed in the privacy policy process data on our behalf, which the form does not count as sharing.

## 4. Release steps

1. Create the Google Play developer account ($25, once). Registering as an **organisation** needs a D-U-N-S number but skips the rule below.
2. **New personal accounts must run a closed test with at least 12 testers for 14 days** before they can release to everyone. Start this as early as possible: recruit 12+ testers (team, ambassadors, friends) by email.
3. Create the app in Play Console: name Destira, Dating, free with in-app purchases.
4. Build the bundle:
   ```bash
   npx cap sync android
   cd android && ./gradlew bundleRelease
   ```
   Upload `android/app/build/outputs/bundle/release/app-release.aab`. Accept **Play App Signing** (Google holds the final signing key; ours is only the upload key).
5. After the first upload, open Play Console → App integrity, copy the **App signing key SHA-256**, and set it on Render together with the upload key's, comma-separated:
   ```
   ANDROID_APP_CERT_SHA256=<app signing key SHA-256>,A0:60:84:9E:DF:2A:55:22:E7:C5:DF:DB:D9:54:94:F1:B2:91:E6:4D:3A:47:FD:5C:58:8F:36:0B:F3:58:AC:37
   ```
   That makes destira.date links (events, invites) open in the app. Check it at https://destira.date/.well-known/assetlinks.json.
6. Fill in the listing, content rating, data safety and app access, then release to the closed test track.
7. For every later release, raise `versionCode` (and `versionName`) in `android/app/build.gradle` before building.

## 5. The upload key: back it up today

The key that signs uploads is at `%USERPROFILE%\.destira-keys\destira-upload.jks`, with its passwords in `keystore.properties` beside it (and a copy in `android/keystore.properties`, which git ignores). Copy the whole `.destira-keys` folder to a password manager or another safe place. Without it, new versions can't be uploaded until Google resets the upload key, which takes days.

## 6. Turning on push notifications (Firebase)

1. Create a Firebase project at https://console.firebase.google.com and add an Android app with package name `date.destira.app`.
2. Download `google-services.json` into `android/app/`, then rebuild. Until this file is in the build, the app simply doesn't offer push and nothing breaks.
3. In Firebase → Project settings → Service accounts, generate a private key and set the whole JSON (on one line) as `FIREBASE_SERVICE_ACCOUNT` on Render.
4. Run the push migration once against production:
   ```bash
   npx tsx --env-file=.env scripts/migrate-native-push.ts
   ```

Every notification the site already sends (matches, messages, Tonight's three, events) then also reaches the app, on the "Destira" channel with the ring icon.

## 7. Google sign-in in the app

Add `date.destira.app://auth/callback` under Supabase → Authentication → URL Configuration → Redirect URLs. Without it, Google sign-in in the app returns an error; email sign-in works either way.

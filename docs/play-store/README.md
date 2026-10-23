# Destira on Google Play

Everything needed to list and release the Android app. The app is a native
shell around https://destira.date (see `capacitor.config.ts`), so most changes
ship by deploying the website. A new Play release is only needed when the
native side changes: plugins, icons, permissions, `android/`.

## 1. Store listing text

**App name:** Destira

**Short description** (80 characters max):

> Your AI twin meets theirs first. Dating for real people, starting in Harare.

**Full description:**

> Come and find your person.
>
> On Destira, your AI twin does the awkward first part. Answer a few questions and your twin learns how you talk about a free Saturday, what you're looking for and what you'd never compromise on. When someone is curious about you, they ask your twin first, and you ask theirs.
>
> - Tonight's three: three people picked for you every evening at 7, each with a reason you'd get on.
> - Interview their twin: ask what you'd want to know before a first coffee. Twins only answer what their person allows.
> - An honest read: see where you two click and where you differ, before you say hello.
> - Events and the Lounge: meet people at braais, dinners and campus events, and join rooms for the things you love.
> - Bring your people: invite a friend and you both get a free week.
>
> You decide what your twin may talk about. You can read everything it has said, and delete your account and data at any time.
>
> Destira is for adults aged 18 and over.

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

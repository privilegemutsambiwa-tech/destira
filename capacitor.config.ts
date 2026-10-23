// The Destira Android (and later iOS) app. Its screens are the site's own
// build (dist/app, from npm run build:app), packaged inside the app, so it
// opens instantly and works offline; only data comes from the server (client/src/lib/app-api.ts
// and server/app-client.ts).
//
// Build for a phone:
//   npm run build:app && npx cap sync android
//
// Emulator testing against the local dev server (http://10.0.2.2:5001 is the
// emulator's address for this computer):
//   VITE_APP_API_BASE=http://10.0.2.2:5001 npm run build:app
//   CAP_DEV_API=1 npx cap sync android
// CAP_DEV_API only relaxes the http rules for that build; never ship it.
import type { CapacitorConfig } from "@capacitor/cli";

const devApi = process.env.CAP_DEV_API === "1";

const config: CapacitorConfig = {
  appId: "date.destira.app",
  appName: "Destira",
  webDir: "dist/app",
  server: {
    androidScheme: "https",
    ...(devApi ? { cleartext: true } : {}),
  },
  android: {
    // Light is Destira's default theme; native.ts follows the member's choice.
    backgroundColor: "#FBF8F5",
    // Android 15+ draws apps edge to edge; keep the screens clear of the
    // status and gesture bars instead of letting the clock sit on the header.
    adjustMarginsForEdgeToEdge: "auto",
    // Only for the emulator build that talks to http://10.0.2.2.
    allowMixedContent: devApi,
  },
  plugins: {
    // Over-the-air updates from our own server (client/src/lib/app-update.ts
    // decides when); nothing goes through Capgo's cloud.
    CapacitorUpdater: {
      autoUpdate: false,
      appReadyTimeout: 15000,
      resetWhenUpdate: true, // a new store version starts from its own screens
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      statsUrl: "",
    },
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: "#FBF8F5",
      showSpinner: false,
    },
    StatusBar: {
      backgroundColor: "#FBF8F5",
      style: "LIGHT",
      overlaysWebView: false,
    },
  },
};

export default config;

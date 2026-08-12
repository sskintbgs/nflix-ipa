# Building Nflix For iPhone

This project is a web app wrapped with Capacitor so Codemagic can build it as an iPhone app.

## Files Added

- `package.json`
- `capacitor.config.json`
- `scripts/prepare-web.js`
- `codemagic.yaml`
- `.gitignore`
- `ios/` after running Capacitor

## SDK Versions

- Capacitor: `8.5.0`
- iOS deployment target: `15.0`
- Xcode on Codemagic: `latest`

Capacitor 8 supports iOS 15+ and requires Xcode 26+, so iOS 15.0 is the lowest target that works with the latest Capacitor SDK.

## Player (https://nflixmovies.app/embed) Implementation Notes

The player is loaded as a cross-origin iframe inside the Capacitor `WKWebView`. iOS WKWebView blocks or breaks media players unless the app sets the right things:

- `SceneDelegate.swift` — `NflixBridgeViewController` overrides `webViewConfiguration(for:)`:
  - `websiteDataStore = WKWebsiteDataStore.default()` — disables ITP cross-origin storage partitioning so the embed's cookies/localStorage (guest tokens, watch progress) persist (this fixed the white screen).
  - `mediaTypesRequiringUserActionForPlayback = []` + `allowsInlineMediaPlayback = true` — lets the player autoplay inline (it starts muted, then unmutes).
  - `allowsAirPlayForMediaPlayback` / `allowsPictureInPictureMediaPlayback` — AirPlay + PiP.
  - `defaultWebpagePreferences.allowsContentJavaScript = true` — JS runs inside the iframe.
- `AppDelegate.swift` — sets `AVAudioSession` category `.playback` / mode `.moviePlayback` and reactivates it after interruptions so audio plays even with the silent switch on and recovers after calls/Siri.
- `index.html` — the iframe is created **inside the user's tap gesture** (WKWebView cancels silently-created cross-origin iframes with `NSURLErrorCancelled -999`). It is created with `referrerpolicy="no-referrer"` + `allow="autoplay; fullscreen; encrypted-media; picture-in-picture"`, `playsinline`/`webkit-playsinline` and `allowfullscreen`. The `load`/`error` events are wired to the real iframe: the loading skeleton hides on `load`, and only a real failure/timeout (30 s) shows the error card with Retry / Next Server / Open in Safari.
- `capacitor.config.json` — `overrideUserAgent` is an iPhone Safari UA so Cloudflare and the player serve the mobile page; `backgroundColor #080808` keeps overscroll dark; `scrollEnabled true` lets the app pages scroll; `mediaTypesRequiringUserActionForPlayback: none` and the inline-media flags mirror the native settings.
- `Info.plist` — `NSAllowsArbitraryLoads` + `NSAllowsArbitraryLoadsInWebContent` for the http(s) stream CDNs, and `ITSAppUsesNonExemptEncryption = false` for App Store Connect submission.

If an embed ever fails, the error card lets the user open the same URL in Safari as a fallback.

## Before You Build A Signed IPA

The current bundle ID is:

```text
com.sskin.nflixipa
```

Use that same bundle ID in Apple Developer and App Store Connect, or change it in both:

- `capacitor.config.json`
- `codemagic.yaml`

## Push To GitHub

Run this from `C:\Users\sskin\Music\nflixipa`:

```powershell
git init
git add .
git commit -m "Add iPhone Capacitor build"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

## Codemagic

1. Add the GitHub repository to Codemagic.
2. Run `ios-unsigned-check` first.
3. For a Sideloadly-friendly `.ipa`, run `ios-signed-release` (development-signed).
4. For the App Store, switch `distribution_type` to `app_store` and submit via TestFlight.

The unsigned workflow proves the app compiles. The signed workflow is what creates an installable `.ipa`.

## Codemagic Signing Setup (Sideloadly / development)

`ios-signed-release` signs the IPA with a **development** certificate and a development
provisioning profile so Sideloadly and AltStore can install it directly.

1. Create or add an App Store Connect API key in Codemagic with the reference name `codemagic`
   (the API key is what lets Codemagic create the development certificate + profile automatically).
2. In `codemagic.yaml` under `publishing > ios > register_devices`, replace
   `REPLACE_WITH_YOUR_IPHONE_UDID` with your iPhone's UDID. Codemagic registers that device
   with Apple and includes it in the profile. Find the UDID in Sideloadly (visible under the
   device name when your iPhone is connected) or in Finder on a Mac (click the device name).
3. The app ID `com.sskin.nflixipa` must exist in Apple Developer / App Store Connect.
4. In Codemagic, go to `codemagic.yaml settings > Code signing identities` and make sure a
   **development** certificate and provisioning profile for `com.sskin.nflixipa` exist (or let
   Codemagic create them from the API key).

Install the resulting `.ipa` with Sideloadly — it installs without re-signing since your UDID
is already in the profile. Free Apple ID accounts are limited to 3 apps that expire after 7 days.

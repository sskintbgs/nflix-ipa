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
3. For a real `.ipa`, connect Apple Developer signing in Codemagic.
4. Run `ios-signed-release`.

The unsigned workflow proves the app compiles. The signed workflow is what creates an installable `.ipa`.

## Codemagic Signing Setup

For the signed workflow, create or add an App Store Connect API key in Codemagic with this reference name:

```text
codemagic
```

Then make sure Apple Developer/App Store Connect has an app ID for:

```text
com.sskin.nflixipa
```

Then in Codemagic, go to `codemagic.yaml settings > Code signing identities` and make sure you have:

- An Apple Distribution certificate
- An App Store provisioning profile for `com.sskin.nflixipa`

Codemagic's `ios_signing` section in `codemagic.yaml` fetches those matching signing files during the build. If you use a different API key reference name or bundle ID, update `codemagic.yaml` before building.

# KitchenForge 1.8.0

People can take or choose a food/receipt photo, review suggested grocery names,
edit quantities, units, cost and days remaining, then save a new pantry item or
recount a matching existing one. Photos are processed on the phone. Recognition
is conservative: one food suggestion from a close-up, or common food names from
receipt lines. It does not identify every item in a fridge, infer exact quantities,
read reliable expiry dates, or automatically trust receipt prices.

## Release status

- Android: version 1.8.0 / versionCode 13, compile/target SDK 36. Signed APK and AAB
  generated locally. Google Play Console requires account sign-in;
  no upload or store submission has been completed.
- iOS: version 1.8.0 / build 15. Native unsigned Release simulator compilation
  passed on GitHub's macOS runner with Xcode 26.6. App Store Connect sign-in works.
  Version 1.3.0 is Ready for Distribution, and the highest build displayed in
  TestFlight is version 1.3.0 / build 10. Creating version 1.8.0 is blocked until
  the Account Holder accepts the updated Apple Developer Program License Agreement.
- Codemagic remains at GitHub login. No signed IPA, TestFlight upload, or App Store
  submission for version 1.8.0 has been completed.
- Build 15 exceeds the highest TestFlight build displayed in this check. Recheck
  all uploaded builds before upload. The latest Play version code and draft
  releases cannot yet be inspected because Play Console is signed out.
- Store descriptions and privacy-policy source have been corrected locally;
  store metadata and privacy registrations have not yet been updated.
- The registered Apple privacy URL,
  `https://kitchenforge-app.netlify.app/privacy`, currently returns HTTP 404.
  `PRIVACY.md` was published and verified publicly readable on September 8, 2026:
  <https://github.com/roguenealer/KitchenForge/blob/master/PRIVACY.md>.
  This fallback is ready to register in the stores; its store acceptance has
  not been established.

## Validation

- `node --test tests/*.test.cjs`: all 23 parser and UI/save/reload tests passed.
- 390 x 844 browser check with a synthetic native callback: review, edit quantity
  and cost, save, and reload. Expiry and spending survived correctly.
- Android release build, lint, signature and 16 KB native-library/package checks.
- [Native iOS Release simulator build passed](https://github.com/roguenealer/KitchenForge/actions/runs/34267888675)
  for commit 05000dc, including tests, asset equality, and XcodeGen generation.
- Camera/picker behavior on physical iOS/Android phones and Android upgrade of
  real existing pantry storage still need device validation.

## Store release notes

Take or choose a photo of food labels and grocery receipts to suggest pantry items.
Review and edit names, quantities, costs, and expiry estimates before saving.
Update an existing item's quantity without recording a duplicate purchase.
Improved expiry dates, draft recovery, and Android compatibility.

## Android delivery

1. Install the signed APK on a test phone already running the previous app; verify
   its pantry/settings survive the storage migration. Original storage and a
   native recovery copy are retained.
2. Test camera permission allowed/denied, cancel, gallery/HEIC rotation, blank
   image, food label, receipt, background/process restoration, and offline scans.
3. Sign in to Play Console, then use the existing `com.kitchenforge.app` record.
   Check current uploaded version codes and signing identity before uploading the
   AAB to the existing testing track.
4. Update the listing from PLAY_STORE_LISTING.txt, restore the registered privacy
   URL or register the verified public fallback, and update Data safety for ML Kit SDK
   diagnostics. The photos/OCR content are not uploaded, but the bundled Android
   SDK collects diagnostic/per-installation data. See Google's disclosure below.
5. After the phone checks and Play validation, submit the update on the appropriate
   existing track. Do not create a duplicate app or claim a submission is live.

## iOS delivery

1. The Account Holder must accept the updated Apple Developer Program License
   Agreement before version 1.8.0 can be created in App Store Connect. Complete
   Codemagic sign-in, select the existing KitchenForge repo and `ios-workflow`,
   and confirm the App Store Connect integration still has valid signing access.
2. Use Xcode 26.6, compare build 15 against current uploaded builds, then run the
   workflow. It generates the Xcode project, signs an IPA and uploads to TestFlight.
3. The existing workflow keeps `submit_to_app_store: false` so an untested camera
   implementation is not automatically released. Test the signed build on a phone.
4. In the existing App Store Connect KitchenForge record (Apple ID 6761285586),
   create/update version 1.8.0, select the processed build, paste the release notes,
   apply ios/APP_STORE_LISTING.txt, replace or restore the broken privacy URL,
   verify privacy details, and submit for review.

## Rebuild

`node scripts/sync-web-assets.cjs` copies canonical root assets to both platforms.
Run this before native builds. `node scripts/preview.cjs` opens a loopback-only
web preview; native camera recognition is available only inside the mobile apps.

Android: use a supported JDK and the Gradle wrapper directly, then run
`gradlew.bat bundleRelease assembleRelease lintRelease testReleaseUnitTest` from
`android`. Do not use the pre-existing untracked `android/build-bundle.bat`: it
contains a `git checkout -- .` command which discards work.

## References

- [Apple SDK upload requirement](https://developer.apple.com/news/upcoming-requirements/)
- [Android target API requirement](https://developer.android.com/google/play/requirements/target-sdk)
- [Google ML Kit Data safety disclosure](https://developers.google.com/ml-kit/android-data-disclosure)
- [Codemagic publishing configuration](https://docs.codemagic.io/yaml-publishing/app-store-connect/)

# KitchenForge 1.8.0

People can take or choose a food/receipt photo, review suggested grocery names,
edit quantities, units, cost and days remaining, then save a new pantry item or
recount a matching existing one. Photos are processed on the phone. Recognition
is conservative: one food suggestion from a close-up, or common food names from
receipt lines. It does not identify every item in a fridge, infer exact quantities,
read reliable expiry dates, or automatically trust receipt prices.

## Release status

- Android: version 1.8.0 / versionCode 13, compile/target SDK 36. Signed APK and AAB
  generated locally; store upload still needs Google Play Console access.
- iOS: version 1.8.0 / build 15. Source and Codemagic Xcode 26.6 configuration
  prepared. No iOS binary has been compiled on this Windows host. Codemagic and
  App Store Connect sign-in are required to build, sign, upload, and submit.
- These numbers exceed the local previous build numbers. Compare with all uploaded
  builds (including TestFlight and draft Play releases) before upload; those records
  are not accessible while the store accounts are signed out.
- Store copy and privacy-policy source were updated locally. Their live versions
  have not yet been changed in the stores or at the hosted privacy URL.

## Validation

- `node --test tests/*.test.cjs`: parser plus actual UI/save/reload integration tests.
- 390 x 844 browser check with a synthetic native callback: review, edit quantity
  and cost, save, and reload. Expiry and spending survived correctly.
- Android release build, lint, signature and 16 KB native-library/package checks.
- Native iOS compilation, camera/picker behavior on physical iOS/Android phones,
  and Android upgrade of real existing pantry storage still need device validation.

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
3. In the existing `com.kitchenforge.app` Play record, upload the AAB to the existing
   testing track. Check its uploaded version code and signing identity.
4. Update the listing from PLAY_STORE_LISTING.txt, publish the updated privacy
   policy at the existing registered URL, and update Data safety for ML Kit SDK
   diagnostics. The photos/OCR content are not uploaded, but the bundled Android
   SDK collects diagnostic/per-installation data. See Google's disclosure below.
5. After the phone checks and Play validation, submit the update on the appropriate
   existing track. Do not create a duplicate app or claim a submission is live.

## iOS delivery

1. In Codemagic, select the existing KitchenForge repo and `ios-workflow`. Confirm
   the KitchenForge App Store Connect integration still has valid signing access.
2. Use Xcode 26.6, compare build 15 against current uploaded builds, then run the
   workflow. It generates the Xcode project, signs an IPA and uploads to TestFlight.
3. The existing workflow keeps `submit_to_app_store: false` so an untested camera
   implementation is not automatically released. Test the signed build on a phone.
4. In the existing App Store Connect KitchenForge record (Apple ID 6761285586),
   create/update version 1.8.0, select the processed build, paste the release notes,
   apply ios/APP_STORE_LISTING.txt, verify privacy details, and submit for review.

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

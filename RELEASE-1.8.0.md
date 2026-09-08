# KitchenForge 1.8.0

People can take or choose a food/receipt photo, review suggested grocery names,
edit quantities, units, cost and days remaining, then save a new pantry item or
recount a matching existing one. Photos are processed on the phone. Recognition
is conservative: one food suggestion from a close-up, or common food names from
receipt lines. It does not identify every item in a fridge, infer exact quantities,
read reliable expiry dates, or automatically trust receipt prices.

## Release status

- Account sign-ins were verified for Google Play Console, App Store Connect,
  and Codemagic. Neither store has accepted or published the version 1.8.0 binary.
- Android: version 1.8.0 / versionCode 13, compile/target SDK 36. Signed APK and AAB
  generated locally. The current Alpha release is version code 8 / version 1.5.0.
  Existing draft release 8 was renamed `13 (1.8.0)` and its release notes saved;
  no AAB has been uploaded. The upload tool rejected local file access because
  Kimi's `Allow access to file URLs` permission is disabled.
- Google Play default listing changes are saved as drafts: 76-character short
  description and 2,129-character full description. Privacy URL and Data safety
  declarations remain unchanged. Public production access is unavailable: five
  testers are opted in, while the Console requires 12 testers for 14 days.
- iOS: Codemagic build 25 (`6aa0646d59aa6d5fb03828cd`), source commit `1630e0f`,
  built and signed an App Store IPA for version 1.8.0 / build 15 with team
  `GU2N42K3AB`. Upload then failed with an Apple ID lookup error for bundle
  `com.kitchenforge.app` on iOS. App Store Connect app `6761285586` was checked
  and does use that bundle ID. No TestFlight upload or review submission succeeded.
- App Store Connect still shows version 1.3.0 Ready for Distribution; the highest
  TestFlight build displayed was 1.3.0 / build 10. Creating version 1.8.0 remains
  blocked by the updated Apple Developer Program License Agreement. Account Holder
  acceptance is pending. No App Store version 1.8.0 has been created.
- The signed IPA was independently checked and copied to the release folder as
  `KitchenForge-1.8.0.ipa`. Its SHA-256 is
  `c462f00a8c3b41f550fe113ae137112bd48c5de3b7272fae277ed01668d4f972`.
- After these checks, all browser bridge group tabs were closed. The stale bridge
  session refuses navigation and needs reconnection before browser work resumes.
- The registered Apple privacy URL,
  `https://kitchenforge-app.netlify.app/privacy`, currently returns HTTP 404.
  `PRIVACY.md` was published and verified publicly readable on September 8, 2026:
  <https://github.com/roguenealer/KitchenForge/blob/master/PRIVACY.md>.
  This fallback is ready to register in the stores; its store acceptance has
  not been established.

Google Play record: developer `4864288477058767887`, app `4973182410710576233`,
existing closed track `4699450976667166916`. Continue in these existing records.

## Validation

- `node --test tests/*.test.cjs`: all 23 parser and UI/save/reload tests passed.
- 390 x 844 browser check with a synthetic native callback: review, edit quantity
  and cost, save, and reload. Expiry and spending survived correctly.
- Android release build, lint, signature and 16 KB native-library/package checks.
- [Native iOS Release simulator build passed](https://github.com/roguenealer/KitchenForge/actions/runs/34267888675)
  for commit 05000dc, including tests, asset equality, and XcodeGen generation.
- Codemagic build 25 produced the signed App Store IPA. Release artifact review
  checked packaged resources, code-signature CMS signer, and provisioning profile.
  Successful building/signing did not result in an Apple upload.
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
3. Reconnect the browser bridge and enable Kimi's `Allow access to file URLs`
   permission before retrying the AAB upload. Use the existing closed-track draft
   `13 (1.8.0)` for `com.kitchenforge.app`; recheck uploaded version codes and
   signing identity before upload. Renaming the draft did not upload a binary.
4. Review the saved default-listing draft, restore the registered privacy
   URL or register the verified public fallback, and update Data safety for ML Kit SDK
   diagnostics. The photos/OCR content are not uploaded, but the bundled Android
   SDK collects diagnostic/per-installation data. See Google's disclosure below.
5. After the phone checks and Play validation, submit the update on the appropriate
   existing track. Production remains subject to the Console's tester requirement.
   Do not create a duplicate app or claim a submission is live.

## iOS delivery

1. The Account Holder must accept the updated Apple Developer Program License
   Agreement before version 1.8.0 can be created in App Store Connect. Reconnect
   the browser bridge to continue in the verified existing account and app.
2. Resolve the Apple ID lookup failure from Codemagic build 25. The app's bundle
   ID was verified in App Store Connect; the cause of the failed lookup is not
   established. Recheck uploaded builds and retry upload of the verified signed
   IPA after the agreement/integration state is corrected.
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

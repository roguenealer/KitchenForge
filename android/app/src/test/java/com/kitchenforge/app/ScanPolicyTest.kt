package com.kitchenforge.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanPolicyTest {
    @Test fun packagedPageAllowsInPageNavigation() {
        assertTrue(ScanPolicy.isAppPage(ScanPolicy.PAGE))
        assertTrue(ScanPolicy.isAppPage(ScanPolicy.PAGE + "#pantry"))
        assertTrue(ScanPolicy.isTrustedOrigin(ScanPolicy.ORIGIN + ":443"))
    }

    @Test fun bridgeRejectsOtherOriginsAndPaths() {
        listOf(
            "http://appassets.androidplatform.net/assets/www/index.html",
            "https://appassets.androidplatform.net.attacker.test/assets/www/index.html",
            "https://appassets.androidplatform.net:8443/assets/www/index.html",
            "https://attacker@appassets.androidplatform.net/assets/www/index.html",
            "https://appassets.androidplatform.net/assets/elsewhere.html",
            "https://appassets.androidplatform.net/assets/www/../index.html",
            ScanPolicy.LEGACY_PAGE,
            "javascript:alert(1)"
        ).forEach { assertFalse(it, ScanPolicy.isAppPage(it)) }
    }

    @Test fun externalNavigationBlocksPrivilegedSchemes() {
        assertTrue(ScanPolicy.isExternalLink("https://www.themealdb.com/meal/1"))
        assertTrue(ScanPolicy.isExternalLink("mailto:support@example.com"))
        listOf("file:///etc/passwd", "intent://example", "content://photos/1", "javascript:alert(1)")
            .forEach { assertFalse(it, ScanPolicy.isExternalLink(it)) }
    }
}

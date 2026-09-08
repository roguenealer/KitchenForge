package com.kitchenforge.app

import java.net.URI

/** Keep navigation and the native photo bridge confined to the packaged document. */
internal object ScanPolicy {
    const val ORIGIN = "https://appassets.androidplatform.net"
    const val PAGE = "$ORIGIN/assets/www/index.html"
    const val LEGACY_PAGE = "file:///android_asset/www/index.html"

    fun isTrustedOrigin(value: String): Boolean = try {
        val uri = URI(value)
        uri.scheme == "https" && uri.host == "appassets.androidplatform.net" &&
            (uri.port == -1 || uri.port == 443) && uri.rawUserInfo == null
    } catch (_: Exception) { false }

    fun isAppPage(value: String?): Boolean = try {
        value != null && isTrustedOrigin(value) && URI(value).rawPath == "/assets/www/index.html"
    } catch (_: Exception) { false }

    fun isExternalLink(value: String): Boolean = try {
        val uri = URI(value)
        uri.scheme in setOf("https", "http", "mailto", "tel") &&
            (uri.scheme in setOf("mailto", "tel") || !uri.host.isNullOrEmpty())
    } catch (_: Exception) { false }
}

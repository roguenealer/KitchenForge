package com.kitchenforge.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.ByteArrayInputStream
import java.io.File
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val preferences by lazy { getSharedPreferences("native_storage", MODE_PRIVATE) }
    private val decoder = Executors.newSingleThreadExecutor()
    private val textRecognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    private val labeler by lazy {
        ImageLabeling.getClient(ImageLabelerOptions.Builder().setConfidenceThreshold(0.65f).build())
    }
    private var pendingScan: PendingScan? = null
    private var pendingWebPermission: PermissionRequest? = null
    private var pageReady = false
    private var queuedResult: JSONObject? = null
    @Volatile private var migrating = false
    @Volatile private var legacyStorage = "{}"
    private var processing = false

    private data class PendingScan(
        val requestId: String,
        val source: String,
        val mode: String,
        var cameraFile: File? = null,
        var imageUri: Uri? = null
    )

    private val cameraPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (pendingScan?.source == "camera") {
            if (granted) launchCamera() else finishScan(error = "Camera access was denied. Allow it in Settings or choose a photo.")
        }
    }
    private val capturePhoto = registerForActivityResult(ActivityResultContracts.TakePicture()) { captured ->
        val scan = pendingScan
        if (scan != null) {
            if (captured && scan.imageUri != null) recognizePhoto(scan.imageUri!!)
            else finishScan(cancelled = true)
        }
    }
    private val choosePhoto = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (pendingScan != null) {
            if (uri == null) finishScan(cancelled = true)
            else {
                pendingScan?.imageUri = uri
                recognizePhoto(uri)
            }
        }
    }
    private val webPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        pendingWebPermission?.let { request ->
            if (ScanPolicy.isTrustedOrigin(request.origin.toString()) && ScanPolicy.isAppPage(webView.url) &&
                results.isNotEmpty() && results.values.all { it }) {
                request.grant(request.resources.filter { it in supportedWebResources }.toTypedArray())
            } else request.deny()
        }
        pendingWebPermission = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        webView = WebView(this)
        val container = android.widget.FrameLayout(this).apply {
            setBackgroundColor(android.graphics.Color.parseColor("#2E7D32"))
            addView(webView, android.widget.FrameLayout.LayoutParams(-1, -1))
        }
        setContentView(container)
        // Android 16 enforces edge-to-edge; keep controls above the system bars and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
            insets
        }
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = false
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportZoom(false)
            useWideViewPort = true
            loadWithOverviewMode = true
        }

        val assetsHandler = WebViewAssetLoader.AssetsPathHandler(this)
        val assetLoader = WebViewAssetLoader.Builder().addPathHandler("/assets/") { path ->
            if (path == "www/index.html") {
                val html = assets.open(path).bufferedReader().use { it.readText() }
                htmlResponse(html.replaceFirst("<head>", "<head>" + storageBootstrap()), true)
            } else assetsHandler.handle(path)
        }.build()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val uri = request.url
                if (ScanPolicy.isTrustedOrigin(uri.toString())) {
                    return assetLoader.shouldInterceptRequest(uri) ?: blockedResponse()
                }
                if (request.isForMainFrame || uri.scheme !in setOf("https", "data", "blob")) return blockedResponse()
                return null
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.isForMainFrame && ScanPolicy.isAppPage(request.url.toString())) return false
                if (request.isForMainFrame && request.hasGesture() && ScanPolicy.isExternalLink(request.url.toString())) {
                    try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: ActivityNotFoundException) { }
                }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (migrating && url == ScanPolicy.LEGACY_PAGE) {
                    // Page scripts were disabled during loading. Enable only for our explicit storage read.
                    view.settings.javaScriptEnabled = true
                    migrateLegacyStorage()
                } else if (ScanPolicy.isAppPage(url)) {
                    view.evaluateJavascript(BRIDGE_SCRIPT, null)
                    view.evaluateJavascript("localStorage.getItem('kf_native_storage_v1') === '1'") { value ->
                        if (value == "true") {
                            if (!preferences.getBoolean("migration_complete", false)) view.clearHistory()
                            preferences.edit().putBoolean("migration_complete", true).apply()
                            pageReady = true
                            view.visibility = android.view.View.VISIBLE
                            queuedResult?.let { deliverResult(it) }
                            queuedResult = null
                        } else showStorageError()
                    }
                }
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (!ScanPolicy.isTrustedOrigin(request.origin.toString()) || !ScanPolicy.isAppPage(webView.url) ||
                        request.resources.any { it !in supportedWebResources } || pendingWebPermission != null || pendingScan != null) {
                        request.deny()
                        return@runOnUiThread
                    }
                    val needed = request.resources.map {
                        if (it == PermissionRequest.RESOURCE_VIDEO_CAPTURE) Manifest.permission.CAMERA else Manifest.permission.RECORD_AUDIO
                    }.filter { ContextCompat.checkSelfPermission(this@MainActivity, it) != PackageManager.PERMISSION_GRANTED }
                    if (needed.isEmpty()) request.grant(request.resources)
                    else {
                        pendingWebPermission = request
                        webPermissions.launch(needed.toTypedArray())
                    }
                }
            }
            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (pendingWebPermission == request) pendingWebPermission = null
            }
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "KitchenForgeNative", setOf(ScanPolicy.ORIGIN)) {
                    _, message, origin, isMainFrame, _ ->
                if (isMainFrame && ScanPolicy.isTrustedOrigin(origin.toString()) && ScanPolicy.isAppPage(webView.url)) {
                    beginScan(message.data ?: "")
                }
            }
        }

        restorePendingScan(savedInstanceState)
        // Remove abandoned camera temp files only, never users' gallery images.
        File(cacheDir, "scan_photos").listFiles()?.filter {
            it != pendingScan?.cameraFile && System.currentTimeMillis() - it.lastModified() > 86_400_000L
        }?.forEach { it.delete() }
        if (preferences.getBoolean("migration_complete", false)) {
            webView.loadUrl(ScanPolicy.PAGE)
        } else if (preferences.contains("legacy_storage")) {
            legacyStorage = preferences.getString("legacy_storage", "{}") ?: "{}"
            webView.loadUrl(ScanPolicy.PAGE)
        } else {
            migrating = true
            webView.visibility = android.view.View.INVISIBLE
            // Android never intercepts file:///android_asset URLs. Load the exact original URL
            // with scripting disabled so no app initialization can change the legacy storage.
            webView.settings.javaScriptEnabled = false
            webView.settings.allowFileAccess = true
            webView.loadUrl(ScanPolicy.LEGACY_PAGE)
        }
        if (savedInstanceState?.getBoolean("scan_processing") == true) {
            pendingScan?.imageUri?.let { recognizePhoto(it) }
        }
    }

    private fun migrateLegacyStorage() {
        webView.evaluateJavascript("""
            (function(){try{var saved={};for(var i=0;i<localStorage.length;i++){var key=localStorage.key(i);if(key.indexOf('kf_')===0)saved[key]=localStorage.getItem(key);}return JSON.stringify({ok:true,data:saved});}catch(e){return JSON.stringify({ok:false});}})()
        """.trimIndent()) { value ->
            try {
                val result = JSONObject(JSONTokener(value).nextValue() as String)
                check(result.getBoolean("ok"))
                legacyStorage = result.getJSONObject("data").toString()
                // Retain a recovery copy and the original storage. Neither is deleted after migration.
                check(preferences.edit().putString("legacy_storage", legacyStorage).commit())
                migrating = false
                webView.settings.allowFileAccess = false
                webView.loadUrl(ScanPolicy.PAGE)
            } catch (_: Exception) { showStorageError() }
        }
    }

    private fun storageBootstrap(): String {
        val saved = JSONObject.quote(legacyStorage).replace("<", "\\u003c")
        return """<script>(function(){try{if(localStorage.getItem('kf_native_storage_v1')!=='1'){var saved=JSON.parse($saved);Object.keys(saved).forEach(function(key){if(key.indexOf('kf_')===0&&localStorage.getItem(key)===null)localStorage.setItem(key,saved[key]);});localStorage.setItem('kf_native_storage_v1','1');}}catch(e){window.kitchenForgeStorageError=true;}})();$BRIDGE_SCRIPT</script>"""
    }

    private fun showStorageError() {
        if (isFinishing || isDestroyed) return
        AlertDialog.Builder(this).setTitle("Your pantry is safe")
            .setMessage("KitchenForge could not load your saved data. Close and reopen the app to retry. Your previous data has not been deleted.")
            .setPositiveButton("Close") { _, _ -> finish() }.setCancelable(false).show()
    }

    private fun beginScan(raw: String) {
        if (raw.length > 4096) return
        val json = try { JSONObject(raw) } catch (_: Exception) { return }
        val id = json.optString("requestId")
        if (id.isBlank() || id.length > 120) return
        val source = json.optString("source")
        val mode = json.optString("mode")
        if (source !in setOf("camera", "library") || mode !in setOf("food", "receipt")) {
            deliverResult(result(id, error = "Choose a camera or library photo to scan."))
            return
        }
        if (pendingScan != null || pendingWebPermission != null) {
            deliverResult(result(id, error = "Finish the current camera or permission request first."))
            return
        }
        pendingScan = PendingScan(id, source, mode)
        if (source == "library") {
            try { choosePhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            catch (_: Exception) { finishScan(error = "The photo library could not be opened. Please try again.") }
        } else if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchCamera()
        } else cameraPermission.launch(Manifest.permission.CAMERA)
    }

    private fun launchCamera() {
        val scan = pendingScan ?: return
        try {
            val directory = File(cacheDir, "scan_photos").apply { mkdirs() }
            val file = File.createTempFile("photo_", ".jpg", directory)
            scan.cameraFile = file
            val uri = FileProvider.getUriForFile(this, "$packageName.scanfiles", file)
            scan.imageUri = uri
            capturePhoto.launch(uri)
        } catch (_: ActivityNotFoundException) {
            finishScan(error = "No camera app is available. Choose a photo from your library.")
        } catch (_: Exception) {
            finishScan(error = "The camera could not be opened. Please try again or choose a photo.")
        }
    }

    private fun recognizePhoto(uri: Uri) {
        val scan = pendingScan ?: return
        processing = true
        decoder.execute {
            try {
                val bitmap = ScanImageDecoder.decode(this, uri)
                runOnUiThread {
                    if (isDestroyed || pendingScan !== scan) { bitmap.recycle(); return@runOnUiThread }
                    val image = InputImage.fromBitmap(bitmap, 0)
                    val textTask = textRecognizer.process(image)
                    val labelsTask = if (scan.mode == "food") labeler.process(image) else null
                    val tasks = if (labelsTask == null) listOf(textTask) else listOf(textTask, labelsTask)
                    Tasks.whenAllComplete(tasks).addOnCompleteListener {
                        bitmap.recycle()
                        if (isDestroyed || pendingScan !== scan) return@addOnCompleteListener
                        val labels = JSONArray()
                        if (labelsTask?.isSuccessful == true) {
                            labelsTask.result.sortedByDescending { it.confidence }.take(15).forEach {
                                labels.put(JSONObject().put("name", it.text).put("confidence", it.confidence.toDouble()))
                            }
                        }
                        val text = if (textTask.isSuccessful) textTask.result.text.take(24_000) else ""
                        if (!textTask.isSuccessful && (labelsTask == null || !labelsTask.isSuccessful)) {
                            finishScan(error = "This photo could not be read. Try a clear, well-lit photo or add items manually.")
                        } else finishScan(text = text, labels = labels)
                    }
                }
            } catch (_: Exception) {
                runOnUiThread {
                    if (!isDestroyed && pendingScan === scan) finishScan(error = "This photo could not be opened. Choose a smaller JPEG, PNG, or supported phone photo.")
                }
            }
        }
    }

    private fun finishScan(text: String = "", labels: JSONArray = JSONArray(), error: String? = null, cancelled: Boolean = false) {
        val scan = pendingScan ?: return
        pendingScan = null
        processing = false
        scan.cameraFile?.let { file ->
            scan.imageUri?.let { revokeUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
            file.delete()
        }
        deliverResult(result(scan.requestId, text, labels, error, cancelled))
    }

    private fun result(id: String, text: String = "", labels: JSONArray = JSONArray(), error: String? = null, cancelled: Boolean = false): JSONObject =
        JSONObject().put("requestId", id).put("text", text).put("labels", labels).apply {
            if (error != null) put("error", error)
            if (cancelled) put("cancelled", true)
        }

    private fun deliverResult(payload: JSONObject) {
        if (isDestroyed) return
        if (!pageReady) { queuedResult = payload; return }
        if (ScanPolicy.isAppPage(webView.url)) {
            webView.evaluateJavascript("window.onKitchenForgeScanResult && window.onKitchenForgeScanResult($payload);", null)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        pendingScan?.let {
            outState.putString("scan_id", it.requestId)
            outState.putString("scan_source", it.source)
            outState.putString("scan_mode", it.mode)
            outState.putString("scan_file", it.cameraFile?.absolutePath)
            outState.putString("scan_uri", it.imageUri?.toString())
            outState.putBoolean("scan_processing", processing)
        }
        super.onSaveInstanceState(outState)
    }

    private fun restorePendingScan(state: Bundle?) {
        val id = state?.getString("scan_id") ?: return
        val cameraFile = state.getString("scan_file")?.let { File(it) }?.takeIf {
            it.parentFile?.canonicalFile == File(cacheDir, "scan_photos").canonicalFile
        }
        pendingScan = PendingScan(id, state.getString("scan_source") ?: "library", state.getString("scan_mode") ?: "food",
            cameraFile, state.getString("scan_uri")?.let { Uri.parse(it) })
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack() && ScanPolicy.isAppPage(webView.url)) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        pendingWebPermission?.deny()
        if (isFinishing) pendingScan?.cameraFile?.delete()
        decoder.shutdownNow()
        textRecognizer.close()
        labeler.close()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private val supportedWebResources = setOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE, PermissionRequest.RESOURCE_AUDIO_CAPTURE)
        private const val BRIDGE_SCRIPT = "if(window.KitchenForgeNative){window.KitchenForgeScanner={scanPhoto:function(payload){window.KitchenForgeNative.postMessage(typeof payload==='string'?payload:JSON.stringify(payload));}};}"
        private const val CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://www.themealdb.com; media-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'"
        private fun htmlResponse(html: String, withPolicy: Boolean): WebResourceResponse = WebResourceResponse(
            "text/html", "utf-8", 200, "OK", if (withPolicy) mapOf("Content-Security-Policy" to CSP) else emptyMap(),
            ByteArrayInputStream(html.toByteArray(Charsets.UTF_8))
        )
        private fun blockedResponse() = WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(ByteArray(0)))
    }
}

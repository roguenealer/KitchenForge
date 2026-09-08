import UIKit
import WebKit
import AVFoundation

class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {

    private var webView: WKWebView!
    private var bundledAppURL: URL?
    private lazy var photoScanner = PhotoScanner(presenter: self)
    private let scannerMessageName = "kitchenForgeScanner"

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        loadApp()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        webView.frame = view.bounds
    }

    // MARK: - WebView Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Allow camera and microphone access for food scanning and voice input
        if #available(iOS 15.4, *) {
            config.preferences.isElementFullscreenEnabled = true
        }

        let preferences = WKPreferences()
        preferences.javaScriptCanOpenWindowsAutomatically = true
        config.preferences = preferences
        // WKUserContentController retains its handlers. The proxy keeps the
        // controller and scanner from being kept alive after this screen closes.
        config.userContentController.add(WeakScriptMessageHandler(self), name: scannerMessageName)

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.98, green: 0.98, blue: 0.96, alpha: 1.0) // #FAFAF5

        // Match the app's green status bar
        view.backgroundColor = UIColor(red: 0.18, green: 0.49, blue: 0.20, alpha: 1.0) // #2E7D32

        // Disable zoom
        webView.scrollView.isScrollEnabled = true
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false

        view.addSubview(webView)
    }

    private var hasLoadedSuccessfully = false

    private func loadApp() {
        // Method 1: Try www subdirectory (postCompileScript copy)
        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
            let directory = url.deletingLastPathComponent()
            bundledAppURL = url
            webView.loadFileURL(url, allowingReadAccessTo: directory)
            return
        }

        // Method 2: Try bundle root (group reference)
        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            let directory = Bundle.main.bundleURL
            bundledAppURL = url
            webView.loadFileURL(url, allowingReadAccessTo: directory)
            return
        }

        // Method 3: Try direct file path construction
        let bundlePath = Bundle.main.bundlePath
        let possiblePaths = [
            "\(bundlePath)/www/index.html",
            "\(bundlePath)/index.html",
            "\(bundlePath)/KitchenForge/www/index.html"
        ]

        for path in possiblePaths {
            let fileURL = URL(fileURLWithPath: path)
            if FileManager.default.fileExists(atPath: path) {
                let directory = fileURL.deletingLastPathComponent()
                bundledAppURL = fileURL
                webView.loadFileURL(fileURL, allowingReadAccessTo: directory)
                return
            }
        }

        // If all methods fail, show the web app inline as a last resort
        loadEmbeddedFallback()
    }

    private func loadEmbeddedFallback() {
        // As a last resort, redirect to the hosted web version
        if let url = URL(string: "https://kitchenforge-app.netlify.app") {
            webView.load(URLRequest(url: url))
            return
        }
        showError("Could not load app. Please check your internet connection.")
    }

    private func showError(_ message: String) {
        let html = """
        <html><body style="display:flex;justify-content:center;align-items:center;height:100vh;
        font-family:-apple-system,sans-serif;color:#333;background:#FAFAF5;">
        <div style="text-align:center;padding:20px;">
        <h2>Oops!</h2><p>\(message)</p>
        </div></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hasLoadedSuccessfully = true
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if !hasLoadedSuccessfully {
            loadEmbeddedFallback()
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if !hasLoadedSuccessfully {
            loadEmbeddedFallback()
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        // Keep native capabilities confined to the bundled app document.
        if url.isFileURL {
            decisionHandler(isBundledAppURL(url) ? .allow : .cancel)
            return
        }

        // Open external links in Safari
        if url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    // MARK: - WKUIDelegate (JS Dialogs + Camera/Microphone permissions)

    // Handle JavaScript alert()
    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler()
        })
        present(alert, animated: true)
    }

    // Handle JavaScript confirm()
    func webView(_ webView: WKWebView,
                 runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
            completionHandler(false)
        })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(true)
        })
        present(alert, animated: true)
    }

    // Handle JavaScript prompt()
    func webView(_ webView: WKWebView,
                 runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { textField in
            textField.text = defaultText
        }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
            completionHandler(nil)
        })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(alert.textFields?.first?.text)
        })
        present(alert, animated: true)
    }

    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        guard frame.isMainFrame, isBundledAppURL(frame.request.url),
              isBundledAppURL(webView.url) else {
            decisionHandler(.deny)
            return
        }
        // Grant camera/microphone access for food scanning and voice input
        switch type {
        case .camera:
            requestCameraPermission { granted in
                decisionHandler(granted ? .grant : .deny)
            }
        case .microphone:
            requestMicrophonePermission { granted in
                decisionHandler(granted ? .grant : .deny)
            }
        case .cameraAndMicrophone:
            requestCameraPermission { cameraGranted in
                self.requestMicrophonePermission { micGranted in
                    decisionHandler((cameraGranted && micGranted) ? .grant : .deny)
                }
            }
        @unknown default:
            decisionHandler(.deny)
        }
    }

    // MARK: - Native Photo Scanning

    private func isBundledAppURL(_ url: URL?) -> Bool {
        guard let url = url, url.isFileURL, let bundledAppURL = bundledAppURL else { return false }
        return url.standardizedFileURL.resolvingSymlinksInPath().path ==
            bundledAppURL.standardizedFileURL.resolvingSymlinksInPath().path
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == scannerMessageName, message.webView === webView,
              message.frameInfo.isMainFrame, isBundledAppURL(message.frameInfo.request.url),
              isBundledAppURL(webView.url), let body = message.body as? [String: Any],
              let requestID = body["requestId"] as? String, !requestID.isEmpty,
              requestID.count <= 128 else { return }
        guard let source = body["source"] as? String, ["camera", "library"].contains(source),
              let mode = body["mode"] as? String, ["food", "receipt"].contains(mode) else {
            deliverScanResult(["requestId": requestID, "text": "", "labels": [],
                               "error": "Choose a camera or photo-library scan and try again."])
            return
        }
        photoScanner.scan(requestID: requestID, source: source, mode: mode) { [weak self] payload in
            self?.deliverScanResult(payload)
        }
    }

    private func deliverScanResult(_ payload: [String: Any]) {
        guard isBundledAppURL(webView.url) else { return }
        // Pass OCR text as a JavaScript argument instead of interpolating it
        // into executable source; a photographed string is untrusted input.
        webView.callAsyncJavaScript(
            "if (typeof window.onKitchenForgeScanResult === 'function') { window.onKitchenForgeScanResult(result); }",
            arguments: ["result": payload], in: nil, in: .page, completionHandler: nil)
    }

    // MARK: - Permission Helpers

    private func requestCameraPermission(completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async { completion(granted) }
            }
        default:
            completion(false)
        }
    }

    private func requestMicrophonePermission(completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                DispatchQueue.main.async { completion(granted) }
            }
        default:
            completion(false)
        }
    }
}

private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var delegate: WKScriptMessageHandler?

    init(_ delegate: WKScriptMessageHandler) {
        self.delegate = delegate
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

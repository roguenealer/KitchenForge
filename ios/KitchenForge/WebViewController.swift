import UIKit
import WebKit
import AVFoundation

class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private var webView: WKWebView!

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

    private func loadApp() {
        guard let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") else {
            showError("Could not find app files.")
            return
        }
        let directory = url.deletingLastPathComponent()
        webView.loadFileURL(url, allowingReadAccessTo: directory)
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

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        // Allow local file URLs
        if url.isFileURL {
            decisionHandler(.allow)
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

    // MARK: - WKUIDelegate (Camera/Microphone permissions)

    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
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

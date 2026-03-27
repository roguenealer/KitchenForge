import SwiftUI
import WebKit

struct WebViewContainer: UIViewControllerRepresentable {

    func makeUIViewController(context: Context) -> WebViewController {
        return WebViewController()
    }

    func updateUIViewController(_ uiViewController: WebViewController, context: Context) {}
}

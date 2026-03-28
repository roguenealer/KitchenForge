import SwiftUI

@main
struct KitchenForgeApp: App {
    var body: some Scene {
        WindowGroup {
            WebViewContainer()
                .ignoresSafeArea(edges: .bottom)
                .preferredColorScheme(.light)
        }
    }
}

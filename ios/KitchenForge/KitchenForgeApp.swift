import SwiftUI

@main
struct KitchenForgeApp: App {
    var body: some Scene {
        WindowGroup {
            WebViewContainer()
                .ignoresSafeArea(.container, edges: .bottom)
                .preferredColorScheme(.light)
        }
    }
}

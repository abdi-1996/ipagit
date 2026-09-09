import SwiftUI

@main
struct ColorizeSign3DApp: App {
    var body: some Scene {
        WindowGroup {
            EditorView()
                .preferredColorScheme(.dark)
        }
    }
}


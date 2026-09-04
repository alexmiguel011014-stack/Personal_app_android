import SwiftUI
import Shared

// Bridges MainViewController.kt's Kotlin/Native `MainViewController()` (a plain top-level
// function, so Kotlin/Native exposes it as `MainViewControllerKt.MainViewController()` to
// Swift/Obj-C — the `Kt` suffix is Kotlin's own convention for top-level-function file facades,
// not a typo) into a real SwiftUI view.
struct ComposeView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        MainViewControllerKt.MainViewController()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}

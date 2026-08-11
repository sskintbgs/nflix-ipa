import UIKit
import Capacitor
import WebKit

// Custom WebView controller that disables iOS ITP (Intelligent Tracking Prevention)
// which was blocking the embed player iframe from accessing cookies and storage
class NflixBridgeViewController: CAPBridgeViewController {
    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)

        // Use the default (non-partitioned) data store to disable ITP cross-origin storage blocking
        config.websiteDataStore = WKWebsiteDataStore.default()

        // Allow inline media playback without requiring a user gesture
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Allow JS to open windows (needed by some embed players)
        config.preferences.javaScriptCanOpenWindowsAutomatically = true

        return config
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // Use our custom controller instead of the default CAPBridgeViewController
        window?.rootViewController = NflixBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

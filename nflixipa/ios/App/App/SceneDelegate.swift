import UIKit
import Capacitor
import WebKit

// Custom WebView controller that disables iOS ITP (Intelligent Tracking Prevention)
// which was blocking the embed player iframe from accessing cookies and storage
class NflixBridgeViewController: CAPBridgeViewController {
    override func webViewConfiguration() -> WKWebViewConfiguration {
        let config = super.webViewConfiguration()

        // Disable cross-origin storage partitioning (the main cause of the white screen)
        config.websiteDataStore = WKWebsiteDataStore.default()

        // Allow inline media playback without user gesture
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Allow JS to open windows (needed by the embed player)
        config.preferences.javaScriptCanOpenWindowsAutomatically = true

        return config
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // Pre-grant storage access so the iframe player can use cookies/localStorage freely
        // This is the key fix for the "Partitioned cookie or storage access denied" error
        webView?.evaluateJavaScript("""
            if (document.hasStorageAccess) {
                document.requestStorageAccess().then(function() {
                    console.log('[Native] Storage access granted');
                }).catch(function(e) {
                    console.warn('[Native] Storage access request failed:', e);
                });
            }
        """, completionHandler: nil)
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

import Foundation
import UIKit
import Capacitor
import SafariServices

@objc(NflixBrowserPlugin)
public class NflixBrowserPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NflixBrowserPlugin"
    public let jsName = "NflixBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"), let url = URL(string: urlStr) else {
            call.reject("Invalid URL")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let vc = self.bridge?.viewController else {
                call.reject("No view controller")
                return
            }

            let config = SFSafariViewController.Configuration()
            config.entersReaderIfAvailable = false
            config.barCollapsingEnabled = true

            let safari = SFSafariViewController(url: url, configuration: config)
            safari.preferredBarTintColor = UIColor(red: 8/255, green: 8/255, blue: 8/255, alpha: 1)
            safari.preferredControlTintColor = .white
            safari.dismissButtonStyle = .close
            safari.modalPresentationStyle = .fullScreen

            vc.present(safari, animated: true) {
                call.resolve()
            }
        }
    }
}

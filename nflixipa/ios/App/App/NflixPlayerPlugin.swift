import Foundation
import UIKit
import AVFoundation
import AVKit
import Capacitor

@objc(NflixPlayerPlugin)
public class NflixPlayerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NflixPlayerPlugin"
    public let jsName = "NflixPlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dismiss", returnType: CAPPluginReturnPromise)
    ]

    private var playerVC: AVPlayerViewController?

    @objc func play(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"), let url = URL(string: urlStr) else {
            call.reject("Invalid stream URL")
            return
        }

        let startAt = max(0, call.getDouble("startAt") ?? 0)

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let host = self.bridge?.viewController else {
                call.reject("No view controller")
                return
            }

            self.closePlayer(animated: false)

            do {
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
                try AVAudioSession.sharedInstance().setActive(true)
            } catch {
                NSLog("NflixPlayer: audio session error: %@", error.localizedDescription)
            }

            let item = AVPlayerItem(url: url)
            let player = AVPlayer(playerItem: item)
            player.automaticallyWaitsToMinimizeStalling = true

            let pvc = AVPlayerViewController()
            pvc.player = player
            pvc.allowsPictureInPicturePlayback = true
            pvc.canStartPictureInPictureAutomaticallyFromInline = true
            pvc.modalPresentationStyle = .fullScreen
            self.playerVC = pvc

            host.present(pvc, animated: true) {
                let beginPlayback = {
                    player.play()
                    call.resolve(["playing": true])
                }

                if startAt > 0.5 {
                    let target = CMTime(seconds: startAt, preferredTimescale: 600)
                    player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero) { _ in
                        beginPlayback()
                    }
                } else {
                    beginPlayback()
                }
            }
        }
    }

    @objc func dismiss(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.closePlayer(animated: true)
            call.resolve()
        }
    }

    private func closePlayer(animated: Bool) {
        guard let pvc = playerVC else { return }
        pvc.player?.pause()
        pvc.dismiss(animated: animated)
        playerVC = nil
    }
}

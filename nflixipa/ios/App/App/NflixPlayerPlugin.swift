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

    private let mintBase = "https://nflixmovies.app/api/mint-direct/api/v1/play"
    private var playerVC: AVPlayerViewController?
    private var timeObserver: Any?

    @objc func play(_ call: CAPPluginCall) {
        let startAt = max(0, call.getDouble("startAt") ?? 0)
        let title = call.getString("title") ?? "FluxTV"
        let direct = call.getString("url")
        let type = call.getString("type") ?? "movie"
        let id = call.getInt("id") ?? Int(call.getString("id") ?? "") ?? 0
        let season = call.getInt("season") ?? Int(call.getString("season") ?? "") ?? 1
        let episode = call.getInt("episode") ?? Int(call.getString("episode") ?? "") ?? 1

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            do {
                let picked: PickedStream
                if let direct, let url = URL(string: direct), url.scheme != nil {
                    picked = PickedStream(url: url, referer: "https://nflixmovies.app/", origin: "https://nflixmovies.app")
                } else {
                    guard id > 0 else {
                        call.reject("Missing title id")
                        return
                    }
                    picked = try self.resolveMint(type: type, id: id, season: season, episode: episode, title: title)
                }
                DispatchQueue.main.async {
                    self.presentPlayer(url: picked.url, referer: picked.referer, origin: picked.origin, startAt: startAt, call: call)
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func dismiss(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.closePlayer(animated: true)
            call.resolve()
        }
    }

    private func presentPlayer(url: URL, referer: String, origin: String, startAt: Double, call: CAPPluginCall) {
        guard let host = self.bridge?.viewController else {
            call.reject("No view controller")
            return
        }

        closePlayer(animated: false)

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            NSLog("FluxTV player audio session: %@", error.localizedDescription)
        }

        let headers: [String: String] = [
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Referer": referer,
            "Origin": origin,
            "Accept": "*/*"
        ]
        let asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
        let item = AVPlayerItem(asset: asset)
        let player = AVPlayer(playerItem: item)
        player.automaticallyWaitsToMinimizeStalling = true

        let pvc = AVPlayerViewController()
        pvc.player = player
        pvc.allowsPictureInPicturePlayback = true
        if #available(iOS 15.0, *) {
            pvc.canStartPictureInPictureAutomaticallyFromInline = true
        }
        pvc.modalPresentationStyle = .fullScreen
        self.playerVC = pvc

        host.present(pvc, animated: true) {
            let start = {
                player.play()
                call.resolve(["playing": true, "url": url.absoluteString])
            }
            if startAt > 0.5 {
                let target = CMTime(seconds: startAt, preferredTimescale: 600)
                player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero) { _ in
                    start()
                }
            } else {
                start()
            }
        }
    }

    private func closePlayer(animated: Bool) {
        if let observer = timeObserver, let player = playerVC?.player {
            player.removeTimeObserver(observer)
        }
        timeObserver = nil
        guard let pvc = playerVC else { return }
        pvc.player?.pause()
        pvc.dismiss(animated: animated)
        playerVC = nil
    }

    private struct PickedStream {
        let url: URL
        let referer: String
        let origin: String
    }

    private enum PlayerError: LocalizedError {
        case mintHTTP(Int)
        case mintBad
        case noStream
        var errorDescription: String? {
            switch self {
            case .mintHTTP(let code): return "Mint API failed (\(code))"
            case .mintBad: return "Mint API returned no playable source"
            case .noStream: return "No HLS or MP4 stream from mint"
            }
        }
    }

    private func resolveMint(type: String, id: Int, season: Int, episode: Int, title: String) throws -> PickedStream {
        var comps = URLComponents(string: mintBase)!
        var items = [
            URLQueryItem(name: "id", value: String(id)),
            URLQueryItem(name: "type", value: type)
        ]
        if type == "tv" {
            items.append(URLQueryItem(name: "season", value: String(season)))
            items.append(URLQueryItem(name: "episode", value: String(episode)))
        }
        if !title.isEmpty && title != "FluxTV" {
            items.append(URLQueryItem(name: "title", value: title))
        }
        comps.queryItems = items
        guard let mintURL = comps.url else { throw PlayerError.mintBad }

        var req = URLRequest(url: mintURL, timeoutInterval: 45)
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("https://nflixmovies.app/", forHTTPHeaderField: "Referer")
        req.setValue("https://nflixmovies.app", forHTTPHeaderField: "Origin")

        let sem = DispatchSemaphore(value: 0)
        var data: Data?
        var status = 0
        var err: Error?
        URLSession.shared.dataTask(with: req) { body, resp, e in
            data = body
            status = (resp as? HTTPURLResponse)?.statusCode ?? 0
            err = e
            sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + 48)
        if let err { throw err }
        guard status >= 200 && status < 300, let data else { throw PlayerError.mintHTTP(status) }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw PlayerError.mintBad }
        if let ok = json["ok"] as? Bool, ok == false { throw PlayerError.mintBad }
        guard let picked = pickStream(json) else { throw PlayerError.noStream }
        return picked
    }

    private func pickStream(_ json: [String: Any]) -> PickedStream? {
        let menu = (json["menuSources"] as? [[String: Any]]) ?? (json["sources"] as? [[String: Any]]) ?? []

        func isMp4(_ u: String) -> Bool { u.range(of: #"\.mp4(\?|$)"#, options: .regularExpression) != nil && u.range(of: #"\.mpd(\?|$)"#, options: .regularExpression) == nil }
        func isHls(_ u: String) -> Bool { u.range(of: #"\.m3u8(\?|$)"#, options: .regularExpression) != nil }
        func isMpd(_ u: String) -> Bool { u.range(of: #"\.mpd(\?|$)"#, options: .regularExpression) != nil }

        func signed(_ s: [String: Any]) -> String {
            let prog = s["progressiveUrl"] as? String ?? ""
            if isMp4(prog) { return prog }
            for key in ["playlistPath", "hlsUrl", "directUrl", "url", "upstream"] {
                if let u = s[key] as? String, !u.isEmpty { return u }
            }
            return ""
        }
        func prov(_ s: [String: Any]) -> String {
            ((s["provider"] as? String) ?? (s["label"] as? String) ?? "").lowercased()
        }
        func headers(for s: [String: Any], url: String) -> (String, String) {
            let ref = (s["referer"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let origin = (s["origin"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if url.contains("jsdzf.ltd") {
                return (ref.isEmpty ? "https://gcdn.jsdzf.ltd/" : ref, origin.isEmpty ? "https://gcdn.jsdzf.ltd" : origin)
            }
            return (
                ref.isEmpty ? "https://nflixmovies.app/" : ref,
                origin.isEmpty ? "https://nflixmovies.app" : origin
            )
        }
        func accept(_ s: [String: Any], pred: (String, String) -> Bool) -> PickedStream? {
            let u = signed(s)
            guard !u.isEmpty, !isMpd(u), pred(u, prov(s)), let url = URL(string: u) else { return nil }
            let h = headers(for: s, url: u)
            return PickedStream(url: url, referer: h.0, origin: h.1)
        }

        for s in menu {
            if let hit = accept(s, pred: { u, p in (p.contains("dulo") || p.contains("delta")) && isHls(u) }) { return hit }
        }
        for s in menu {
            if let hit = accept(s, pred: { u, p in (p.contains("nflix") || u.contains("jsdzf")) && isHls(u) }) { return hit }
        }
        for s in menu {
            if let hit = accept(s, pred: { u, _ in isMp4(u) }) { return hit }
        }
        for s in menu {
            if let hit = accept(s, pred: { u, _ in isHls(u) }) { return hit }
        }

        let topKeys = ["progressiveUrl", "directUrl", "hlsUrl", "playlistPath", "url", "upstream"]
        for key in topKeys {
            if let u = json[key] as? String, !u.isEmpty, !isMpd(u), (isHls(u) || isMp4(u)), let url = URL(string: u) {
                return PickedStream(url: url, referer: "https://nflixmovies.app/", origin: "https://nflixmovies.app")
            }
        }
        return nil
    }
}

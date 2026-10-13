import Foundation

/// The development build permits local HTTP. Release builds require HTTPS.
enum StudioAddress {
    static func parse(_ text: String, allowLocalHTTP: Bool) -> URL? {
        guard let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = url.host?.lowercased(), !host.isEmpty,
              url.user == nil, url.password == nil, url.fragment == nil,
              url.query == nil, url.path.isEmpty || url.path == "/" else { return nil }
        if url.scheme == "https" { return url }
        guard allowLocalHTTP, url.scheme == "http" else { return nil }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        let privateIP = parts.count == 4 && parts.allSatisfy { (0...255).contains($0) }
            && (parts[0] == 10 || parts[0] == 127 || (parts[0] == 192 && parts[1] == 168)
                || (parts[0] == 172 && (16...31).contains(parts[1])))
        return host == "localhost" || host == "::1" || host.hasSuffix(".local") || privateIP ? url : nil
    }

    static func sameOrigin(_ a: URL?, _ b: URL?) -> Bool {
        guard let a, let b else { return false }
        func port(_ url: URL) -> Int { url.port ?? (url.scheme == "https" ? 443 : 80) }
        return a.scheme == b.scheme && a.host?.lowercased() == b.host?.lowercased() && port(a) == port(b)
    }
}

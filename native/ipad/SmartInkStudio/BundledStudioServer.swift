import Foundation
import Network
import UniformTypeIdentifiers

/// A fixed loopback origin preserves WebKit storage across launches. Never listens on Wi-Fi.
final class BundledStudioServer {
    static let address = URL(string: "http://127.0.0.1:18772")!
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "com.smartink.assets")

    func start() async throws {
        guard listener == nil else { return }
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("Web"),
              FileManager.default.fileExists(atPath: root.appendingPathComponent("index.html").path) else {
            throw NSError(domain: "Studio", code: 1, userInfo: [NSLocalizedDescriptionKey: "The studio files are missing from this build. Rebuild the iPad bundle."])
        }
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 18772)
        let server = try NWListener(using: parameters)
        listener = server
        server.newConnectionHandler = { [weak self] connection in
            connection.start(queue: self?.queue ?? .global())
            self?.receive(connection, root: root, buffer: Data())
        }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            var completed = false
            server.stateUpdateHandler = { state in
                guard !completed else { return }
                switch state {
                case .ready: completed = true; continuation.resume()
                case .failed(let error): completed = true; continuation.resume(throwing: error)
                case .cancelled: completed = true; continuation.resume(throwing: CancellationError())
                default: break
                }
            }
            server.start(queue: queue)
        }
    }

    private func receive(_ connection: NWConnection, root: URL, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, done, error in
            var request = buffer
            if let data { request.append(data) }
            guard request.count <= 16384, error == nil else { connection.cancel(); return }
            if request.range(of: Data("\r\n\r\n".utf8)) != nil {
                self?.respond(connection, root: root, request: request)
            } else if done { connection.cancel() }
            else { self?.receive(connection, root: root, buffer: request) }
        }
    }

    private func respond(_ connection: NWConnection, root: URL, request: Data) {
        let line = String(decoding: request, as: UTF8.self).components(separatedBy: "\r\n").first ?? ""
        let parts = line.split(separator: " ")
        guard parts.count == 3, ["GET", "HEAD"].contains(parts[0]) else { send(connection, status: 405, body: Data()); return }
        let raw = String(parts[1]).components(separatedBy: "?")[0]
        guard let path = raw.removingPercentEncoding, path.hasPrefix("/"), !path.contains("\0"), !path.contains("\\"),
              !path.split(separator: "/").contains("..") else { send(connection, status: 403, body: Data()); return }
        let file = root.appendingPathComponent(path == "/" ? "index.html" : String(path.dropFirst())).standardizedFileURL.resolvingSymlinksInPath()
        let allowed = root.standardizedFileURL.resolvingSymlinksInPath().path + "/"
        guard file.path.hasPrefix(allowed), let bytes = try? Data(contentsOf: file), bytes.count <= 50 * 1024 * 1024 else {
            send(connection, status: 404, body: Data()); return
        }
        let types = ["js":"text/javascript", "mjs":"text/javascript", "css":"text/css", "html":"text/html", "wasm":"application/wasm", "json":"application/json", "glb":"model/gltf-binary", "svg":"image/svg+xml"]
        let type = types[file.pathExtension] ?? UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        send(connection, status: 200, body: bytes, type: type, head: parts[0] == "HEAD")
    }
    private func send(_ connection: NWConnection, status: Int, body: Data, type: String = "text/plain", head: Bool = false) {
        var data = Data("HTTP/1.1 \(status) Response\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n".utf8)
        if !head { data.append(body) }
        connection.send(content: data, completion: .contentProcessed { _ in connection.cancel() })
    }
    deinit { listener?.cancel() }
}

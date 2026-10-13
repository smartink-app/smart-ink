import Foundation
import UIKit

struct StudioRenderJob: Codable, Identifiable {
    let id: String
    let owner: String
    let name: String
    let created: Date
    let endpoint: String
    var status: String
    var message: String
    var progress: Double
    var complete: Bool { status == "complete" }
    var active: Bool { status == "uploading" || status == "rendering" }
}

/// URLSession owns uploads while iPadOS suspends the UI. Explicit retries only.
final class RenderJobs: NSObject, ObservableObject, URLSessionDownloadDelegate, URLSessionDataDelegate, @unchecked Sendable {
    static let shared = RenderJobs()
    static let sessionID = "com.smartink.studio.renders.v1"
    @Published private(set) var jobs: [StudioRenderJob] = []
    @Published private(set) var storageFailure: String?
    var completion: ((String, String?, String?) -> Void)?
    var backgroundCompletion: (() -> Void)?
    private let root: URL
    private var session: URLSession!

    private override init() {
        root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("RenderJobs", isDirectory: true)
        super.init()
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let index = root.appendingPathComponent("jobs.json")
        if FileManager.default.fileExists(atPath: index.path) {
            do { jobs = try JSONDecoder().decode([StudioRenderJob].self, from: Data(contentsOf: index)) }
            catch { storageFailure = "Saved render history could not be read. Existing files have been preserved." }
        }
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.sessionID)
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        configuration.timeoutIntervalForRequest = 1800
        configuration.timeoutIntervalForResource = 3600
        configuration.httpMaximumConnectionsPerHost = 2
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
        let recovering = Set(jobs.filter(\.active).map(\.id))
        session.getAllTasks { [weak self] tasks in
            DispatchQueue.main.async {
                guard let self else { return }
                let present = Set(tasks.compactMap(\.taskDescription))
                for job in self.jobs where job.active && recovering.contains(job.id) && !present.contains(job.id) {
                    self.update(job.id, status: "interrupted", message: "The transfer was interrupted. Retry when connected.")
                }
            }
        }
    }
    private func file(_ id: String, _ ext: String) -> URL { root.appendingPathComponent(id + "." + ext) }
    @discardableResult private func persist() -> Bool {
        guard storageFailure == nil else { return false }
        do {
            try JSONEncoder().encode(jobs).write(to: root.appendingPathComponent("jobs.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return true
        } catch { storageFailure = "Render history could not be saved. Check available iPad storage before starting another render."; return false }
    }
    private func update(_ id: String, status: String? = nil, message: String? = nil, progress: Double? = nil) {
        guard let index = jobs.firstIndex(where: { $0.id == id }) else { return }
        if let status { jobs[index].status = status }
        if let message { jobs[index].message = message }
        if let progress { jobs[index].progress = progress }
        persist()
    }
    func submit(id: String, owner: String, name: String, contract: [String: Any], ink: Data, endpoint: URL) throws {
        guard storageFailure == nil, UUID(uuidString: id) != nil, !jobs.contains(where: { $0.id == id }), ink.count <= 30 * 1024 * 1024,
              jobs.filter({ $0.active }).count < 2,
              ink.starts(with: [137,80,78,71,13,10,26,10]) else {
            throw NSError(domain: "Render", code: 1, userInfo: [NSLocalizedDescriptionKey: "Finish the current renders before starting another."])
        }
        let boundary = "SmartInk-" + id
        let json = try JSONSerialization.data(withJSONObject: contract)
        guard json.count < 4 * 1024 * 1024 else { throw CocoaError(.fileWriteOutOfSpace) }
        var body = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"contract\"; filename=\"contract.json\"\r\nContent-Type: application/json\r\n\r\n".utf8)
        body.append(json)
        body.append(Data("\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"ink_layer\"; filename=\"ink.png\"\r\nContent-Type: image/png\r\n\r\n".utf8))
        body.append(ink); body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        try body.write(to: file(id, "upload"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        jobs.insert(StudioRenderJob(id: id, owner: owner, name: name, created: Date(), endpoint: endpoint.absoluteString,
                                   status: "uploading", message: "Uploading shot", progress: 0), at: 0)
        guard persist() else {
            jobs.removeAll { $0.id == id }
            throw NSError(domain: "Render", code: 3, userInfo: [NSLocalizedDescriptionKey: storageFailure ?? "Could not save the render job."])
        }
        start(id)
    }
    private func start(_ id: String) {
        guard let job = jobs.first(where: { $0.id == id }), let endpoint = URL(string: job.endpoint) else { return }
        try? FileManager.default.removeItem(at: file(id, "response"))
        var request = URLRequest(url: endpoint.appendingPathComponent("render-v2"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=SmartInk-" + id, forHTTPHeaderField: "Content-Type")
        request.setValue("image/png", forHTTPHeaderField: "Accept")
        let task = session.uploadTask(with: request, fromFile: file(id, "upload"))
        task.taskDescription = id
        update(id, status: "uploading", message: "Uploading shot", progress: 0)
        task.resume()
    }
    func retry(_ id: String, owner: String) {
        guard let job = jobs.first(where: { $0.id == id && $0.owner == owner }), !job.active, !job.complete,
              jobs.filter({ $0.active }).count < 2 else { return }
        start(id)
    }
    func cancel(_ id: String, owner: String) {
        guard jobs.contains(where: { $0.id == id && $0.owner == owner && $0.active }) else { return }
        update(id, status: "cancelled", message: "Stopped waiting. The renderer may still finish this shot.")
        session.getAllTasks { tasks in tasks.filter { $0.taskDescription == id }.forEach { $0.cancel() } }
    }
    func image(_ id: String, owner: String) -> UIImage? {
        guard jobs.contains(where: { $0.id == id && $0.owner == owner && $0.complete }) else { return nil }
        return UIImage(contentsOfFile: file(id, "png").path)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard let id = task.taskDescription else { return }
        let progress = totalBytesExpectedToSend > 0 ? Double(totalBytesSent) / Double(totalBytesExpectedToSend) : 0
        update(id, status: progress >= 1 ? "rendering" : "uploading", message: progress >= 1 ? "Blender is rendering your photograph" : "Uploading shot", progress: progress)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        completionHandler(.allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didBecome downloadTask: URLSessionDownloadTask) { downloadTask.taskDescription = dataTask.taskDescription }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {}
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let id = dataTask.taskDescription else { return }
        do {
            let target = file(id, "response")
            if !FileManager.default.fileExists(atPath: target.path) {
                try Data().write(to: target, options: .completeFileProtectionUntilFirstUserAuthentication)
            }
            let handle = try FileHandle(forWritingTo: target)
            defer { try? handle.close() }
            let size = try handle.seekToEnd()
            guard size + UInt64(data.count) <= 40 * 1024 * 1024 else { throw CocoaError(.fileReadTooLarge) }
            try handle.write(contentsOf: data)
        } catch { dataTask.cancel(); update(id, status: "failed", message: error.localizedDescription) }
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let id = downloadTask.taskDescription else { return }
        finish(id, response: downloadTask.response, location: location)
    }
    private func finish(_ id: String, response: URLResponse?, location: URL) {
        do {
            let values = try location.resourceValues(forKeys: [.fileSizeKey])
            guard (values.fileSize ?? Int.max) <= 40 * 1024 * 1024 else { throw CocoaError(.fileReadTooLarge) }
            let bytes = try Data(contentsOf: location)
            guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode),
                  bytes.starts(with: [137,80,78,71,13,10,26,10]), UIImage(data: bytes) != nil else {
                let detail = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any]
                throw NSError(domain: "Render", code: 2, userInfo: [NSLocalizedDescriptionKey: detail?["detail"] as? String ?? "The renderer did not return a photograph. Check the connection and retry."])
            }
            try bytes.write(to: file(id, "png"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            update(id, status: "complete", message: "Photo saved on this iPad", progress: 1)
            completion?(id, bytes.base64EncodedString(), nil)
            try? FileManager.default.removeItem(at: file(id, "upload"))
            try? FileManager.default.removeItem(at: file(id, "response"))
        } catch {
            update(id, status: "failed", message: error.localizedDescription)
            completion?(id, nil, error.localizedDescription)
        }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let id = task.taskDescription, let job = jobs.first(where: { $0.id == id }), !job.complete else { return }
        if let error {
            let message = job.status == "cancelled" ? job.message : error.localizedDescription
            update(id, status: job.status == "cancelled" ? "cancelled" : "failed", message: message)
            completion?(id, nil, message)
        } else { finish(id, response: task.response, location: file(id, "response")) }
    }
    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        let reply = backgroundCompletion; backgroundCompletion = nil; reply?()
    }
}

final class StudioAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        guard identifier == RenderJobs.sessionID else { completionHandler(); return }
        RenderJobs.shared.backgroundCompletion = completionHandler
    }
}

import SwiftUI
import WebKit
import UniformTypeIdentifiers

@MainActor
final class StudioModel: NSObject, ObservableObject, WKNavigationDelegate, WKScriptMessageHandler, WKUIDelegate, UIPencilInteractionDelegate {
    @Published var workspace: NativeWorkspace?
    @Published var projects: [NativeProject] = []
    @Published var renders: [NativeRender] = []
    @Published var working = false
    @Published var inspector = true
    private let bundledServer = BundledStudioServer()
    private var commandTail: Task<Void, Never>?
    @Published var connected = false
    @Published var loading = false
    @Published var editing = false
    @Published var importing = false
    @Published var capturing = false
    @Published var notice: String?
    @Published var error: String?
    @Published var shareImage: UIImage?
    @Published var confirmationText: String?
    private var confirmationReply: ((Bool) -> Void)?
    private(set) var webView: WKWebView!
    private var origin: URL?
    private var navigationID = UUID()

    override init() {
        super.init()
        RenderJobs.shared.completion = { [weak self] id, base64, failure in
            Task { @MainActor in
                guard let self, self.workspace != nil, StudioAddress.sameOrigin(self.webView.url, self.origin),
                      RenderJobs.shared.jobs.contains(where: { $0.id == id && $0.owner == self.workspace?.email }) else { return }
                var result: [String: String] = [:]
                if let base64 { result["base64"] = base64 }
                if let failure { result["error"] = failure }
                _ = try? await self.webView.callAsyncJavaScript("window.smartInkRenderReply?.(id, result);", arguments: ["id": id, "result": result], in: nil, contentWorld: .page)
            }
        }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        configuration.userContentController.add(WeakStudioHandler(self), name: "studioState")
        configuration.userContentController.addUserScript(WKUserScript(
            source: "Object.defineProperty(window, 'smartInkNativeHost', { value: true });",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        let pencil = UIPencilInteraction()
        pencil.delegate = self
        webView.addInteraction(pencil)
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.bounces = false
        webView.allowsBackForwardNavigationGestures = false
        #if DEBUG
        webView.isInspectable = true
        #endif
    }

    private func pencilAction(_ action: UIPencilPreferredAction) {
        guard let state = workspace, state.page == "editor", !state.blocked else { return }
        switch action {
        case .showColorPalette, .showInkAttributes: inspector.toggle()
        case .switchPrevious: send("tab", value: state.tab == "figure" ? "tattoo" : "figure")
        default:
            if #available(iOS 17.5, *), action == .showContextualPalette { inspector.toggle() }
        }
    }
    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) { pencilAction(UIPencilInteraction.preferredTapAction) }
    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) { pencilAction(UIPencilInteraction.preferredTapAction) }
    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
        if squeeze.phase == .ended { pencilAction(UIPencilInteraction.preferredSqueezeAction) }
    }

    func startBundled() async {
        do {
            try await bundledServer.start()
            origin = BundledStudioServer.address
            connected = true
            loading = true
            webView.load(URLRequest(url: BundledStudioServer.address))
        } catch { self.error = error.localizedDescription }
    }

    func command(_ action: String, value: Any? = nil, key: String? = nil, id: String? = nil) async throws -> Any? {
        guard workspace != nil, StudioAddress.sameOrigin(webView.url, origin) else { throw StudioFailure.projectChanged }
        let visit = navigationID
        let owner = workspace?.email
        var input: [String: Any] = ["action": action]
        if let value { input["value"] = value }
        if let key { input["key"] = key }
        if let id { input["id"] = id }
        let result = try await webView.callAsyncJavaScript("return await window.smartInkStudio.command(input);", arguments: ["input": input], in: nil, contentWorld: .page)
        guard visit == navigationID, action == "signOut" || owner == workspace?.email else { throw StudioFailure.projectChanged }
        return result
    }
    /// Preserve slider begin/change/end ordering across the asynchronous WebKit boundary.
    func send(_ action: String, value: Any? = nil, key: String? = nil, id: String? = nil) {
        let prior = commandTail
        commandTail = Task { [weak self] in
            await prior?.value
            guard let self else { return }
            do { _ = try await command(action, value: value, key: key, id: id) }
            catch { self.error = error.localizedDescription }
        }
    }
    var presenting: Bool { workspace?.page == "editor" && workspace?.present != nil }
    func present(_ motion: String) { send("present", value: motion, key: "motion") }
    func stopPresenting() { send("present", key: "stop") }
    func refreshProjects() async {
        do {
            let result = try await command("projects") ?? []
            projects = try JSONDecoder().decode([NativeProject].self, from: JSONSerialization.data(withJSONObject: result))
        } catch { self.error = error.localizedDescription }
    }
    func projectAction(_ action: String, id: String? = nil, name: String? = nil) async {
        guard !working else { return }
        working = true
        defer { working = false }
        do {
            await commandTail?.value
            _ = try await command(action, value: name, id: id)
            if action == "publishCopy" { notice = "A separate copy is now saved to your account. Your iPad project remains available offline." }
            if ["rename", "delete", "gallery"].contains(action) { await refreshProjects() }
        } catch { self.error = error.localizedDescription }
    }
    func refreshRenders() async {
        do {
            let result = try await command("renders") ?? []
            renders = try JSONDecoder().decode([NativeRender].self, from: JSONSerialization.data(withJSONObject: result))
        } catch { self.error = error.localizedDescription }
    }
    func shareRender(_ id: String? = nil) async {
        guard !capturing else { return }
        capturing = true
        defer { capturing = false }
        do {
            let result = try await command(id == nil ? "shareShot" : "renderImage", id: id)
            guard let encoded = result as? String, let data = Data(base64Encoded: encoded), let image = UIImage(data: data) else { throw StudioFailure.invalidPNG }
            shareImage = image
        } catch { self.error = error.localizedDescription }
    }
    func importImageData(_ data: Data) async {
        guard data.count <= 20 * 1024 * 1024, let image = UIImage(data: data),
              image.size.width * image.size.height <= 40_000_000, let png = image.pngData(), png.count <= 20 * 1024 * 1024 else {
            error = "Choose an image up to 20 MB and 40 megapixels."; return
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".png")
        do { try png.write(to: url); await importArtwork(url); try? FileManager.default.removeItem(at: url) }
        catch { self.error = error.localizedDescription }
    }

    func connect(_ address: String) {
        error = nil
        #if DEBUG
        let allowHTTP = true
        #else
        let allowHTTP = false
        #endif
        guard let url = StudioAddress.parse(address, allowLocalHTTP: allowHTTP) else {
            error = "Enter an HTTPS studio address, or a local HTTP address in a development build. Leave out paths and query parameters."
            return
        }
        origin = url
        editing = false
        connected = true
        loading = true
        webView.load(URLRequest(url: url))
        UserDefaults.standard.set(url.absoluteString, forKey: "studioAddress")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              StudioAddress.sameOrigin(message.frameInfo.request.url, origin),
              let body = message.body as? [String: Any], body["version"] as? Int == 1 else { return }
        if let request = body["renderRequest"] as? [String: Any], let state = workspace, state.page == "editor",
           let id = request["id"] as? String, let contract = request["contract"] as? [String: Any],
           let base64 = request["base64"] as? String, base64.count <= 42 * 1024 * 1024,
           let ink = Data(base64Encoded: base64) {
            #if DEBUG
            let endpoint = URL(string: "http://127.0.0.1:4321")!
            #else
            let endpoint = URL(string: "https://smart-ink-render-615593848551.europe-west4.run.app")!
            #endif
            do { try RenderJobs.shared.submit(id: id, owner: state.email, name: state.name, contract: contract, ink: ink, endpoint: endpoint) }
            catch {
                Task { _ = try? await webView.callAsyncJavaScript("window.smartInkRenderReply?.(id, { error: message });", arguments: ["id": id, "message": error.localizedDescription], in: nil, contentWorld: .page) }
            }
        }
        if let editing = body["editing"] as? Bool { self.editing = editing }
        if let raw = body["workspace"] {
            let previous = workspace
            if raw is NSNull { workspace = nil; projects = []; renders = []; return }
            do {
                workspace = try JSONDecoder().decode(NativeWorkspace.self, from: JSONSerialization.data(withJSONObject: raw))
                if workspace?.page == "projects" && previous?.page != "projects" { Task { await refreshProjects() } }
                if workspace?.region != previous?.region || workspace?.tab != previous?.tab {
                    inspector = true
                    if previous?.page == "editor" { UISelectionFeedbackGenerator().selectionChanged() }
                }
            } catch { self.error = "Could not read studio state. Please reopen the app." }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard action.targetFrame?.isMainFrame != false else { decisionHandler(.allow); return }
        if StudioAddress.sameOrigin(action.request.url, origin) && action.targetFrame != nil {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            error = "This prototype keeps you inside your studio. Use email/password to sign in; external sign-in and new-window links are not connected yet."
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        resolveConfirmation(false)
        navigationID = UUID()
        editing = false
        workspace = nil
        loading = true
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loading = false }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    private func failed(_ failure: Error) {
        loading = false
        if (failure as NSError).code != NSURLErrorCancelled {
            error = "Could not open the studio. Check the server address and Wi-Fi connection. \(failure.localizedDescription)"
        }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        editing = false
        loading = false
        error = "The viewport was closed by iPadOS. Reconnect to restore your last saved project."
    }

    func importArtwork(_ url: URL) async {
        guard editing, !importing, StudioAddress.sameOrigin(webView.url, origin) else { return }
        importing = true
        defer { importing = false }
        let currentNavigation = navigationID
        let project = workspace?.projectId
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            guard url.pathExtension.lowercased() == "png" else { throw StudioFailure.invalidPNG }
            let data = try await Task.detached(priority: .userInitiated) {
                let handle = try FileHandle(forReadingFrom: url)
                defer { try? handle.close() }
                let limit = 20 * 1024 * 1024
                let bytes = try handle.read(upToCount: limit + 1) ?? Data()
                guard !bytes.isEmpty, bytes.count <= limit,
                      bytes.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]) else { throw StudioFailure.invalidPNG }
                return bytes
            }.value
            guard currentNavigation == navigationID, editing, project == workspace?.projectId else { throw StudioFailure.projectChanged }
            // Structured arguments, never interpolate file names or contents into JavaScript.
            _ = try await webView.callAsyncJavaScript("""
                if (!window.smartInkNativeArtwork) throw new Error('Open an editable project first.');
                await window.smartInkNativeArtwork.importArtwork({ name, base64 });
                return true;
                """, arguments: ["name": url.lastPathComponent, "base64": data.base64EncodedString()],
                in: nil, contentWorld: .page)
        } catch { self.error = "Artwork was not applied. \(error.localizedDescription)" }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard frame.isMainFrame, StudioAddress.sameOrigin(frame.request.url, origin) else {
            completionHandler(false); return
        }
        resolveConfirmation(false)
        confirmationReply = completionHandler
        confirmationText = message
    }

    func resolveConfirmation(_ accepted: Bool) {
        let reply = confirmationReply
        confirmationReply = nil
        confirmationText = nil
        reply?(accepted)
    }

    func shareScreen() {
        guard connected, !loading, !capturing else { return }
        capturing = true
        let configuration = WKSnapshotConfiguration()
        configuration.snapshotWidth = NSNumber(value: min(webView.bounds.width, 1600))
        webView.takeSnapshot(with: configuration) { [weak self] image, failure in
            guard let self else { return }
            self.capturing = false
            if let image { self.shareImage = image }
            else { self.error = failure?.localizedDescription ?? "Could not capture the studio preview." }
        }
    }
}

private enum StudioFailure: LocalizedError {
    case invalidPNG, projectChanged
    var errorDescription: String? {
        switch self {
        case .invalidPNG: return "Choose a PNG artwork file up to 20 MB."
        case .projectChanged: return "The project changed during import. Open the intended project and try again."
        }
    }
}

/// WKUserContentController retains handlers; keep its reference to the model weak.
@MainActor
private final class WeakStudioHandler: NSObject, WKScriptMessageHandler {
    weak var target: StudioModel?
    init(_ target: StudioModel) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

import SwiftUI
import WebKit

/// The studio has one web view. Presenting moves it to a connected TV or projector
/// instead of mirroring the iPad or opening a second WebGL context.
@MainActor
final class PresentationScreen: ObservableObject {
    static let shared = PresentationScreen()
    @Published fileprivate(set) var connected = false
    /// The artist can keep presenting on the iPad while a display stays plugged in.
    @Published var preferExternal = true
    @Published var model: StudioModel?

    func external(for model: StudioModel) -> Bool { connected && preferExternal && model.presenting }
}

@MainActor
final class ExternalDisplaySceneDelegate: NSObject, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = UIHostingController(rootView: ExternalStage(screen: .shared))
        window.isHidden = false
        self.window = window
        PresentationScreen.shared.connected = true
    }
    /// Hand the web view back to the iPad before this window goes away.
    func sceneDidDisconnect(_ scene: UIScene) {
        PresentationScreen.shared.connected = false
        window = nil
    }
}

extension StudioAppDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
        if session.role == .windowExternalDisplayNonInteractive { configuration.delegateClass = ExternalDisplaySceneDelegate.self }
        return configuration
    }
}

/// Hosts the shared web view while `active`; an inactive host never takes it from another window.
struct StudioWebHost: UIViewRepresentable {
    let webView: WKWebView
    let active: Bool
    var touched: () -> Void = {}
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> UIView {
        let host = UIView()
        host.backgroundColor = .black
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tapped))
        tap.cancelsTouchesInView = false
        tap.delegate = context.coordinator
        host.addGestureRecognizer(tap)
        return host
    }
    func updateUIView(_ host: UIView, context: Context) {
        context.coordinator.touched = touched
        guard active, webView.superview !== host else { return }
        webView.removeFromSuperview()
        webView.frame = host.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.addSubview(webView)
    }
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var touched: () -> Void = {}
        @objc func tapped() { touched() }
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    }
}

/// What the audience sees: the figure while presenting, otherwise a quiet title card.
struct ExternalStage: View {
    @ObservedObject var screen: PresentationScreen
    var body: some View {
        if let model = screen.model { ExternalStageContent(model: model, screen: screen) }
        else { TitleCard() }
    }
}

private struct ExternalStageContent: View {
    @ObservedObject var model: StudioModel
    @ObservedObject var screen: PresentationScreen
    var body: some View {
        if screen.external(for: model) { StudioWebHost(webView: model.webView, active: true).ignoresSafeArea() }
        else { TitleCard() }
    }
}

private struct TitleCard: View {
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Text("Smart Ink").font(.system(size: 64, weight: .ultraLight)).tracking(8).foregroundStyle(.white.opacity(0.5))
        }
    }
}

struct PresentMotionPicker: View {
    @ObservedObject var model: StudioModel
    var body: some View {
        Picker("Motion", selection: Binding(get: { model.workspace?.present?.motion ?? "showcase" }, set: { model.present($0) })) {
            Label("Showcase", systemImage: "sparkles").tag("showcase")
            Label("Turntable", systemImage: "arrow.trianglehead.2.clockwise.rotate.90").tag("turntable")
            Label("Still", systemImage: "pause").tag("still")
        }.pickerStyle(.segmented)
    }
}

private struct ProjectMenu: View {
    @ObservedObject var model: StudioModel
    var body: some View {
        Menu {
            ForEach(model.projects) { project in
                if project.id == model.workspace?.projectId { Label(project.name, systemImage: "checkmark") }
                else { Button(project.name) { model.send("present", key: "project", id: project.id) } }
            }
        } label: { Label("Design", systemImage: "square.stack") }
            .disabled(model.projects.count < 2 || model.workspace?.loading == true)
    }
}

/// Presenting on the iPad itself: one compact bar that fades after a few seconds. Tap to bring it back.
struct PresentControls: View {
    @ObservedObject var model: StudioModel
    @ObservedObject var screen: PresentationScreen
    let shown: Bool
    var body: some View {
        HStack(spacing: 16) {
            PresentMotionPicker(model: model).frame(width: 340)
            ProjectMenu(model: model)
            if screen.connected { Button("Show on display", systemImage: "tv") { screen.preferExternal = true } }
            Button("Done", systemImage: "xmark") { model.stopPresenting() }.keyboardShortcut(.cancelAction)
        }
        .labelStyle(.iconOnly).padding(.horizontal, 18).padding(.vertical, 12)
        .background(.regularMaterial, in: Capsule())
        .padding(.bottom, 28)
        .opacity(shown ? 1 : 0).animation(.easeInOut(duration: 0.4), value: shown)
        .allowsHitTesting(shown)
    }
}

/// Presenting on a TV or projector: the iPad becomes the artist's remote.
struct PresentRemote: View {
    @ObservedObject var model: StudioModel
    @ObservedObject var screen: PresentationScreen
    private let columns = [GridItem(.adaptive(minimum: 180, maximum: 260), spacing: 16)]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Presenting on the external display", systemImage: "tv").font(.title2.bold())
                        Text(model.workspace?.name ?? "").foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Show on iPad", systemImage: "ipad.landscape") { screen.preferExternal = false }
                    Button("Done", systemImage: "xmark") { model.stopPresenting() }.buttonStyle(.borderedProminent).keyboardShortcut(.cancelAction)
                }
                PresentMotionPicker(model: model).controlSize(.large)
                Text(model.workspace?.present?.canShowcase == false && model.workspace?.present?.motion == "showcase"
                     ? "Place a visible tattoo to circle it. Until then Showcase turns the whole figure."
                     : "Touching the display pauses the motion; it resumes after a few quiet seconds.")
                    .font(.footnote).foregroundStyle(.secondary)
                Text("Designs").font(.headline)
                LazyVGrid(columns: columns, alignment: .leading, spacing: 16) {
                    ForEach(model.projects) { project in
                        Button { model.send("present", key: "project", id: project.id) } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                ProjectThumbnail(source: project.thumbnail).frame(height: 150).clipShape(RoundedRectangle(cornerRadius: 14))
                                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(.tint, lineWidth: project.id == model.workspace?.projectId ? 3 : 0))
                                Text(project.name).font(.subheadline).lineLimit(1)
                            }
                        }.buttonStyle(.plain).disabled(model.workspace?.loading == true)
                    }
                }
            }.padding(32)
        }.background(Color(white: 0.08).ignoresSafeArea())
    }
}

struct ProjectThumbnail: View {
    let source: String?
    var body: some View {
        ZStack {
            Color(white: 0.17)
            if let source, let data = Data(base64Encoded: source.components(separatedBy: ",").last ?? ""), let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFit()
            } else { Image(systemName: "figure.stand").font(.system(size: 48, weight: .ultraLight)).foregroundStyle(.secondary) }
        }
    }
}

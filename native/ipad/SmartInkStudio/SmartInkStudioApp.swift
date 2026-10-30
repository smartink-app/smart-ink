import SwiftUI
import WebKit
import PhotosUI
import LinkPresentation
import UniformTypeIdentifiers

@main
struct SmartInkStudioApp: App {
    @UIApplicationDelegateAdaptor(StudioAppDelegate.self) private var appDelegate
    var body: some Scene { WindowGroup { StudioView() } }
}

struct StudioView: View {
    @StateObject private var model = StudioModel()
    @Environment(\.scenePhase) private var phase
    @State private var showImporter = false
    @State private var photo: PhotosPickerItem?
    @State private var showRenders = false
    @State private var showHelp = false
    @State private var showConnection = false
    @State private var address = "http://127.0.0.1:4322"
    @State private var dropping = false
    @ObservedObject private var screen = PresentationScreen.shared
    @State private var controlsShown = true
    @State private var hideControls: Task<Void, Never>?

    private var editor: Bool { model.workspace?.page == "editor" }
    private var external: Bool { screen.external(for: model) }
    private func revealControls() {
        controlsShown = true
        hideControls?.cancel()
        hideControls = Task { try? await Task.sleep(for: .seconds(4)); if !Task.isCancelled { controlsShown = false } }
    }
    var body: some View {
        NavigationStack {
            ZStack {
                if external { PresentRemote(model: model, screen: screen) }
                else { StudioWebHost(webView: model.webView, active: true, touched: { if model.presenting { revealControls() } }).ignoresSafeArea(edges: model.presenting ? .all : []) }
                if model.presenting && !external {
                    PresentControls(model: model, screen: screen, shown: controlsShown).frame(maxHeight: .infinity, alignment: .bottom)
                }
                if model.workspace?.page == "projects" { ProjectGallery(model: model) }
                if !model.connected || model.loading {
                    ProgressView("Opening your studio…").padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
                }
                if dropping { RoundedRectangle(cornerRadius: 20).stroke(.tint, lineWidth: 4).padding(12).allowsHitTesting(false) }
            }
            .onDrop(of: [.image], isTargeted: $dropping) { providers in
                guard model.editing, let provider = providers.first else { return false }
                let project = model.workspace?.projectId
                if provider.canLoadObject(ofClass: UIImage.self) {
                    _ = provider.loadObject(ofClass: UIImage.self) { object, _ in
                        guard let image = object as? UIImage, let data = image.pngData() else { return }
                        Task { @MainActor in
                            guard project == model.workspace?.projectId else { return }
                            await model.importImageData(data)
                        }
                    }
                    return true
                }
                return false
            }
            .navigationTitle(editor ? model.workspace?.name ?? "Studio" : "Smart Ink Studio")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(model.presenting ? .hidden : .visible, for: .navigationBar)
            .statusBarHidden(model.presenting)
            .persistentSystemOverlays(model.presenting ? .hidden : .automatic)
            .toolbar {
                ToolbarItemGroup(placement: .topBarLeading) {
                    if editor {
                        Button { Task { await model.projectAction("gallery") } } label: { Label("Projects", systemImage: "square.grid.2x2") }
                            .disabled(model.workspace?.shot.open == true || model.workspace?.measuring == true || model.working)
                        Button { model.send("undo") } label: { Label("Undo", systemImage: "arrow.uturn.backward") }
                            .keyboardShortcut("z", modifiers: .command).disabled(model.workspace?.canUndo != true || model.workspace?.blocked == true)
                        Button { model.send("redo") } label: { Label("Redo", systemImage: "arrow.uturn.forward") }
                            .keyboardShortcut("z", modifiers: [.command, .shift]).disabled(model.workspace?.canRedo != true || model.workspace?.blocked == true)
                    }
                }
                ToolbarItem(placement: .principal) {
                    if editor, let state = model.workspace {
                        Picker("Studio tool", selection: Binding(get: { state.tab }, set: { tab in
                            if state.shot.open { model.send("closeShot") }
                            model.send("tab", value: tab)
                        })) {
                            Text("Artwork").tag("tattoo")
                            Text("Body").tag("figure")
                            Text("Shoot").tag("shoot")
                        }.pickerStyle(.segmented).frame(maxWidth: 320)
                            .disabled(state.loading || state.measuring || state.shot.busy)
                    }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if model.importing || model.working { ProgressView() }
                    if editor {
                        if let state = model.workspace {
                            Image(systemName: state.save == "error" ? "exclamationmark.icloud" : state.save == "saving" ? "arrow.triangle.2.circlepath" : "checkmark.icloud")
                                .foregroundStyle(state.save == "error" ? .red : .secondary)
                                .accessibilityLabel(state.save == "error" ? "Saving failed" : "Project \(state.save)")
                        }
                        Button { model.present("showcase") } label: { Label("Present", systemImage: "play.rectangle") }
                            .disabled(model.workspace?.shot.open == true || model.workspace?.measuring == true || model.workspace?.blocked == true || model.workspace?.loading == true)
                        Button { model.inspector.toggle() } label: { Label("Inspector", systemImage: "sidebar.right") }
                            .keyboardShortcut("i", modifiers: .command)
                    }
                    Menu {
                        if model.workspace != nil {
                            if model.workspace?.cloud == true && editor {
                                Button("Save a copy to account", systemImage: "icloud.and.arrow.up") { Task { await model.projectAction("publishCopy") } }.disabled(model.working)
                            }
                            Button("Saved renders", systemImage: "photo.stack") { showRenders = true }
                            Button("Save project", systemImage: "square.and.arrow.down") { model.send("save") }.keyboardShortcut("s", modifiers: .command)
                            Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right") { model.send("signOut") }
                        }
                        Button("Touch & Pencil", systemImage: "hand.draw") { showHelp = true }
                        #if DEBUG
                        Button("Developer preview", systemImage: "network") { showConnection = true }
                        #endif
                    } label: { Label("Studio menu", systemImage: "ellipsis.circle") }
                }
            }
            .inspector(isPresented: Binding(get: { editor && model.inspector && model.workspace?.measuring != true && !model.presenting }, set: { model.inspector = $0 })) {
                if let state = model.workspace {
                    StudioInspector(model: model, state: state, showImporter: $showImporter, photo: $photo)
                        .inspectorColumnWidth(min: 280, ideal: 310, max: 360)
                }
            }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.png]) { result in
                switch result {
                case .success(let url): Task { await model.importArtwork(url) }
                case .failure(let error): model.error = error.localizedDescription
                }
            }
            .onChange(of: photo) { _, selected in
                guard let selected else { return }
                let project = model.workspace?.projectId
                Task {
                    do { if let data = try await selected.loadTransferable(type: Data.self), project == model.workspace?.projectId { await model.importImageData(data) } }
                    catch { model.error = error.localizedDescription }
                    photo = nil
                }
            }
            .sheet(isPresented: $showRenders) { RenderLibrary(model: model) }
            .sheet(isPresented: Binding(get: { model.shareImage != nil }, set: { if !$0 { model.shareImage = nil } })) {
                if let image = model.shareImage { ShareSheet(image: image) }
            }
            .sheet(isPresented: $showHelp) {
                NavigationStack {
                    List {
                        Label("Drag one finger to orbit. Pinch to zoom and pan.", systemImage: "hand.draw")
                        Label("Tap skin to place artwork. Drag ink with Pencil for precision.", systemImage: "pencil.tip")
                        Label("Turn on Move ink with finger for editing without Pencil. Two fingers still navigate.", systemImage: "hand.tap")
                        Label("Choose Body and tap a body part for its adjustments.", systemImage: "figure.stand")
                        Label("Drag artwork from Files or Photos onto the canvas.", systemImage: "square.and.arrow.down")
                        Label("⌘Z undo · ⇧⌘Z redo · ⌘S save · ⌘I inspector", systemImage: "keyboard")
                        Label("Local projects work offline. Signing in, syncing and Blender rendering need a connection.", systemImage: "wifi")
                    }.navigationTitle("Touch & Pencil").toolbar { Button("Done") { showHelp = false } }
                }.presentationDetents([.medium, .large])
            }
            .sheet(isPresented: $showConnection) {
                NavigationStack {
                    Form {
                        Text("Developer tools only. The installed app normally opens its bundled studio. Projects on a preview server use separate storage.").font(.footnote)
                        TextField("Preview address", text: $address).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("Open preview") { model.connect(address); showConnection = false }
                        Button("Use installed studio") { Task { await model.startBundled() }; showConnection = false }
                    }.navigationTitle("Developer preview").toolbar { Button("Close") { showConnection = false } }
                }.presentationDetents([.medium])
            }
            .confirmationDialog(model.confirmationText ?? "Confirm", isPresented: Binding(get: { model.confirmationText != nil }, set: { if !$0 { model.resolveConfirmation(false) } }), titleVisibility: .visible) {
                Button("Continue", role: .destructive) { model.resolveConfirmation(true) }
                Button("Cancel", role: .cancel) { model.resolveConfirmation(false) }
            }
            .alert("Saved to account", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) {
                Button("Done") { model.notice = nil }
            } message: { Text(model.notice ?? "") }
            .alert("Studio", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
                Button("OK") { model.error = nil }
            } message: { Text(model.error ?? "") }
        }
        .tint(Color(red: 0.66, green: 0.74, blue: 0.97))
        .preferredColorScheme(.dark)
        .task { screen.model = model; await model.startBundled() }
        .onChange(of: model.presenting) { _, presenting in
            // A show runs unattended; keep the screen awake only while presenting.
            UIApplication.shared.isIdleTimerDisabled = presenting
            if presenting { revealControls(); Task { await model.refreshProjects() } }
        }
        .onChange(of: phase) { _, phase in
            if phase != .active, model.workspace != nil { model.send("save") }
        }
    }
}

private struct StudioInspector: View {
    @ObservedObject var model: StudioModel
    let state: NativeWorkspace
    @Binding var showImporter: Bool
    @Binding var photo: PhotosPickerItem?
    var body: some View {
        Form {
            if state.tab == "shoot" {
                Section("Studio shoot") {
                    Text("Lighting and framing built around your tattoo.").font(.footnote).foregroundStyle(.secondary)
                    Picker("Look", selection: Binding(get: { state.shot.look ?? "editorial" }, set: { model.send("shot", value: $0, key: "look") })) {
                        Text("Editorial softbox").tag("editorial"); Text("Sculpted light").tag("sculpted"); Text("Skin detail").tag("detail")
                    }
                    Picker("Format", selection: Binding(get: { state.shot.format }, set: { model.send("shot", value: $0, key: "format") })) {
                        Text("Viewport").tag("view"); Text("Portrait").tag("portrait"); Text("Square").tag("square"); Text("Landscape").tag("landscape")
                    }
                    NativeSlider(title: "Depth of field", value: state.shot.blur, range: 0...1) { model.send("shot", value: $0, key: "blur") }
                    NativeSlider(title: "Zoom", value: state.shot.camera["zoom"] ?? 1, range: 0.65...1.8) { model.send("shot", value: $0, key: "zoom") }
                    NativeSlider(title: "Camera angle", value: state.shot.camera["azimuth"] ?? 0, range: -55...55) { model.send("shot", value: $0, key: "azimuth") }
                    NativeSlider(title: "Camera height", value: state.shot.camera["elevation"] ?? 0, range: -40...40) { model.send("shot", value: $0, key: "elevation") }
                    Picker("Quality", selection: Binding(get: { state.shot.quality }, set: { model.send("shot", value: $0, key: "quality") })) {
                        Text("Quick preview").tag("quick"); Text("Portfolio · 2560 px").tag("detailed")
                    }
                }.disabled(state.shot.busy)
                Section {
                    if state.shot.busy { ProgressView(); Text("\(state.shot.message) · \(state.shot.elapsed)s").font(.footnote) }
                    else { Button("Render photograph", systemImage: "camera.aperture") { model.send("shot", key: "render") }.buttonStyle(.borderedProminent) }
                    if !state.shot.message.isEmpty && !state.shot.busy { Text(state.shot.message).font(.footnote).foregroundStyle(state.shot.status == "error" ? .red : .secondary) }
                    if !state.shot.warning.isEmpty { Text(state.shot.warning).font(.footnote).foregroundStyle(.orange) }
                    if state.shot.hasImage {
                        Button("Share finished photo", systemImage: "square.and.arrow.up") { Task { await model.shareRender() } }.disabled(model.capturing)
                        Button("Adjust shot", systemImage: "slider.horizontal.3") { model.send("shot", key: "adjust") }.disabled(state.shot.busy)
                    }
                    if state.shot.busy { Button("Stop waiting", role: .destructive) { model.send("shot", key: "cancel") } }
                    Button(state.shot.busy ? "Keep rendering & return to editing" : "Back to editing") { model.send("closeShot") }
                }
                Section("Motion preview") {
                    Button("Preview reveal", systemImage: "play") { model.send("shot", value: "reveal", key: "reveal") }
                    Button("Preview orbit", systemImage: "arrow.trianglehead.2.clockwise.rotate.90") { model.send("shot", value: "orbit", key: "reveal") }
                }.disabled(state.shot.busy)
            } else if state.tab == "figure" {
                Section("Your model") {
                    Picker("Figure", selection: Binding(get: { state.bodyMeshId }, set: { model.send("body", value: $0) })) {
                        Text("Male").tag("body_full"); Text("Female").tag("body_full_female")
                    }
                    Picker("Skin", selection: Binding(get: { state.skinToneId }, set: { model.send("skin", value: $0) })) {
                        Text("Fair").tag("tone_01"); Text("Medium").tag("tone_03"); Text("Tan").tag("tone_05"); Text("Deep").tag("tone_07")
                    }
                    Picker("Pose", selection: Binding(get: { state.poseId }, set: { model.send("pose", value: $0) })) {
                        Text("Neutral").tag("neutral"); Text("Relaxed").tag("relaxed"); Text("Arms out").tag("arms_out"); Text("Arm showcase").tag("arm_showcase"); Text("Bent arms").tag("flex"); Text("Step").tag("step")
                        if state.poseId == "custom" { Text("Custom").tag("custom") }
                    }
                    Picker("Hair", selection: Binding(get: { state.bodyAppearance["hairStyle"] ?? "none" }, set: { model.send("appearance", value: $0, key: "hairStyle") })) {
                        Text("None").tag("none"); Text("Buzz cut").tag("buzz"); Text("Short").tag("short")
                    }
                    Picker("Top", selection: Binding(get: { state.bodyAppearance["top"] ?? "none" }, set: { model.send("appearance", value: $0, key: "top") })) {
                        Text("None").tag("none"); Text("T-shirt").tag("tshirt")
                    }
                    Picker("Bottoms", selection: Binding(get: { state.bodyAppearance["bottom"] ?? "none" }, set: { model.send("appearance", value: $0, key: "bottom") })) {
                        Text("None").tag("none"); Text("Shorts").tag("shorts"); Text("Trousers").tag("trousers")
                    }
                    Button(state.fitted ? "Update measurements" : "Fit to measurements", systemImage: "ruler") { model.send("measure") }
                }
                Section(state.region) {
                    Text(state.fitted ? "Proportions follow your measurements." : "Tap the model to choose a body part.").font(.footnote).foregroundStyle(.secondary)
                    ForEach(state.shapeParams) { param in
                        NativeSlider(title: param.label, value: state.shape[param.key] ?? 0, range: -1...1,
                                     changed: { model.send("shape", value: $0, key: param.key) },
                                     editing: { model.send("gesture", value: $0) }).accessibilityHint(param.hint)
                    }.disabled(state.fitted)
                    Button("Reset \(state.region.lowercased())") { model.send("resetShape") }.disabled(state.fitted)
                }
            } else {
                Section("Your artwork") {
                    Button("Import from Files", systemImage: "folder") { showImporter = true }.keyboardShortcut("o", modifiers: .command)
                    PhotosPicker(selection: $photo, matching: .images) { Label("Choose from Photos", systemImage: "photo") }
                    Menu("Try sample artwork", systemImage: "sparkles") {
                        Button("Botanical rose") { model.send("example", value: "botanical-rose") }
                        Button("Lunar moth") { model.send("example", value: "lunar-moth") }
                        Button("Ornamental dagger") { model.send("example", value: "ornamental-dagger") }
                    }
                    Text("Transparent PNG works best. You can also drop an image onto the model.").font(.footnote).foregroundStyle(.secondary)
                }.disabled(!model.editing || model.importing)
                Section("Placement") {
                    Toggle("Move ink with finger", isOn: Binding(get: { state.fingerPlacement }, set: { model.send("finger", value: $0) }))
                    Text(state.fingerPlacement ? "Drag the tattoo to move it. Use two fingers to navigate." : "Drag to orbit. Tap skin to place. Pencil moves the ink.").font(.footnote).foregroundStyle(.secondary)
                    NativeSlider(title: "Size", value: state.scale, range: 0.1...3, changed: { model.send("scale", value: $0) }, editing: { model.send("gesture", value: $0) })
                    NativeSlider(title: "Rotation", value: state.rotation, range: 0...360, changed: { model.send("rotation", value: $0) }, editing: { model.send("gesture", value: $0) })
                    NativeSlider(title: "Ink opacity", value: state.opacity, range: 0...1, changed: { model.send("opacity", value: $0) }, editing: { model.send("gesture", value: $0) })
                    Toggle("Show tattoo", isOn: Binding(get: { state.visible }, set: { model.send("visible", value: $0) }))
                }.disabled(state.blocked)
            }
            if state.save == "error" { Section { Button("Retry saving", systemImage: "arrow.clockwise") { model.send("save") } } }
        }
        .formStyle(.grouped)
    }
}

private struct NativeSlider: View {
    let title: String
    let value: Double
    let range: ClosedRange<Double>
    let changed: (Double) -> Void
    var editing: (Bool) -> Void = { _ in }
    @State private var local: Double = 0
    @State private var dragging = false
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack { Text(title); Spacer(); Text((dragging ? local : value).formatted(.number.precision(.fractionLength(2)))).monospacedDigit().foregroundStyle(.secondary) }
            Slider(value: Binding(get: { dragging ? local : value }, set: { local = $0; changed($0) }), in: range, onEditingChanged: { active in
                if active { local = value }
                dragging = active
                editing(active)
            }).accessibilityLabel(title)
        }.padding(.vertical, 4)
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let image: UIImage
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [PhotoShareItem(image)], applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

private final class PhotoShareItem: NSObject, UIActivityItemSource {
    let image: UIImage
    init(_ image: UIImage) { self.image = image }
    func activityViewControllerPlaceholderItem(_ activityViewController: UIActivityViewController) -> Any { image }
    func activityViewController(_ activityViewController: UIActivityViewController, itemForActivityType activityType: UIActivity.ActivityType?) -> Any? { image }
    func activityViewControllerLinkMetadata(_ activityViewController: UIActivityViewController) -> LPLinkMetadata? {
        let metadata = LPLinkMetadata()
        metadata.title = "Smart Ink photograph"
        metadata.imageProvider = NSItemProvider(object: image)
        metadata.iconProvider = NSItemProvider(object: image)
        return metadata
    }
}

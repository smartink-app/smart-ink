import SwiftUI

struct ProjectGallery: View {
    @ObservedObject var model: StudioModel
    @State private var query = ""
    @State private var accountProjects: [NativeProject] = []
    @State private var showAccount = false
    @State private var naming = false
    @State private var name = ""
    @State private var renameID: String?
    @State private var deleting: NativeProject?
    private let columns = [GridItem(.adaptive(minimum: 220, maximum: 360), spacing: 20)]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Your studio").font(.largeTitle.bold())
                        Text("From first placement to portfolio.").font(.title3).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button { renameID = nil; name = ""; naming = true } label: { Label("New project", systemImage: "plus") }
                        .buttonStyle(.borderedProminent).controlSize(.large).disabled(model.working)
                }
                if model.workspace?.cloud == true {
                    Button("Import from your account", systemImage: "icloud.and.arrow.down") {
                        Task {
                            do {
                                let raw = try await model.command("accountProjects") ?? []
                                accountProjects = try JSONDecoder().decode([NativeProject].self, from: JSONSerialization.data(withJSONObject: raw))
                                showAccount = true
                            } catch { model.error = error.localizedDescription }
                        }
                    }
                }
                Text("Saved on this iPad · available offline").font(.caption).foregroundStyle(.secondary)
                if model.projects.isEmpty {
                    ContentUnavailableView("Room for your next idea", systemImage: "square.stack.3d.up", description: Text("Create a project, bring in your artwork and place it on the body."))
                        .frame(maxWidth: .infinity, minHeight: 300)
                } else {
                    LazyVGrid(columns: columns, alignment: .leading, spacing: 20) {
                        ForEach(model.projects.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }) { project in
                            VStack(alignment: .leading, spacing: 0) {
                                Button { Task { await model.projectAction("open", id: project.id) } } label: {
                                    ZStack {
                                        Color(white: 0.17)
                                        if let source = project.thumbnail, let data = Data(base64Encoded: source.components(separatedBy: ",").last ?? ""), let image = UIImage(data: data) {
                                            Image(uiImage: image).resizable().scaledToFit()
                                        } else { Image(systemName: "figure.stand").font(.system(size: 64, weight: .ultraLight)).foregroundStyle(.secondary) }
                                    }.frame(height: 190).clipped().contentShape(Rectangle())
                                }.buttonStyle(.plain).accessibilityLabel("Open \(project.name)")
                                HStack {
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(project.name).font(.headline).lineLimit(1)
                                        Text("Studio project").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Menu {
                                        Button("Rename", systemImage: "pencil") { renameID = project.id; name = project.name; naming = true }
                                        Button("Delete", systemImage: "trash", role: .destructive) { deleting = project }
                                    } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.accessibilityLabel("Options for \(project.name)")
                                }.padding(16)
                            }.background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 22)).clipShape(RoundedRectangle(cornerRadius: 22))
                        }
                    }.disabled(model.working)
                }
            }.padding(32)
        }
        .background(Color(uiColor: .systemBackground))
        .searchable(text: $query, prompt: "Search your projects")
        .refreshable { await model.refreshProjects() }
        .sheet(isPresented: $showAccount) {
            NavigationStack {
                List(accountProjects) { project in
                    Button(project.name) {
                        Task { await model.projectAction("importProject", id: project.id); showAccount = false }
                    }.disabled(model.working)
                }.navigationTitle("Import a project").toolbar { Button("Done") { showAccount = false } }
                    .overlay { if accountProjects.isEmpty { ContentUnavailableView("No account projects", systemImage: "icloud") } }
            }
        }
        .alert(renameID == nil ? "New project" : "Rename project", isPresented: $naming) {
            TextField("Project name", text: $name)
            Button("Cancel", role: .cancel) {}
            Button(renameID == nil ? "Create" : "Save") {
                Task { await model.projectAction(renameID == nil ? "create" : "rename", id: renameID, name: name) }
            }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.count > 100)
        }
        .confirmationDialog("Delete \(deleting?.name ?? "project")?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("Delete project", role: .destructive) { if let project = deleting { Task { await model.projectAction("delete", id: project.id) } }; deleting = nil }
        } message: { Text("This removes the project and its saved placement.") }
    }
}

struct RenderLibrary: View {
    @ObservedObject private var jobs = RenderJobs.shared
    @ObservedObject var model: StudioModel
    @Environment(\.dismiss) private var dismiss
    @State private var selected: UIImage?
    var body: some View {
        NavigationStack {
            List {
                if model.renders.isEmpty && jobs.jobs.filter({ $0.owner == model.workspace?.email }).isEmpty { ContentUnavailableView("No photos yet", systemImage: "camera", description: Text("Render a photograph in Shoot. Finished images are saved here.")) }
                if let failure = jobs.storageFailure { Text(failure).foregroundStyle(.orange) }
                Section("On this iPad") {
                    ForEach(jobs.jobs.filter { $0.owner == model.workspace?.email }) { job in
                        VStack(alignment: .leading, spacing: 12) {
                            Text(job.name).font(.headline)
                            Text(job.message).font(.footnote).foregroundStyle(.secondary)
                            if job.active {
                                if job.status == "uploading" { ProgressView(value: job.progress) } else { ProgressView("Rendering") }
                                Button("Stop waiting", role: .destructive) { jobs.cancel(job.id, owner: model.workspace?.email ?? "") }
                            } else if job.complete {
                                if let image = jobs.image(job.id, owner: model.workspace?.email ?? "") {
                                    Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 240).clipShape(RoundedRectangle(cornerRadius: 12))
                                    Button("Share photograph", systemImage: "square.and.arrow.up") { selected = image }
                                }
                            } else { Button("Retry render", systemImage: "arrow.clockwise") { jobs.retry(job.id, owner: model.workspace?.email ?? "") } }
                        }.padding(.vertical, 8)
                    }
                }
                Section("Project history") { ForEach(model.renders) { render in
                    Button {
                        Task {
                            do {
                                let raw = try await model.command("renderImage", id: render.id)
                                if let base64 = raw as? String, let data = Data(base64Encoded: base64) { selected = UIImage(data: data) }
                            } catch { model.error = error.localizedDescription }
                        }
                    } label: {
                        HStack {
                            Image(systemName: "photo").font(.title).frame(width: 52, height: 52).background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
                            VStack(alignment: .leading) {
                                Text(render.sceneName ?? "Studio photograph").font(.headline)
                                Text("\(render.width) × \(render.height) · \(Date(timeIntervalSince1970: render.createdAt / 1000).formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer(); Image(systemName: "square.and.arrow.up")
                        }
                    }
                }
                }
            }.navigationTitle("Your photographs").toolbar { Button("Done") { dismiss() } }
                .task { await model.refreshRenders() }
                .sheet(isPresented: Binding(get: { selected != nil }, set: { if !$0 { selected = nil } })) { if let selected { ShareSheet(image: selected) } }
        }
    }
}

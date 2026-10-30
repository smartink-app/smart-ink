import Foundation

struct NativeWorkspace: Decodable {
    let page: String
    let name: String
    let projectId: String?
    let email: String
    let cloud: Bool
    let tab: String
    let loading: Bool
    let blocked: Bool
    let measuring: Bool
    let save: String
    let canUndo: Bool
    let canRedo: Bool
    let fingerPlacement: Bool
    let scale: Double
    let rotation: Double
    let opacity: Double
    let visible: Bool
    let bodyMeshId: String
    let skinToneId: String
    let poseId: String
    let bodyAppearance: [String: String]
    let fitted: Bool
    let region: String
    let shape: [String: Double]
    let shapeParams: [ShapeParameter]
    let shot: NativeShot
    let present: NativePresent?
}
struct NativePresent: Decodable {
    let motion: String
    let canShowcase: Bool
}
struct ShapeParameter: Decodable, Identifiable {
    let key: String
    let label: String
    let hint: String
    var id: String { key }
}
struct NativeShot: Decodable {
    let open: Bool
    let status: String
    let quality: String
    let message: String
    let warning: String
    let elapsed: Int
    let look: String?
    let hasImage: Bool
    let format: String
    let blur: Double
    let camera: [String: Double]
    var busy: Bool { status == "rendering" || status == "uploading" }
}
struct NativeProject: Decodable, Identifiable {
    let id: String
    let name: String
    let thumbnail: String?
    let updatedAt: String
}
struct NativeRender: Decodable, Identifiable {
    let id: String
    let sceneName: String?
    let width: Int
    let height: Int
    let createdAt: Double
}

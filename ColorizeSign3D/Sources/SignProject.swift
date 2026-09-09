import SwiftUI

enum SignMaterial: String, CaseIterable, Identifiable, Codable {
    case acrylic = "Акрил", gold = "Золото", steel = "Сталь", pvc = "ПВХ", neon = "Неон"
    var id: String { rawValue }
    var color: Color {
        switch self {
        case .acrylic: return .white
        case .gold: return Color(red: 0.95, green: 0.68, blue: 0.20)
        case .steel: return Color(white: 0.72)
        case .pvc: return Color(red: 0.12, green: 0.55, blue: 0.98)
        case .neon: return Color(red: 1, green: 0.18, blue: 0.48)
        }
    }
}

enum LightingMode: String, CaseIterable, Identifiable, Codable {
    case none = "Без подсветки", face = "Лицевая", halo = "Контражур", combined = "Комбинированная"
    var id: String { rawValue }
}

enum SignFont: String, CaseIterable, Identifiable, Codable {
    case rounded = "Скруглённый", modern = "Современный", classic = "Классический", condensed = "Узкий"
    var id: String { rawValue }
    var design: Font.Design { self == .classic ? .serif : (self == .rounded ? .rounded : .default) }
    var width: Font.Width { self == .condensed ? .condensed : .standard }
}

enum FacadeFinish: String, CaseIterable, Identifiable, Codable {
    case photo = "Фото", brick = "Кирпич", concrete = "Бетон", dark = "Тёмный"
    var id: String { rawValue }
}

struct SignProject: Codable, Equatable {
    var text = "COLORIZE"
    var widthCM = 300.0, heightCM = 55.0, depthCM = 6.0
    var material = SignMaterial.gold
    var lighting = LightingMode.halo
    var lightHex = "#FFD48A", faceHex = "#F2B335"
    var brightness = 0.8, haloRadius = 24.0, letterSpacing = 0.0
    var tiltX = 0.0, tiltY = 0.0
    var font = SignFont.rounded
    var hasPanel = false
    var panelHex = "#151A22"
    var panelCornerRadius = 12.0
    var facadeFinish = FacadeFinish.photo
    var showGrid = false
    var snapToCenter = true

    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? text
        widthCM = try c.decodeIfPresent(Double.self, forKey: .widthCM) ?? widthCM
        heightCM = try c.decodeIfPresent(Double.self, forKey: .heightCM) ?? heightCM
        depthCM = try c.decodeIfPresent(Double.self, forKey: .depthCM) ?? depthCM
        material = try c.decodeIfPresent(SignMaterial.self, forKey: .material) ?? material
        lighting = try c.decodeIfPresent(LightingMode.self, forKey: .lighting) ?? lighting
        lightHex = try c.decodeIfPresent(String.self, forKey: .lightHex) ?? lightHex
        faceHex = try c.decodeIfPresent(String.self, forKey: .faceHex) ?? faceHex
        brightness = try c.decodeIfPresent(Double.self, forKey: .brightness) ?? brightness
        haloRadius = try c.decodeIfPresent(Double.self, forKey: .haloRadius) ?? haloRadius
        letterSpacing = try c.decodeIfPresent(Double.self, forKey: .letterSpacing) ?? letterSpacing
        tiltX = try c.decodeIfPresent(Double.self, forKey: .tiltX) ?? tiltX
        tiltY = try c.decodeIfPresent(Double.self, forKey: .tiltY) ?? tiltY
        font = try c.decodeIfPresent(SignFont.self, forKey: .font) ?? font
        hasPanel = try c.decodeIfPresent(Bool.self, forKey: .hasPanel) ?? hasPanel
        panelHex = try c.decodeIfPresent(String.self, forKey: .panelHex) ?? panelHex
        panelCornerRadius = try c.decodeIfPresent(Double.self, forKey: .panelCornerRadius) ?? panelCornerRadius
        facadeFinish = try c.decodeIfPresent(FacadeFinish.self, forKey: .facadeFinish) ?? facadeFinish
        showGrid = try c.decodeIfPresent(Bool.self, forKey: .showGrid) ?? showGrid
        snapToCenter = try c.decodeIfPresent(Bool.self, forKey: .snapToCenter) ?? snapToCenter
    }
}

struct PlacementState: Codable, Equatable {
    var x = 0.0, y = 0.0, scale = 1.0, rotation = 0.0
}

struct DesignPreset: Identifiable {
    let id = UUID()
    let name: String, symbol: String
    let material: SignMaterial
    let lighting: LightingMode
    let faceHex: String, lightHex: String
    static let all: [DesignPreset] = [
        .init(name: "Золотой контражур", symbol: "sparkles", material: .gold, lighting: .halo, faceHex: "#E4AD3A", lightHex: "#FFD99A"),
        .init(name: "Белый акрил", symbol: "circle.fill", material: .acrylic, lighting: .face, faceHex: "#F8FAFF", lightHex: "#FFFFFF"),
        .init(name: "Холодная сталь", symbol: "diamond.fill", material: .steel, lighting: .combined, faceHex: "#AEB8C4", lightHex: "#BFE7FF"),
        .init(name: "Розовый неон", symbol: "bolt.fill", material: .neon, lighting: .combined, faceHex: "#FF2C78", lightHex: "#FF4F9A")
    ]
}

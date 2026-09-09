import SwiftUI

enum SignMaterial: String, CaseIterable, Identifiable, Codable {
    case acrylic = "Акрил"
    case gold = "Золото"
    case steel = "Сталь"
    case pvc = "ПВХ"

    var id: String { rawValue }
    var color: Color {
        switch self {
        case .acrylic: return .white
        case .gold: return Color(red: 0.95, green: 0.68, blue: 0.20)
        case .steel: return Color(white: 0.72)
        case .pvc: return Color(red: 0.12, green: 0.55, blue: 0.98)
        }
    }
}

enum LightingMode: String, CaseIterable, Identifiable, Codable {
    case none = "Без подсветки"
    case face = "Лицевая"
    case halo = "Контражур"
    case combined = "Комбинированная"
    var id: String { rawValue }
}

struct SignProject: Codable {
    var text = "COLORIZE"
    var widthCM = 300.0
    var heightCM = 55.0
    var depthCM = 6.0
    var material = SignMaterial.gold
    var lighting = LightingMode.halo
    var lightHex = "#FFD48A"
    var brightness = 0.8
}


import SwiftUI
import UIKit

enum TextAlignmentMode: String, CaseIterable, Identifiable, Codable {
    case left = "Слева", center = "Центр", right = "Справа"
    var id: String { rawValue }
    var alignment: TextAlignment { self == .left ? .leading : (self == .right ? .trailing : .center) }
}

struct LetteringLayer: Identifiable, Codable, Equatable {
    var id = UUID()
    var name = "Надпись"
    var text = "COLORIZE"
    var fontName = "AvenirNext-Heavy"
    var fontSize = 72.0
    var tracking = 0.0
    var lineSpacing = 0.0
    var alignment = TextAlignmentMode.center
    var fillHex = "#111827"
    var outlineHex = "#FFFFFF"
    var outlineWidth = 0.0
    var shadowHex = "#000000"
    var shadowOpacity = 0.22
    var shadowBlur = 8.0
    var shadowX = 4.0
    var shadowY = 6.0
    var x = 0.0
    var y = 0.0
    var scale = 1.0
    var widthScale = 1.0
    var rotation = 0.0
    var opacity = 1.0
    var isLocked = false
    var isHidden = false
}

struct LetteringDocument: Codable, Equatable {
    var title = "Новый дизайн"
    var canvasWidth = 1080.0
    var canvasHeight = 1080.0
    var backgroundHex = "#F4F4F1"
    var transparentBackground = false
    var layers: [LetteringLayer] = [LetteringLayer()]
}

enum InspectorSection: String, CaseIterable, Identifiable {
    case text = "Текст", font = "Шрифт", spacing = "Интервал", style = "Стиль", transform = "Размер", layers = "Слои"
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .text: return "textformat"
        case .font: return "character.cursor.ibeam"
        case .spacing: return "arrow.left.and.right.text.vertical"
        case .style: return "paintpalette"
        case .transform: return "arrow.up.left.and.arrow.down.right"
        case .layers: return "square.3.layers.3d"
        }
    }
}

enum ExportKind: String, CaseIterable, Identifiable {
    case png = "PNG", svg = "SVG", pdf = "PDF"
    var id: String { rawValue }
}

extension Color {
    init(hex: String) {
        let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: clean).scanHexInt64(&value)
        self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}

extension UIColor {
    convenience init(hex: String) { self.init(Color(hex: hex)) }
}

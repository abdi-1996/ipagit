import SwiftUI
import UIKit

enum TextAlignmentMode: String, CaseIterable, Identifiable, Codable {
    case left = "Слева", center = "Центр", right = "Справа"
    var id: String { rawValue }
    var alignment: TextAlignment { self == .left ? .leading : (self == .right ? .trailing : .center) }
}

enum EditorMode: String, CaseIterable, Identifiable {
    case twoD = "2D"
    case threeD = "3D"
    case threeDView = "3D View"
    var id: String { rawValue }
}

enum SignMaterialPreset: String, CaseIterable, Identifiable, Codable {
    case acrylic = "Акрил"
    case painted = "Крашеный металл"
    case brushedSilver = "Шлиф. сталь"
    case mirrorSilver = "Зеркальная сталь"
    case brushedGold = "Шлиф. золото"
    case mirrorGold = "Зеркальное золото"
    case pvc = "ПВХ"
    var id: String { rawValue }

    var metallic: CGFloat {
        switch self {
        case .brushedSilver, .mirrorSilver, .brushedGold, .mirrorGold, .painted: return 1
        default: return 0
        }
    }

    var roughness: CGFloat {
        switch self {
        case .mirrorSilver, .mirrorGold: return 0.08
        case .brushedSilver, .brushedGold: return 0.34
        case .painted: return 0.28
        case .acrylic: return 0.22
        case .pvc: return 0.55
        }
    }
}

enum SignLightMode: String, CaseIterable, Identifiable, Codable {
    case face = "Лицевая"
    case halo = "Контражур"
    case both = "Лицо + контражур"
    var id: String { rawValue }
}

enum SceneLightPreset: String, CaseIterable, Identifiable {
    case day = "День"
    case cloudy = "Пасмурно"
    case sunset = "Закат"
    case evening = "Вечер"
    case night = "Ночь"
    var id: String { rawValue }
}

struct VectorPoint: Codable, Equatable {
    var x: Double
    var y: Double
}

enum VectorCommandKind: String, Codable {
    case move, line, quad, cubic, close
}

struct VectorCommand: Codable, Equatable, Identifiable {
    var id = UUID()
    var kind: VectorCommandKind
    var p1: VectorPoint?
    var p2: VectorPoint?
    var p3: VectorPoint?

    var anchor: VectorPoint? {
        get {
            switch kind {
            case .move, .line: return p1
            case .quad: return p2
            case .cubic: return p3
            case .close: return nil
            }
        }
        set {
            switch kind {
            case .move, .line: p1 = newValue
            case .quad: p2 = newValue
            case .cubic: p3 = newValue
            case .close: break
            }
        }
    }
}

struct VectorShapeData: Codable, Equatable {
    var commands: [VectorCommand]

    var bounds: CGRect {
        var points: [CGPoint] = []
        for command in commands {
            for point in [command.p1, command.p2, command.p3].compactMap({ $0 }) {
                points.append(CGPoint(x: point.x, y: point.y))
            }
        }
        guard let first = points.first else { return CGRect(x: -50, y: -25, width: 100, height: 50) }
        var minX = first.x, maxX = first.x, minY = first.y, maxY = first.y
        for p in points.dropFirst() {
            minX = min(minX, p.x); maxX = max(maxX, p.x)
            minY = min(minY, p.y); maxY = max(maxY, p.y)
        }
        return CGRect(x: minX, y: minY, width: max(1, maxX - minX), height: max(1, maxY - minY))
    }

    var anchorCount: Int { commands.filter { $0.anchor != nil }.count }
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

    // Реальная конструкция вывески
    var depthMM = 80.0
    var faceHex = "#F5F5F2"
    var sideHex = "#C7A84A"
    var backHex = "#E5E7EB"
    var material = SignMaterialPreset.brushedGold
    var signLightEnabled = true
    var signLightMode = SignLightMode.halo
    var signLightIntensity = 0.75
    var signLightKelvin = 4000.0

    // После преобразования текста в кривые хранится настоящий векторный путь.
    var vectorShape: VectorShapeData?
}

struct LetteringDocument: Codable, Equatable {
    var title = "Новый дизайн"
    var canvasWidth = 1080.0
    var canvasHeight = 1080.0
    var backgroundHex = "#FFFFFF"
    var transparentBackground = false
    var layers: [LetteringLayer] = [LetteringLayer()]

    var sceneLightIntensity = 1.0
    var sceneLightAzimuth = 35.0
    var sceneLightElevation = 42.0
    var shadowEnabled = true
    var facadeOpacity = 1.0
}

enum InspectorSection: String, CaseIterable, Identifiable {
    case text = "Текст"
    case font = "Шрифт"
    case curves = "Кривые"
    case style = "Цвет"
    case transform = "Размер"
    case geometry = "Объём"
    case material = "Материал"
    case lighting = "Свет"
    case facade = "Фасад"
    case layers = "Слои"

    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .text: return "textformat"
        case .font: return "character.cursor.ibeam"
        case .curves: return "point.topleft.down.to.point.bottomright.curvepath"
        case .style: return "paintpalette"
        case .transform: return "arrow.up.left.and.arrow.down.right"
        case .geometry: return "cube"
        case .material: return "circle.hexagongrid"
        case .lighting: return "lightbulb.max"
        case .facade: return "building.2"
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
        if clean.count == 8 {
            self.init(.sRGB,
                      red: Double((value >> 24) & 255) / 255,
                      green: Double((value >> 16) & 255) / 255,
                      blue: Double((value >> 8) & 255) / 255,
                      opacity: Double(value & 255) / 255)
        } else {
            self.init(red: Double((value >> 16) & 255) / 255,
                      green: Double((value >> 8) & 255) / 255,
                      blue: Double(value & 255) / 255)
        }
    }
}

extension UIColor {
    convenience init(hex: String) { self.init(Color(hex: hex)) }
}

func colorForKelvin(_ kelvin: Double) -> UIColor {
    let t = max(1000, min(12000, kelvin)) / 100
    let r: Double
    let g: Double
    let b: Double
    if t <= 66 {
        r = 255
        g = 99.4708025861 * log(t) - 161.1195681661
        b = t <= 19 ? 0 : 138.5177312231 * log(t - 10) - 305.0447927307
    } else {
        r = 329.698727446 * pow(t - 60, -0.1332047592)
        g = 288.1221695283 * pow(t - 60, -0.0755148492)
        b = 255
    }
    return UIColor(red: max(0, min(255, r)) / 255,
                   green: max(0, min(255, g)) / 255,
                   blue: max(0, min(255, b)) / 255,
                   alpha: 1)
}

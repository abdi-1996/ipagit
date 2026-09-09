import SwiftUI
import UIKit
import UniformTypeIdentifiers
import CoreText

struct EditorView: View {
    @State private var document = LetteringDocument()
    @State private var selectedID: UUID?
    @State private var section = InspectorSection.text
    @State private var history: [LetteringDocument] = []
    @State private var future: [LetteringDocument] = []
    @State private var showFonts = false
    @State private var showImporter = false
    @State private var showExport = false
    @State private var showShare = false
    @State private var shareItems: [Any] = []
    @State private var zoom = 0.32
    @State private var didFitCanvas = false
    @State private var dragOrigin = CGPoint.zero
    @State private var scaleOrigin = 1.0
    @State private var rotationOrigin = 0.0

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                topBar
                workspace
                inspector
            }
            .background(Color(red: 0.07, green: 0.075, blue: 0.09).ignoresSafeArea())
            .navigationBarHidden(true)
            .onAppear { restore(); selectedID = selectedID ?? document.layers.first?.id }
            .onChange(of: document) { _, _ in save() }
            .sheet(isPresented: $showFonts) { FontBrowser(font: binding(\.fontName), importAction: { showFonts = false; showImporter = true }) }
            .sheet(isPresented: $showExport) { ExportPanel(action: export) }
            .sheet(isPresented: $showShare) { ShareSheet(items: shareItems) }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.font], onCompletion: importFont)
        }.preferredColorScheme(.dark)
    }

    private var topBar: some View {
        HStack(spacing: 17) {
            VStack(alignment: .leading, spacing: 1) { Text("COLORIZE DESIGN").font(.caption.bold()).foregroundStyle(.blue); Text("Редактор надписей").font(.headline) }
            Spacer()
            Button(action: undo) { Image(systemName: "arrow.uturn.backward") }.disabled(history.isEmpty)
            Button(action: redo) { Image(systemName: "arrow.uturn.forward") }.disabled(future.isEmpty)
            Button(action: duplicate) { Image(systemName: "plus.square.on.square") }.disabled(layer == nil)
            Button(action: addText) { Label("Текст", systemImage: "plus") }.buttonStyle(.borderedProminent)
            Button { showExport = true } label: { Image(systemName: "square.and.arrow.up") }
        }.padding(.horizontal, 14).frame(height: 58).background(.ultraThinMaterial)
    }

    private var workspace: some View {
        GeometryReader { proxy in
            ZStack {
                Color.black.opacity(0.22)
                canvas(editable: true)
                    .frame(width: document.canvasWidth, height: document.canvasHeight)
                    .scaleEffect(zoom)
                    .shadow(color: .black.opacity(0.55), radius: 30, y: 18)
                VStack { Spacer(); HStack { Spacer(); HStack(spacing: 6) { Button { zoom = max(0.12, zoom - 0.06) } label: { Image(systemName: "minus") }; Text("\(Int(zoom * 100))%").font(.caption.monospacedDigit()); Button { zoom = min(1.5, zoom + 0.06) } label: { Image(systemName: "plus") } }.padding(8).background(.ultraThinMaterial, in: Capsule()).padding(12) } }
            }.clipped().onTapGesture { selectedID = nil }
                .onChange(of: proxy.size, initial: true) { _, size in
                    guard size.width > 100, size.height > 100, !didFitCanvas else { return }
                    zoom = max(0.15, min((size.width - 34) / document.canvasWidth, (size.height - 28) / document.canvasHeight, 1))
                    didFitCanvas = true
                }
        }
    }

    private func canvas(editable: Bool) -> some View {
        ZStack {
            Color.white
            ForEach(document.layers) { item in
                if !item.isHidden {
                    OutlinedText(layer: item)
                        .frame(maxWidth: document.canvasWidth * 0.88)
                        .scaleEffect(x: item.scale * item.widthScale, y: item.scale)
                        .rotationEffect(.degrees(item.rotation)).offset(x: item.x, y: item.y).opacity(item.opacity)
                        .overlay { if editable && selectedID == item.id { RoundedRectangle(cornerRadius: 5).stroke(.blue, style: StrokeStyle(lineWidth: 2 / zoom, dash: [10 / zoom, 5 / zoom])).padding(-12 / zoom) } }
                        .contentShape(Rectangle()).onTapGesture { if editable { selectedID = item.id } }
                        .gesture(item.isLocked || !editable ? nil : gesture(item.id))
                }
            }
        }.clipped()
    }

    private func gesture(_ id: UUID) -> some Gesture {
        DragGesture().onChanged { value in
            guard let i = index(id) else { return }
            if value.translation == .zero { checkpoint(); dragOrigin = CGPoint(x: document.layers[i].x, y: document.layers[i].y) }
            selectedID = id
            document.layers[i].x = dragOrigin.x + value.translation.width / zoom
            document.layers[i].y = dragOrigin.y + value.translation.height / zoom
        }.simultaneously(with: MagnificationGesture().onChanged { value in
            guard let i = index(id) else { return }
            if value == 1 { checkpoint(); scaleOrigin = document.layers[i].scale }
            document.layers[i].scale = min(max(scaleOrigin * value, 0.15), 6)
        }).simultaneously(with: RotationGesture().onChanged { value in
            guard let i = index(id) else { return }
            if abs(value.degrees) < 0.01 { checkpoint(); rotationOrigin = document.layers[i].rotation }
            document.layers[i].rotation = rotationOrigin + value.degrees
        })
    }

    private var inspector: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) { ForEach(InspectorSection.allCases) { tab in Button { section = tab } label: { VStack(spacing: 3) { Image(systemName: tab.symbol); Text(tab.rawValue).font(.caption2) }.frame(width: 68, height: 48).foregroundStyle(section == tab ? .white : .secondary).background(section == tab ? .blue : .clear, in: RoundedRectangle(cornerRadius: 10)) } } }.padding(8)
            }
            Divider()
            ScrollView { controls.padding(14) }.frame(height: 218)
        }.background(.ultraThinMaterial)
    }

    @ViewBuilder private var controls: some View {
        if layer == nil && section != .layers { Text("Выберите надпись на холсте").foregroundStyle(.secondary).padding(30) }
        else { switch section {
        case .text: textControls
        case .font: fontControls
        case .spacing: spacingControls
        case .style: styleControls
        case .transform: transformControls
        case .layers: layerControls
        } }
    }

    private var textControls: some View {
        VStack(spacing: 12) {
            TextField("Введите надпись", text: binding(\.text), axis: .vertical).textFieldStyle(.roundedBorder).lineLimit(1...3)
            Picker("Выравнивание", selection: binding(\.alignment)) { ForEach(TextAlignmentMode.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented)
            HStack { Button("ВЕРХНИЙ") { setText { $0.uppercased() } }; Button("нижний") { setText { $0.lowercased() } }; Button("Каждое Слово") { setText { $0.capitalized } } }.buttonStyle(.bordered)
        }
    }
    private var fontControls: some View {
        VStack(spacing: 12) {
            Button { showFonts = true } label: { HStack { Text(layer?.fontName ?? "Шрифт").font(.headline); Spacer(); Image(systemName: "chevron.right") } }.buttonStyle(.bordered)
            slider("Размер", binding(\.fontSize), 8...280, " pt")
            slider("Ширина", binding(\.widthScale), 0.35...2.2, "%", 100)
        }
    }
    private var spacingControls: some View { VStack(spacing: 12) { slider("Межбуквенный интервал", binding(\.tracking), -8...40, ""); slider("Межстрочный интервал", binding(\.lineSpacing), -10...80, "") } }
    private var styleControls: some View {
        VStack(spacing: 12) {
            colorField("Заливка", binding(\.fillHex)); colorField("Обводка", binding(\.outlineHex)); slider("Толщина обводки", binding(\.outlineWidth), 0...18, " pt")
            colorField("Тень", binding(\.shadowHex)); slider("Прозрачность тени", binding(\.shadowOpacity), 0...1, "%", 100); slider("Размытие тени", binding(\.shadowBlur), 0...40, "")
        }
    }
    private var transformControls: some View {
        VStack(spacing: 12) {
            HStack { Button("По центру") { checkpoint(); set(\.x, 0); set(\.y, 0) }; Button("Копия", action: duplicate); Button("Удалить", role: .destructive, action: remove) }.buttonStyle(.bordered)
            slider("Масштаб", binding(\.scale), 0.15...6, "%", 100); slider("Поворот", binding(\.rotation), -180...180, "°"); slider("Прозрачность", binding(\.opacity), 0...1, "%", 100)
        }
    }
    private var layerControls: some View {
        VStack(spacing: 7) { ForEach(document.layers.reversed()) { item in HStack { Button { selectedID = item.id } label: { VStack(alignment: .leading) { Text(item.name).bold(); Text(item.text).font(.caption).lineLimit(1).foregroundStyle(.secondary) } }; Spacer(); Button { toggle(item.id, \.isHidden) } label: { Image(systemName: item.isHidden ? "eye.slash" : "eye") }; Button { toggle(item.id, \.isLocked) } label: { Image(systemName: item.isLocked ? "lock.fill" : "lock.open") } }.padding(10).background(selectedID == item.id ? .blue.opacity(0.2) : .white.opacity(0.05), in: RoundedRectangle(cornerRadius: 10)) } }
    }

    private func slider(_ title: String, _ value: Binding<Double>, _ range: ClosedRange<Double>, _ suffix: String, _ multiplier: Double = 1) -> some View {
        VStack(spacing: 4) { HStack { Text(title); Spacer(); Text("\(Int(value.wrappedValue * multiplier))\(suffix)").monospacedDigit().foregroundStyle(.secondary) }; Slider(value: value, in: range, onEditingChanged: { if $0 { checkpoint() } }) }
    }
    private func colorField(_ title: String, _ value: Binding<String>) -> some View { HStack { Text(title); Spacer(); Circle().fill(Color(hex: value.wrappedValue)).frame(width: 25, height: 25); TextField("#FFFFFF", text: value).frame(width: 92).textFieldStyle(.roundedBorder).textInputAutocapitalization(.characters) } }

    private var layer: LetteringLayer? { guard let i = index(selectedID) else { return nil }; return document.layers[i] }
    private func index(_ id: UUID?) -> Int? { guard let id else { return nil }; return document.layers.firstIndex { $0.id == id } }
    private func binding<T>(_ key: WritableKeyPath<LetteringLayer, T>) -> Binding<T> { Binding(get: { layer?[keyPath: key] ?? LetteringLayer()[keyPath: key] }, set: { guard let i = index(selectedID) else { return }; document.layers[i][keyPath: key] = $0 }) }
    private func set<T>(_ key: WritableKeyPath<LetteringLayer, T>, _ value: T) { guard let i = index(selectedID) else { return }; document.layers[i][keyPath: key] = value }
    private func checkpoint() { if history.last != document { history.append(document); if history.count > 40 { history.removeFirst() } }; future.removeAll() }
    private func undo() { guard let old = history.popLast() else { return }; future.append(document); document = old }
    private func redo() { guard let next = future.popLast() else { return }; history.append(document); document = next }
    private func addText() { checkpoint(); var item = LetteringLayer(); item.id = UUID(); item.name = "Надпись \(document.layers.count + 1)"; item.text = "НОВАЯ НАДПИСЬ"; item.y = Double(document.layers.count * 35); document.layers.append(item); selectedID = item.id; section = .text }
    private func duplicate() { guard var item = layer else { return }; checkpoint(); item.id = UUID(); item.name += " копия"; item.x += 30; item.y += 30; document.layers.append(item); selectedID = item.id }
    private func remove() { guard let i = index(selectedID) else { return }; checkpoint(); document.layers.remove(at: i); selectedID = document.layers.last?.id }
    private func setText(_ action: (String) -> String) { guard let text = layer?.text else { return }; checkpoint(); set(\.text, action(text)) }
    private func toggle(_ id: UUID, _ key: WritableKeyPath<LetteringLayer, Bool>) { guard let i = index(id) else { return }; checkpoint(); document.layers[i][keyPath: key].toggle() }
    private func save() { if let data = try? JSONEncoder().encode(document) { UserDefaults.standard.set(data, forKey: "letteringDocumentV1") } }
    private func restore() {
        if let data = UserDefaults.standard.data(forKey: "letteringDocumentV1"), let value = try? JSONDecoder().decode(LetteringDocument.self, from: data) { document = value }
        document.transparentBackground = false
        document.backgroundHex = "#FFFFFF"
        if document.layers.isEmpty { document.layers = [LetteringLayer()] }
        for i in document.layers.indices {
            if abs(document.layers[i].x) > document.canvasWidth / 2 { document.layers[i].x = 0 }
            if abs(document.layers[i].y) > document.canvasHeight / 2 { document.layers[i].y = 0 }
            if document.layers[i].fillHex.uppercased() == "#FFFFFF" { document.layers[i].fillHex = "#111827" }
            document.layers[i].isHidden = false
        }
    }

    private func importFont(_ result: Result<URL, Error>) {
        guard case .success(let url) = result else { return }; let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }; var error: Unmanaged<CFError>?
        if CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error), let list = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [[CFString: Any]], let name = list.first?[kCTFontNameAttribute] as? String { checkpoint(); set(\.fontName, name) }
    }
    private func export(_ kind: ExportKind) {
        showExport = false; let size = CGSize(width: document.canvasWidth, height: document.canvasHeight); let renderer = ImageRenderer(content: canvas(editable: false).frame(width: size.width, height: size.height)); renderer.scale = 1
        switch kind {
        case .png: if let data = renderer.uiImage?.pngData() { share(data, "Colorize-Design.png") }
        case .pdf: if let image = renderer.uiImage { share(UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: size)).pdfData { _ in image.draw(in: CGRect(origin: .zero, size: size)) }, "Colorize-Design.pdf") }
        case .svg: share(svg().data(using: .utf8) ?? Data(), "Colorize-Design.svg")
        }
    }
    private func share(_ data: Data, _ name: String) { let url = FileManager.default.temporaryDirectory.appendingPathComponent(name); try? data.write(to: url); shareItems = [url]; showShare = true }
    private func svg() -> String {
        let bg = document.transparentBackground ? "" : "<rect width=\"100%\" height=\"100%\" fill=\"\(document.backgroundHex)\"/>"
        let text = document.layers.filter { !$0.isHidden }.map { l -> String in let value = l.text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;"); let x = document.canvasWidth / 2 + l.x, y = document.canvasHeight / 2 + l.y; return "<text x=\"\(x)\" y=\"\(y)\" text-anchor=\"middle\" font-family=\"\(l.fontName)\" font-size=\"\(l.fontSize)\" letter-spacing=\"\(l.tracking)\" fill=\"\(l.fillHex)\" stroke=\"\(l.outlineHex)\" stroke-width=\"\(l.outlineWidth * 2)\" paint-order=\"stroke\" transform=\"rotate(\(l.rotation) \(x) \(y))\">\(value)</text>" }.joined()
        return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"\(document.canvasWidth)\" height=\"\(document.canvasHeight)\">\(bg)\(text)</svg>"
    }
}

struct OutlinedText: View {
    let layer: LetteringLayer
    private var label: Text { Text(layer.text).font(.custom(layer.fontName, size: layer.fontSize)).tracking(layer.tracking) }
    var body: some View { ZStack { if layer.outlineWidth > 0 { ForEach(0..<16, id: \.self) { i in let angle = Double(i) * .pi / 8; label.foregroundStyle(Color(hex: layer.outlineHex)).offset(x: cos(angle) * layer.outlineWidth, y: sin(angle) * layer.outlineWidth) } }; label.foregroundStyle(Color(hex: layer.fillHex)).shadow(color: Color(hex: layer.shadowHex).opacity(layer.shadowOpacity), radius: layer.shadowBlur, x: layer.shadowX, y: layer.shadowY) }.lineSpacing(layer.lineSpacing).multilineTextAlignment(layer.alignment.alignment).fixedSize(horizontal: false, vertical: true) }
}

struct TransparencyGrid: View { var body: some View { Canvas { context, size in let c = 24.0; for y in stride(from: 0.0, to: size.height, by: c) { for x in stride(from: 0.0, to: size.width, by: c) { context.fill(Path(CGRect(x: x, y: y, width: c, height: c)), with: .color(Int(x / c + y / c).isMultiple(of: 2) ? .white : Color(white: 0.82))) } } } } }

struct FontBrowser: View {
    @Environment(\.dismiss) var dismiss
    @Binding var font: String
    let importAction: () -> Void
    @State var search = ""
    var fonts: [String] { UIFont.familyNames.sorted().flatMap { UIFont.fontNames(forFamilyName: $0) }.filter { search.isEmpty || $0.localizedCaseInsensitiveContains(search) } }
    var body: some View { NavigationStack { List(fonts, id: \.self) { name in Button { font = name; dismiss() } label: { HStack { Text("COLORIZE").font(.custom(name, size: 25)); Spacer(); Text(name).font(.caption).foregroundStyle(.secondary); if font == name { Image(systemName: "checkmark") } } } }.searchable(text: $search).navigationTitle("Шрифты").toolbar { ToolbarItem(placement: .topBarLeading) { Button("Импорт", action: importAction) }; ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } } } }
}

struct ExportPanel: View { @Environment(\.dismiss) var dismiss; let action: (ExportKind) -> Void; var body: some View { NavigationStack { List(ExportKind.allCases) { kind in Button { action(kind) } label: { HStack { Image(systemName: kind == .png ? "photo" : kind == .svg ? "point.3.connected.trianglepath.dotted" : "doc.richtext"); Text(kind.rawValue).font(.headline); Spacer(); Image(systemName: "square.and.arrow.up") } }.padding(.vertical, 8) }.navigationTitle("Экспорт").toolbar { Button("Отмена") { dismiss() } } } } }
struct ShareSheet: UIViewControllerRepresentable { let items: [Any]; func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }; func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {} }

import SwiftUI
import PhotosUI
import UIKit

struct EditorView: View {
    @State private var document = LetteringDocument()
    @State private var selectedID: UUID?
    @State private var mode: EditorMode = .twoD
    @State private var section: InspectorSection = .text
    @State private var rendered = false
    @State private var photoItem: PhotosPickerItem?
    @State private var facadeImage: UIImage?
    @State private var showInspector = true
    @State private var dragOrigin = CGPoint.zero

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                topBar
                workspace
                if showInspector { inspector }
            }
            .background(Color(red: 0.055, green: 0.06, blue: 0.075).ignoresSafeArea())
            .navigationBarHidden(true)
            .preferredColorScheme(.dark)
            .onAppear {
                restore()
                selectedID = selectedID ?? document.layers.first?.id
            }
            .onChange(of: document) { _, _ in save() }
            .task(id: photoItem) { await loadFacade() }
        }
    }

    private var topBar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("COLORIZE DESIGN")
                        .font(.caption.bold())
                        .foregroundStyle(.blue)
                    Text("Вывески")
                        .font(.headline)
                }
                Spacer()

                PhotosPicker(selection: $photoItem, matching: .images) {
                    Image(systemName: "photo.on.rectangle")
                }
                .buttonStyle(.bordered)

                if mode != .twoD {
                    Button {
                        withAnimation(.snappy) { rendered.toggle() }
                    } label: {
                        Label(rendered ? "Render ON" : "Render", systemImage: rendered ? "sparkles" : "cube")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(rendered ? .blue : .gray)
                }

                Button {
                    withAnimation(.snappy) { showInspector.toggle() }
                } label: {
                    Image(systemName: "slider.horizontal.3")
                }
                .buttonStyle(.bordered)
            }

            Picker("Режим", selection: $mode) {
                ForEach(EditorMode.allCases) { item in
                    Text(item.rawValue).tag(item)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: mode) { _, newMode in
                if newMode == .twoD { rendered = false }
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(.ultraThinMaterial)
    }

    @ViewBuilder private var workspace: some View {
        GeometryReader { proxy in
            ZStack {
                Color.black.opacity(0.18)
                if mode == .twoD {
                    twoDCanvas
                        .padding(12)
                } else {
                    Sign3DView(
                        document: document,
                        selectedID: selectedID,
                        orbitEnabled: mode == .threeDView,
                        rendered: rendered,
                        facadeImage: facadeImage
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .padding(12)
                    .overlay(alignment: .topLeading) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(mode == .threeD ? "3D · фиксированная камера" : "3D View · свободная камера")
                                .font(.caption.bold())
                            Text(rendered ? "PBR материалы · тени · подсветка" : "Быстрый Solid без финального рендера")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        .padding(10)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                        .padding(24)
                    }
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
    }

    private var twoDCanvas: some View {
        GeometryReader { proxy in
            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.white)

                if let facadeImage {
                    Image(uiImage: facadeImage)
                        .resizable()
                        .scaledToFit()
                        .opacity(document.facadeOpacity)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }

                ForEach(document.layers) { item in
                    if !item.isHidden {
                        Text(item.text)
                            .font(.custom(item.fontName, size: CGFloat(item.fontSize)))
                            .fontWeight(.bold)
                            .tracking(CGFloat(item.tracking))
                            .foregroundStyle(Color(hex: item.fillHex))
                            .shadow(
                                color: Color(hex: item.shadowHex).opacity(item.shadowOpacity),
                                radius: CGFloat(item.shadowBlur),
                                x: CGFloat(item.shadowX),
                                y: CGFloat(item.shadowY)
                            )
                            .scaleEffect(x: item.scale * item.widthScale, y: item.scale)
                            .rotationEffect(.degrees(item.rotation))
                            .offset(x: item.x, y: item.y)
                            .opacity(item.opacity)
                            .overlay {
                                if selectedID == item.id {
                                    RoundedRectangle(cornerRadius: 6)
                                        .stroke(.blue, style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
                                        .padding(-10)
                                }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture { selectedID = item.id }
                            .gesture(item.isLocked ? nil : dragGesture(item.id))
                    }
                }

                VStack {
                    HStack {
                        Label("2D", systemImage: "square.on.square")
                            .font(.caption.bold())
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(.ultraThinMaterial, in: Capsule())
                        Spacer()
                        if facadeImage != nil {
                            Text("Фасад не изменяется рендером")
                                .font(.caption2)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(.ultraThinMaterial, in: Capsule())
                        }
                    }
                    Spacer()
                }
                .padding(12)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private func dragGesture(_ id: UUID) -> some Gesture {
        DragGesture()
            .onChanged { value in
                guard let i = index(id) else { return }
                if value.translation == .zero {
                    dragOrigin = CGPoint(x: document.layers[i].x, y: document.layers[i].y)
                }
                selectedID = id
                document.layers[i].x = dragOrigin.x + value.translation.width
                document.layers[i].y = dragOrigin.y + value.translation.height
            }
    }

    private var inspector: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 5) {
                    ForEach(InspectorSection.allCases) { tab in
                        Button {
                            section = tab
                        } label: {
                            VStack(spacing: 3) {
                                Image(systemName: tab.symbol)
                                Text(tab.rawValue).font(.caption2)
                            }
                            .frame(width: 68, height: 48)
                            .foregroundStyle(section == tab ? .white : .secondary)
                            .background(section == tab ? .blue : .clear, in: RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
                .padding(8)
            }
            Divider()
            ScrollView {
                controls.padding(14)
            }
            .frame(maxHeight: 245)
        }
        .background(.ultraThinMaterial)
    }

    @ViewBuilder private var controls: some View {
        if selectedLayer == nil && section != .layers && section != .facade && section != .lighting {
            Text("Выберите надпись на холсте")
                .foregroundStyle(.secondary)
                .padding(24)
        } else {
            switch section {
            case .text: textControls
            case .font: fontControls
            case .curves: curvesControls
            case .style: styleControls
            case .transform: transformControls
            case .geometry: geometryControls
            case .material: materialControls
            case .lighting: lightingControls
            case .facade: facadeControls
            case .layers: layersControls
            }
        }
    }

    private var textControls: some View {
        VStack(spacing: 12) {
            TextField("Текст вывески", text: layerBinding(\.text))
                .textFieldStyle(.roundedBorder)
            HStack {
                Button("ВЕРХНИЙ") { setText { $0.uppercased() } }
                Button("нижний") { setText { $0.lowercased() } }
                Button("Каждое Слово") { setText { $0.capitalized } }
            }
            .buttonStyle(.bordered)
        }
    }

    private var fontControls: some View {
        VStack(spacing: 12) {
            TextField("Название шрифта", text: layerBinding(\.fontName))
                .textFieldStyle(.roundedBorder)
            valueSlider("Размер", value: layerBinding(\.fontSize), range: 16...220, suffix: " pt")
            valueSlider("Ширина", value: layerBinding(\.widthScale), range: 0.45...2.0, suffix: "%", multiplier: 100)
            valueSlider("Межбуквенный", value: layerBinding(\.tracking), range: -8...36, suffix: "")
        }
    }

    private var curvesControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Кривые", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                .font(.headline)
            Text("В первой сборке 2D-геометрия текста остаётся редактируемым текстом. Преобразование в узлы будет следующим модулем, чтобы не подменять настоящие кривые имитацией.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var styleControls: some View {
        VStack(spacing: 12) {
            colorField("Заливка", value: layerBinding(\.fillHex))
            colorField("Тень", value: layerBinding(\.shadowHex))
            valueSlider("Прозрачность тени", value: layerBinding(\.shadowOpacity), range: 0...1, suffix: "%", multiplier: 100)
            valueSlider("Размытие", value: layerBinding(\.shadowBlur), range: 0...40, suffix: "")
        }
    }

    private var transformControls: some View {
        VStack(spacing: 12) {
            HStack {
                Button("По центру") {
                    set(\.x, 0)
                    set(\.y, 0)
                }
                Button("Копия", action: duplicate)
                Button("Удалить", role: .destructive, action: remove)
            }
            .buttonStyle(.bordered)
            valueSlider("Масштаб", value: layerBinding(\.scale), range: 0.2...4, suffix: "%", multiplier: 100)
            valueSlider("Поворот", value: layerBinding(\.rotation), range: -180...180, suffix: "°")
        }
    }

    private var geometryControls: some View {
        VStack(spacing: 12) {
            valueSlider("Глубина буквы", value: layerBinding(\.depthMM), range: 10...200, suffix: " мм")
            Text("В 3D глубина строится физической экструзией геометрии, а не плоской тенью.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var materialControls: some View {
        VStack(spacing: 12) {
            Picker("Материал", selection: layerBinding(\.material)) {
                ForEach(SignMaterialPreset.allCases) { item in
                    Text(item.rawValue).tag(item)
                }
            }
            .pickerStyle(.menu)
            colorField("Лицевая часть", value: layerBinding(\.faceHex))
            colorField("Боковина", value: layerBinding(\.sideHex))
            colorField("Задняя часть", value: layerBinding(\.backHex))
        }
    }

    private var lightingControls: some View {
        VStack(spacing: 12) {
            if selectedLayer != nil {
                Toggle("Подсветка буквы", isOn: layerBinding(\.signLightEnabled))
                Picker("Тип подсветки", selection: layerBinding(\.signLightMode)) {
                    ForEach(SignLightMode.allCases) { item in
                        Text(item.rawValue).tag(item)
                    }
                }
                .pickerStyle(.segmented)
                valueSlider("Яркость вывески", value: layerBinding(\.signLightIntensity), range: 0...1, suffix: "%", multiplier: 100)
                valueSlider("Температура", value: layerBinding(\.signLightKelvin), range: 2500...8000, suffix: " K")
            }
            Divider()
            valueSlider("Освещение сцены", value: $document.sceneLightIntensity, range: 0.15...2.0, suffix: "%", multiplier: 100)
            valueSlider("Направление", value: $document.sceneLightAzimuth, range: -180...180, suffix: "°")
            valueSlider("Высота света", value: $document.sceneLightElevation, range: 5...85, suffix: "°")
            Toggle("Тень", isOn: $document.shadowEnabled)
        }
    }

    private var facadeControls: some View {
        VStack(spacing: 12) {
            PhotosPicker(selection: $photoItem, matching: .images) {
                Label(facadeImage == nil ? "Импортировать фасад" : "Заменить фасад", systemImage: "photo")
            }
            .buttonStyle(.borderedProminent)
            valueSlider("Прозрачность фасада", value: $document.facadeOpacity, range: 0.2...1, suffix: "%", multiplier: 100)
            if facadeImage != nil {
                Button("Убрать фасад", role: .destructive) {
                    facadeImage = nil
                    photoItem = nil
                }
            }
            Text("Фото фасада используется как фон. При включении Render его исходная текстура не перерисовывается.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var layersControls: some View {
        VStack(spacing: 8) {
            HStack {
                Button {
                    addText()
                } label: {
                    Label("Добавить текст", systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
                Spacer()
            }
            ForEach(document.layers.reversed()) { item in
                HStack {
                    Button {
                        selectedID = item.id
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name).bold()
                            Text(item.text).font(.caption).lineLimit(1).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    Button { toggle(item.id, \.isHidden) } label: {
                        Image(systemName: item.isHidden ? "eye.slash" : "eye")
                    }
                    Button { toggle(item.id, \.isLocked) } label: {
                        Image(systemName: item.isLocked ? "lock.fill" : "lock.open")
                    }
                }
                .padding(10)
                .background(selectedID == item.id ? .blue.opacity(0.2) : .white.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private func valueSlider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, suffix: String, multiplier: Double = 1) -> some View {
        VStack(spacing: 5) {
            HStack {
                Text(title)
                Spacer()
                Text("\(Int(value.wrappedValue * multiplier))\(suffix)")
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            Slider(value: value, in: range)
        }
    }

    private func colorField(_ title: String, value: Binding<String>) -> some View {
        HStack {
            Text(title)
            Spacer()
            Circle()
                .fill(Color(hex: value.wrappedValue))
                .frame(width: 26, height: 26)
                .overlay(Circle().stroke(.white.opacity(0.25)))
            TextField("#FFFFFF", text: value)
                .frame(width: 96)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.characters)
        }
    }

    private var selectedLayer: LetteringLayer? {
        guard let i = index(selectedID) else { return nil }
        return document.layers[i]
    }

    private func index(_ id: UUID?) -> Int? {
        guard let id else { return nil }
        return document.layers.firstIndex { $0.id == id }
    }

    private func layerBinding<T>(_ keyPath: WritableKeyPath<LetteringLayer, T>) -> Binding<T> {
        Binding(
            get: {
                guard let i = index(selectedID) else { return LetteringLayer()[keyPath: keyPath] }
                return document.layers[i][keyPath: keyPath]
            },
            set: { newValue in
                guard let i = index(selectedID) else { return }
                document.layers[i][keyPath: keyPath] = newValue
            }
        )
    }

    private func set<T>(_ keyPath: WritableKeyPath<LetteringLayer, T>, _ value: T) {
        guard let i = index(selectedID) else { return }
        document.layers[i][keyPath: keyPath] = value
    }

    private func setText(_ transform: (String) -> String) {
        guard let i = index(selectedID) else { return }
        document.layers[i].text = transform(document.layers[i].text)
    }

    private func addText() {
        var layer = LetteringLayer()
        layer.id = UUID()
        layer.name = "Надпись \(document.layers.count + 1)"
        layer.text = "НОВАЯ НАДПИСЬ"
        layer.y = Double(document.layers.count * 28)
        document.layers.append(layer)
        selectedID = layer.id
        section = .text
    }

    private func duplicate() {
        guard var layer = selectedLayer else { return }
        layer.id = UUID()
        layer.name += " копия"
        layer.x += 28
        layer.y += 28
        document.layers.append(layer)
        selectedID = layer.id
    }

    private func remove() {
        guard let i = index(selectedID) else { return }
        document.layers.remove(at: i)
        selectedID = document.layers.last?.id
    }

    private func toggle(_ id: UUID, _ keyPath: WritableKeyPath<LetteringLayer, Bool>) {
        guard let i = index(id) else { return }
        document.layers[i][keyPath: keyPath].toggle()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(document) {
            UserDefaults.standard.set(data, forKey: "ColorizeDesignV1")
        }
    }

    private func restore() {
        if let data = UserDefaults.standard.data(forKey: "ColorizeDesignV1"),
           let saved = try? JSONDecoder().decode(LetteringDocument.self, from: data) {
            document = saved
        }
        if document.layers.isEmpty { document.layers = [LetteringLayer()] }
    }

    private func loadFacade() async {
        guard let data = try? await photoItem?.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else { return }
        facadeImage = image
    }
}

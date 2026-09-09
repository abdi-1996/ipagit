import SwiftUI
import PhotosUI
import UIKit
import CoreText
import UniformTypeIdentifiers

struct EditorView: View {
    @State private var document = LetteringDocument()
    @State private var selectedID: UUID?
    @State private var section: InspectorSection = .text
    @State private var displayMode: DisplayMode = .twoD
    @State private var photoItem: PhotosPickerItem?
    @State private var facadeImage: UIImage?
    @State private var showInspector = true
    @State private var showFontImporter = false

    // Viewport navigation. These values never change the real object geometry.
    @State private var canvasZoom: CGFloat = 1
    @State private var canvasPan: CGSize = .zero
    @State private var panGestureOrigin: CGSize?
    @State private var zoomGestureOrigin: CGFloat?
    @State private var workspaceSize: CGSize = .zero
    @State private var viewportInitialized = false

    // Letter movement.
    @State private var activeDragID: UUID?
    @State private var dragOrigin = CGPoint.zero

    // Facade movement is separate from workspace navigation.
    @State private var editFacade = false
    @State private var facadeOffset: CGSize = .zero
    @State private var facadeScale: Double = 1
    @State private var facadeDragOrigin: CGSize?

    private enum DisplayMode {
        case twoD, solid3D, render, view3D
    }

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
            .fileImporter(isPresented: $showFontImporter, allowedContentTypes: [.font]) { result in
                importFont(result)
            }
        }
    }

    private var topBar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 7) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("COLORIZE DESIGN")
                        .font(.caption.bold())
                        .foregroundStyle(.blue)
                    Text("Вывески").font(.headline)
                }
                Spacer(minLength: 4)
                modeButton("3D", icon: "cube", mode: .solid3D)
                modeButton("Render", icon: "sparkles", mode: .render)
                modeButton("3D View", icon: "rotate.3d", mode: .view3D)
                Button {
                    withAnimation(.snappy) { showInspector.toggle() }
                } label: {
                    Image(systemName: "slider.horizontal.3")
                }
                .buttonStyle(.bordered)
            }

            HStack(spacing: 8) {
                Button { displayMode = .twoD } label: {
                    Label("2D", systemImage: "square.on.square")
                }
                .buttonStyle(.borderedProminent)
                .tint(displayMode == .twoD ? .blue : .gray)

                PhotosPicker(selection: $photoItem, matching: .images) {
                    Label("Фасад", systemImage: "photo.on.rectangle")
                }
                .buttonStyle(.bordered)

                Button { fitCanvas() } label: {
                    Image(systemName: "viewfinder")
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Показать весь лист")

                Spacer()
                Text("\(Int(canvasZoom * 100))%")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }

    private func modeButton(_ title: String, icon: String, mode: DisplayMode) -> some View {
        Button {
            displayMode = displayMode == mode ? .twoD : mode
        } label: {
            Label(title, systemImage: icon)
        }
        .buttonStyle(.borderedProminent)
        .tint(displayMode == mode ? .blue : .gray)
    }

    private var workspace: some View {
        GeometryReader { proxy in
            ZStack {
                Color(red: 0.11, green: 0.115, blue: 0.13)
                    .contentShape(Rectangle())
                    .gesture(displayMode == .twoD ? canvasPanGesture : nil)

                if displayMode == .twoD {
                    artboard
                        .scaleEffect(canvasZoom)
                        .offset(canvasPan)
                        .shadow(color: .black.opacity(0.4), radius: 12, y: 6)
                } else {
                    Sign3DView(
                        document: document,
                        selectedID: selectedID,
                        orbitContext: displayMode == .view3D,
                        cameraControlEnabled: displayMode == .view3D,
                        rendered: displayMode == .render,
                        facadeImage: facadeImage,
                        facadeOffset: facadeOffset,
                        facadeScale: facadeScale,
                        viewportPan: canvasPan,
                        viewportZoom: Double(canvasZoom)
                    )
                    .allowsHitTesting(displayMode == .view3D)
                    .overlay(alignment: .topLeading) {
                        Text(modeHint)
                            .font(.caption.bold())
                            .padding(.horizontal, 9)
                            .padding(.vertical, 7)
                            .background(.ultraThinMaterial, in: Capsule())
                            .padding(12)
                    }
                }
            }
            .clipped()
            .simultaneousGesture(displayMode == .twoD ? canvasZoomGesture : nil)
            .onAppear {
                workspaceSize = proxy.size
                if !viewportInitialized {
                    viewportInitialized = true
                    fitCanvas(in: proxy.size)
                }
            }
            .onChange(of: proxy.size) { _, newSize in
                workspaceSize = newSize
            }
        }
    }

    private var modeHint: String {
        switch displayMode {
        case .twoD: return "2D"
        case .solid3D: return "3D · тот же кадр · объём + тень"
        case .render: return "Render · тот же кадр · материалы + свет"
        case .view3D: return "3D View · старт из того же кадра"
        }
    }

    private var artboard: some View {
        ZStack {
            Rectangle().fill(Color.white)

            if let facadeImage {
                Image(uiImage: facadeImage)
                    .resizable()
                    .scaledToFit()
                    .frame(width: document.canvasWidth, height: document.canvasHeight)
                    .scaleEffect(facadeScale)
                    .offset(facadeOffset)
                    .opacity(document.facadeOpacity)
                    .contentShape(Rectangle())
                    .gesture(editFacade ? facadeDragGesture : nil)
            }

            ForEach(document.layers) { item in
                if !item.isHidden {
                    Text(item.text)
                        .font(.custom(item.fontName, size: CGFloat(item.fontSize)))
                        .tracking(CGFloat(item.tracking))
                        .foregroundStyle(Color(hex: item.fillHex))
                        .scaleEffect(x: item.scale * item.widthScale, y: item.scale)
                        .rotationEffect(.degrees(item.rotation))
                        .offset(x: item.x, y: item.y)
                        .opacity(item.opacity)
                        .overlay {
                            if selectedID == item.id {
                                Rectangle()
                                    .stroke(.blue, style: StrokeStyle(lineWidth: 1 / max(canvasZoom, 0.1), dash: [6, 4]))
                                    .padding(-8 / max(canvasZoom, 0.1))
                            }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            if !editFacade { selectedID = item.id }
                        }
                        .gesture(item.isLocked || editFacade ? nil : layerDrag(item.id))
                }
            }
        }
        .frame(width: document.canvasWidth, height: document.canvasHeight)
        .clipped()
    }

    private var canvasPanGesture: some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                if panGestureOrigin == nil { panGestureOrigin = canvasPan }
                guard let origin = panGestureOrigin else { return }
                canvasPan = CGSize(
                    width: origin.width + value.translation.width,
                    height: origin.height + value.translation.height
                )
            }
            .onEnded { _ in panGestureOrigin = nil }
    }

    private var canvasZoomGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                if zoomGestureOrigin == nil { zoomGestureOrigin = canvasZoom }
                guard let origin = zoomGestureOrigin else { return }
                canvasZoom = min(max(origin * value, 0.08), 6)
            }
            .onEnded { _ in zoomGestureOrigin = nil }
    }

    private func layerDrag(_ id: UUID) -> some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                guard let i = index(id) else { return }
                if activeDragID != id {
                    activeDragID = id
                    dragOrigin = CGPoint(x: document.layers[i].x, y: document.layers[i].y)
                }
                selectedID = id
                document.layers[i].x = dragOrigin.x + value.translation.width / max(canvasZoom, 0.08)
                document.layers[i].y = dragOrigin.y + value.translation.height / max(canvasZoom, 0.08)
            }
            .onEnded { _ in activeDragID = nil }
    }

    private var facadeDragGesture: some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                if facadeDragOrigin == nil { facadeDragOrigin = facadeOffset }
                guard let origin = facadeDragOrigin else { return }
                facadeOffset = CGSize(
                    width: origin.width + value.translation.width / max(canvasZoom, 0.08),
                    height: origin.height + value.translation.height / max(canvasZoom, 0.08)
                )
            }
            .onEnded { _ in facadeDragOrigin = nil }
    }

    private func fitCanvas() {
        fitCanvas(in: workspaceSize)
    }

    private func fitCanvas(in size: CGSize) {
        guard size.width > 80, size.height > 80 else { return }
        let zx = (size.width - 32) / document.canvasWidth
        let zy = (size.height - 32) / document.canvasHeight
        canvasZoom = min(max(min(zx, zy), 0.08), 3)
        canvasPan = .zero
        panGestureOrigin = nil
        zoomGestureOrigin = nil
    }

    private func focusSelected() {
        guard let i = index(selectedID) else { return }
        canvasPan = CGSize(
            width: -document.layers[i].x * canvasZoom,
            height: -document.layers[i].y * canvasZoom
        )
    }

    private var inspector: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 5) {
                    ForEach(InspectorSection.allCases) { tab in
                        Button { section = tab } label: {
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
            ScrollView { controls.padding(14) }
                .frame(maxHeight: 245)
        }
        .background(.ultraThinMaterial)
    }

    @ViewBuilder private var controls: some View {
        switch section {
        case .text:
            TextField("Текст вывески", text: layerBinding(\.text))
                .textFieldStyle(.roundedBorder)

        case .font:
            VStack(spacing: 10) {
                TextField("Название шрифта", text: layerBinding(\.fontName))
                    .textFieldStyle(.roundedBorder)
                Button { showFontImporter = true } label: {
                    Label("Импорт TTF / OTF", systemImage: "square.and.arrow.down")
                }
                .buttonStyle(.bordered)
                valueSlider("Размер", value: layerBinding(\.fontSize), range: 16...300, suffix: " pt")
                valueSlider("Межбуквенный", value: layerBinding(\.tracking), range: -8...40, suffix: "")
            }

        case .curves:
            VStack(alignment: .leading, spacing: 8) {
                Label("Кривые", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                    .font(.headline)
                Text("3D строится прямо из редактируемого текста, в том числе из импортированного TTF/OTF. Преобразование в кривые нужно только для ручной правки узлов.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

        case .style:
            VStack(spacing: 10) {
                colorField("Цвет", value: layerBinding(\.fillHex))
                colorField("Тень", value: layerBinding(\.shadowHex))
                valueSlider("Прозрачность тени", value: layerBinding(\.shadowOpacity), range: 0...1, suffix: "%", multiplier: 100)
            }

        case .transform:
            VStack(spacing: 10) {
                HStack {
                    Button("Букву в центр") {
                        set(\.x, 0)
                        set(\.y, 0)
                    }
                    Button("Найти") { focusSelected() }
                }
                .buttonStyle(.bordered)
                valueSlider("Масштаб", value: layerBinding(\.scale), range: 0.2...4, suffix: "%", multiplier: 100)
                valueSlider("Поворот", value: layerBinding(\.rotation), range: -180...180, suffix: "°")
            }

        case .geometry:
            valueSlider("Глубина буквы", value: layerBinding(\.depthMM), range: 10...200, suffix: " мм")

        case .material:
            VStack(spacing: 10) {
                Picker("Материал", selection: layerBinding(\.material)) {
                    ForEach(SignMaterialPreset.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.menu)
                colorField("Лицевая часть", value: layerBinding(\.faceHex))
                colorField("Боковина", value: layerBinding(\.sideHex))
            }

        case .lighting:
            VStack(spacing: 10) {
                Toggle("Подсветка буквы", isOn: layerBinding(\.signLightEnabled))
                valueSlider("Яркость", value: layerBinding(\.signLightIntensity), range: 0...1, suffix: "%", multiplier: 100)
                valueSlider("Освещение сцены", value: $document.sceneLightIntensity, range: 0.15...2, suffix: "%", multiplier: 100)
                valueSlider("Направление", value: $document.sceneLightAzimuth, range: -180...180, suffix: "°")
                Toggle("Тень", isOn: $document.shadowEnabled)
            }

        case .facade:
            VStack(spacing: 10) {
                PhotosPicker(selection: $photoItem, matching: .images) {
                    Label(facadeImage == nil ? "Импортировать фасад" : "Заменить фасад", systemImage: "photo")
                }
                .buttonStyle(.borderedProminent)
                Toggle("Перемещать фасад", isOn: $editFacade)
                HStack {
                    Button("Фасад в центр") { facadeOffset = .zero }
                    Button("Сбросить размер") { facadeScale = 1 }
                }
                .buttonStyle(.bordered)
                valueSlider("Размер фасада", value: $facadeScale, range: 0.2...4, suffix: "%", multiplier: 100)
                valueSlider("Прозрачность", value: $document.facadeOpacity, range: 0.2...1, suffix: "%", multiplier: 100)
            }

        case .layers:
            VStack(spacing: 8) {
                HStack {
                    Button { addText() } label: {
                        Label("Добавить текст", systemImage: "plus")
                    }
                    .buttonStyle(.borderedProminent)
                    Spacer()
                }
                ForEach(document.layers.reversed()) { item in
                    HStack {
                        Button { selectedID = item.id } label: {
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
                    .padding(8)
                    .background(selectedID == item.id ? .blue.opacity(0.2) : .white.opacity(0.05), in: RoundedRectangle(cornerRadius: 8))
                }
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
            Circle().fill(Color(hex: value.wrappedValue)).frame(width: 26, height: 26)
            TextField("#FFFFFF", text: value)
                .frame(width: 96)
                .textFieldStyle(.roundedBorder)
        }
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

    private func toggle(_ id: UUID, _ keyPath: WritableKeyPath<LetteringLayer, Bool>) {
        guard let i = index(id) else { return }
        document.layers[i][keyPath: keyPath].toggle()
    }

    private func addText() {
        var layer = LetteringLayer()
        layer.id = UUID()
        layer.name = "Надпись \(document.layers.count + 1)"
        layer.text = "НОВАЯ НАДПИСЬ"
        document.layers.append(layer)
        selectedID = layer.id
        section = .text
    }

    private func importFont(_ result: Result<URL, Error>) {
        guard case .success(let url) = result else { return }
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }

        var error: Unmanaged<CFError>?
        guard CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) else { return }
        guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [[CFString: Any]],
              let postScriptName = descriptors.first?[kCTFontNameAttribute] as? String else { return }
        set(\.fontName, postScriptName)
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
        facadeOffset = .zero
        facadeScale = 1
    }
}

import SwiftUI
import PhotosUI
import UIKit

struct EditorView: View {
    @State private var project = SignProject()
    @State private var placement = PlacementState()
    @State private var photoItem: PhotosPickerItem?
    @State private var facadeImage: UIImage?
    @State private var lastOffset: CGSize = .zero
    @State private var lastScale: CGFloat = 1
    @State private var lastRotation = Angle.zero
    @State private var isNight = false
    @State private var showInspector = true
    @State private var show3D = false
    @State private var showShare = false
    @State private var exportImage: UIImage?
    @State private var didRestore = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 0.035, green: 0.045, blue: 0.065).ignoresSafeArea()
                VStack(spacing: 12) { canvas; bottomBar }
                    .padding(.horizontal, 12).padding(.bottom, 8)
            }
            .navigationTitle("Colorize Sign 3D · 2.0")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    PhotosPicker(selection: $photoItem, matching: .images) { Label("Фасад", systemImage: "photo.on.rectangle") }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { project.showGrid.toggle() } label: { Image(systemName: project.showGrid ? "grid.circle.fill" : "grid.circle") }
                    Button { isNight.toggle() } label: { Image(systemName: isNight ? "moon.stars.fill" : "sun.max.fill") }
                    Button { show3D = true } label: { Label("3D", systemImage: "cube.transparent") }
                    Button(action: exportMockup) { Image(systemName: "square.and.arrow.up") }
                    Button { withAnimation { showInspector.toggle() } } label: { Image(systemName: "slider.horizontal.3") }
                }
            }
            .task(id: photoItem) { await loadPhoto() }
            .onAppear { restoreProject() }
            .onChange(of: project) { _, _ in saveProject() }
            .onChange(of: placement) { _, _ in saveProject() }
            .sheet(isPresented: $show3D) {
                NavigationStack {
                    Sign3DView(project: project, isNight: isNight)
                        .navigationTitle("3D-просмотр").navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { show3D = false } } }
                }
            }
            .sheet(isPresented: $showShare) { if let exportImage { ShareSheet(items: [exportImage]) } }
        }
    }

    private var canvas: some View {
        GeometryReader { proxy in
            composition(size: proxy.size, editable: true)
                .frame(width: proxy.size.width, height: proxy.size.height)
                .clipped().clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.12)))
        }
    }

    @ViewBuilder private func composition(size: CGSize, editable: Bool) -> some View {
        ZStack {
            facadeBackground
            if isNight { Color.black.opacity(0.56) }
            if project.showGrid { GridOverlay().stroke(.white.opacity(0.22), lineWidth: 0.7) }
            if editable {
                positionedSign(editable: true)
                    .gesture(moveGesture.simultaneously(with: magnifyGesture).simultaneously(with: rotateGesture))
            } else {
                positionedSign(editable: false)
            }
            if editable {
                VStack {
                    HStack {
                        Label(isNight ? "НОЧЬ" : "ДЕНЬ", systemImage: isNight ? "moon.fill" : "sun.max.fill")
                            .font(.caption.bold()).padding(.horizontal, 10).padding(.vertical, 6).background(.ultraThinMaterial, in: Capsule())
                        Spacer()
                        Text("\(Int(project.widthCM)) × \(Int(project.heightCM)) см")
                            .font(.caption.monospacedDigit()).padding(.horizontal, 10).padding(.vertical, 6).background(.ultraThinMaterial, in: Capsule())
                    }
                    Spacer()
                }.padding(12)
            }
        }
    }

    private func positionedSign(editable: Bool) -> some View {
        signOverlay(editable: editable)
            .offset(x: CGFloat(placement.x), y: CGFloat(placement.y))
            .scaleEffect(CGFloat(placement.scale))
            .rotationEffect(.degrees(placement.rotation))
    }

    @ViewBuilder private var facadeBackground: some View {
        if project.facadeFinish == .photo, let facadeImage {
            Image(uiImage: facadeImage).resizable().scaledToFill()
        } else {
            switch project.facadeFinish {
            case .brick: BrickBackground()
            case .concrete: Color(red: 0.42, green: 0.44, blue: 0.46).overlay(.black.opacity(0.08))
            case .dark: LinearGradient(colors: [.init(white: 0.18), .init(white: 0.05)], startPoint: .topLeading, endPoint: .bottomTrailing)
            case .photo: LinearGradient(colors: [.gray.opacity(0.55), .black], startPoint: .top, endPoint: .bottom)
            }
        }
    }

    private func signOverlay(editable: Bool) -> some View {
        let glow = project.lighting != .none && isNight
        return ZStack {
            if project.hasPanel {
                RoundedRectangle(cornerRadius: CGFloat(project.panelCornerRadius))
                    .fill(Color(hex: project.panelHex)).shadow(color: .black.opacity(0.5), radius: 5, y: 4).padding(3)
            }
            if project.depthCM > 0 { signText.foregroundStyle(.black.opacity(0.85)).offset(x: project.depthCM / 2.5, y: project.depthCM / 2.5) }
            signText.foregroundStyle(Color(hex: project.faceHex))
                .shadow(color: glow ? Color(hex: project.lightHex).opacity(project.brightness) : .black.opacity(0.45), radius: glow ? project.haloRadius : 3)
                .shadow(color: glow ? Color(hex: project.lightHex).opacity(project.brightness * 0.7) : .clear, radius: project.haloRadius * 1.7)
        }
        .padding(16)
        .overlay { if editable { RoundedRectangle(cornerRadius: 12).stroke(.cyan.opacity(0.8), style: StrokeStyle(lineWidth: 1, dash: [5])) } }
        .rotation3DEffect(.degrees(project.tiltX), axis: (x: 1, y: 0, z: 0), perspective: 0.45)
        .rotation3DEffect(.degrees(project.tiltY), axis: (x: 0, y: 1, z: 0), perspective: 0.45)
    }

    private var signText: some View {
        Text(project.text.isEmpty ? "ВЫВЕСКА" : project.text)
            .font(.system(size: 42, weight: .black, design: project.font.design).width(project.font.width))
            .tracking(project.letterSpacing).multilineTextAlignment(.center)
    }

    private var bottomBar: some View {
        Group {
            if showInspector {
                ScrollView {
                    VStack(spacing: 14) {
                        presets
                        TextField("Текст вывески", text: $project.text, axis: .vertical).textFieldStyle(.roundedBorder).lineLimit(1...3)
                        Picker("Фасад", selection: $project.facadeFinish) { ForEach(FacadeFinish.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented)
                        Picker("Материал", selection: $project.material) { ForEach(SignMaterial.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.menu)
                        Picker("Шрифт", selection: $project.font) { ForEach(SignFont.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.menu)
                        Picker("Подсветка", selection: $project.lighting) { ForEach(LightingMode.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.menu)
                        Toggle("Подложка под вывеску", isOn: $project.hasPanel)
                        Toggle("Привязка к центру", isOn: $project.snapToCenter)
                        colorRow("Цвет лицевой части", hex: $project.faceHex)
                        colorRow("Цвет подсветки", hex: $project.lightHex)
                        if project.hasPanel { colorRow("Цвет подложки", hex: $project.panelHex); dimension("Скругление", value: $project.panelCornerRadius, range: 0...40, suffix: "") }
                        dimension("Ширина", value: $project.widthCM, range: 50...1000, suffix: "см")
                        dimension("Высота", value: $project.heightCM, range: 10...300, suffix: "см")
                        dimension("Глубина", value: $project.depthCM, range: 0...30, suffix: "см")
                        dimension("Яркость", value: $project.brightness, range: 0...1, suffix: "%", multiplier: 100)
                        dimension("Ореол", value: $project.haloRadius, range: 2...60, suffix: "")
                        dimension("Интервал букв", value: $project.letterSpacing, range: -2...12, suffix: "")
                        dimension("Наклон X", value: $project.tiltX, range: -45...45, suffix: "°")
                        dimension("Наклон Y", value: $project.tiltY, range: -45...45, suffix: "°")
                        placementControls
                    }.padding(14)
                }
                .frame(maxHeight: 310).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
            } else {
                HStack { Button("Сбросить положение", action: resetPlacement); Spacer(); Text("Жесты: перемещение · масштаб · поворот").font(.caption).foregroundStyle(.secondary) }.padding(10)
            }
        }
    }

    private var presets: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack { ForEach(DesignPreset.all) { preset in Button { apply(preset) } label: { Label(preset.name, systemImage: preset.symbol).font(.caption.bold()).padding(10).background(.white.opacity(0.08), in: Capsule()) } } }
        }
    }

    private var placementControls: some View {
        VStack(spacing: 10) {
            HStack { Text("Точное положение").font(.headline); Spacer(); Button("По центру", action: resetPlacement).font(.caption) }
            dimension("X", value: $placement.x, range: -400...400, suffix: "px")
            dimension("Y", value: $placement.y, range: -400...400, suffix: "px")
            dimension("Масштаб", value: $placement.scale, range: 0.2...4, suffix: "%", multiplier: 100)
            dimension("Поворот", value: $placement.rotation, range: -180...180, suffix: "°")
        }
    }

    private func dimension(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, suffix: String, multiplier: Double = 1) -> some View {
        VStack(spacing: 5) { HStack { Text(title); Spacer(); Text("\(Int(value.wrappedValue * multiplier)) \(suffix)").monospacedDigit().foregroundStyle(.secondary) }; Slider(value: value, in: range) }
    }
    private func colorRow(_ title: String, hex: Binding<String>) -> some View {
        HStack { Text(title); Spacer(); Circle().fill(Color(hex: hex.wrappedValue)).frame(width: 24, height: 24); TextField("#FFFFFF", text: hex).textInputAutocapitalization(.characters).multilineTextAlignment(.trailing).frame(width: 90).textFieldStyle(.roundedBorder) }
    }
    private var moveGesture: some Gesture {
        DragGesture().onChanged { placement.x = Double(lastOffset.width + $0.translation.width); placement.y = Double(lastOffset.height + $0.translation.height) }
            .onEnded { _ in if project.snapToCenter { if abs(placement.x) < 14 { placement.x = 0 }; if abs(placement.y) < 14 { placement.y = 0 } }; lastOffset = CGSize(width: placement.x, height: placement.y) }
    }
    private var magnifyGesture: some Gesture { MagnificationGesture().onChanged { placement.scale = Double(min(max(lastScale * $0, 0.2), 4)) }.onEnded { _ in lastScale = CGFloat(placement.scale) } }
    private var rotateGesture: some Gesture { RotationGesture().onChanged { placement.rotation = lastRotation.degrees + $0.degrees }.onEnded { _ in lastRotation = .degrees(placement.rotation) } }

    private func apply(_ preset: DesignPreset) { project.material = preset.material; project.lighting = preset.lighting; project.faceHex = preset.faceHex; project.lightHex = preset.lightHex }
    private func resetPlacement() { withAnimation { placement = PlacementState(); lastOffset = .zero; lastScale = 1; lastRotation = .zero } }
    private func exportMockup() {
        let renderer = ImageRenderer(content: composition(size: CGSize(width: 1400, height: 900), editable: false).frame(width: 1400, height: 900))
        renderer.scale = 1
        exportImage = renderer.uiImage
        showShare = exportImage != nil
    }
    private func loadPhoto() async {
        guard let data = try? await photoItem?.loadTransferable(type: Data.self), let image = UIImage(data: data) else { return }
        facadeImage = image; project.facadeFinish = .photo
        if let jpeg = image.jpegData(compressionQuality: 0.78) { UserDefaults.standard.set(jpeg, forKey: "facadeImage") }
    }
    private func saveProject() {
        guard didRestore else { return }
        if let data = try? JSONEncoder().encode(project) { UserDefaults.standard.set(data, forKey: "signProjectV20") }
        if let data = try? JSONEncoder().encode(placement) { UserDefaults.standard.set(data, forKey: "signPlacementV20") }
    }
    private func restoreProject() {
        guard !didRestore else { return }
        let defaults = UserDefaults.standard
        if let data = defaults.data(forKey: "signProjectV20") ?? defaults.data(forKey: "signProjectV11"), let saved = try? JSONDecoder().decode(SignProject.self, from: data) { project = saved }
        if let data = defaults.data(forKey: "signPlacementV20"), let saved = try? JSONDecoder().decode(PlacementState.self, from: data) { placement = saved; lastOffset = CGSize(width: CGFloat(saved.x), height: CGFloat(saved.y)); lastScale = CGFloat(saved.scale); lastRotation = .degrees(saved.rotation) }
        if let data = defaults.data(forKey: "facadeImage") { facadeImage = UIImage(data: data) }
        didRestore = true
    }
}

struct GridOverlay: Shape {
    func path(in rect: CGRect) -> Path { var path = Path(); for i in 1..<6 { let x = rect.width * CGFloat(i) / 6; path.move(to: CGPoint(x: x, y: 0)); path.addLine(to: CGPoint(x: x, y: rect.height)) }; for i in 1..<4 { let y = rect.height * CGFloat(i) / 4; path.move(to: CGPoint(x: 0, y: y)); path.addLine(to: CGPoint(x: rect.width, y: y)) }; return path }
}

struct BrickBackground: View {
    var body: some View { Canvas { context, size in context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(red: 0.45, green: 0.19, blue: 0.12))); let h = 34.0, w = 74.0; for row in 0...Int(size.height / h) { let y = Double(row) * h; var p = Path(); p.move(to: CGPoint(x: 0, y: y)); p.addLine(to: CGPoint(x: size.width, y: y)); context.stroke(p, with: .color(.black.opacity(0.35)), lineWidth: 2); let shift = row.isMultiple(of: 2) ? 0.0 : w / 2; var x = shift; while x < size.width { var v = Path(); v.move(to: CGPoint(x: x, y: y)); v.addLine(to: CGPoint(x: x, y: y + h)); context.stroke(v, with: .color(.black.opacity(0.3)), lineWidth: 2); x += w } } } }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

extension Color {
    init(hex: String) {
        let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0; Scanner(string: clean).scanHexInt64(&value)
        self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}

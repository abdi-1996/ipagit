import SwiftUI
import PhotosUI
import UIKit

struct EditorView: View {
    @State private var document = LetteringDocument()
    @State private var selectedID: UUID?
    @State private var section: InspectorSection = .text
    @State private var displayMode: DisplayMode = .twoD
    @State private var photoItem: PhotosPickerItem?
    @State private var facadeImage: UIImage?
    @State private var showInspector = true
    @State private var canvasZoom: CGFloat = 1
    @State private var canvasPan: CGSize = .zero
    @State private var dragOrigin = CGPoint.zero
    @State private var activeDragID: UUID?

    private enum DisplayMode { case twoD, solid3D, render, view3D }

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
            .onAppear { restore(); selectedID = selectedID ?? document.layers.first?.id }
            .onChange(of: document) { _, _ in save() }
            .task(id: photoItem) { await loadFacade() }
        }
    }

    private var topBar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("COLORIZE DESIGN").font(.caption.bold()).foregroundStyle(.blue)
                    Text("Вывески").font(.headline)
                }
                Spacer()
                modeButton("3D", icon: "cube", mode: .solid3D)
                modeButton("Render", icon: "sparkles", mode: .render)
                modeButton("3D View", icon: "rotate.3d", mode: .view3D)
                Button { withAnimation(.snappy) { showInspector.toggle() } } label: {
                    Image(systemName: "slider.horizontal.3")
                }.buttonStyle(.bordered)
            }
            HStack(spacing: 10) {
                Button { displayMode = .twoD } label: {
                    Label("2D", systemImage: "square.on.square")
                }.buttonStyle(.borderedProminent).tint(displayMode == .twoD ? .blue : .gray)
                PhotosPicker(selection: $photoItem, matching: .images) {
                    Label("Фасад", systemImage: "photo.on.rectangle")
                }.buttonStyle(.bordered)
                Spacer()
                Text("\(Int(canvasZoom * 100))%").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 8).background(.ultraThinMaterial)
    }

    private func modeButton(_ title: String, icon: String, mode: DisplayMode) -> some View {
        Button { displayMode = (displayMode == mode ? .twoD : mode) } label: {
            Label(title, systemImage: icon).labelStyle(.titleAndIcon)
        }.buttonStyle(.borderedProminent).tint(displayMode == mode ? .blue : .gray)
    }

    private var workspace: some View {
        GeometryReader { proxy in
            ZStack {
                Color(red: 0.12, green: 0.125, blue: 0.14)
                if displayMode == .twoD {
                    twoDCanvas(size: proxy.size)
                } else {
                    Sign3DView(
                        document: document,
                        selectedID: selectedID,
                        orbitContext: displayMode == .view3D,
                        cameraControlEnabled: displayMode == .view3D,
                        rendered: displayMode == .render,
                        facadeImage: facadeImage,
                        facadeOffset: canvasPan,
                        facadeScale: Double(canvasZoom)
                    )
                    .allowsHitTesting(displayMode == .view3D)
                    .overlay(alignment: .topLeading) {
                        Text(displayMode == .solid3D ? "3D · тот же размер и позиция · объём + тень" : displayMode == .render ? "Render · тот же кадр · материалы + свет" : "3D View · свободное вращение")
                            .font(.caption.bold()).padding(8).background(.ultraThinMaterial, in: Capsule()).padding(12)
                    }
                }
            }
            .clipped()
        }
    }

    private func twoDCanvas(size: CGSize) -> some View {
        ZStack {
            Color.white
                .frame(width: size.width * 1.8, height: size.height * 1.8)
                .shadow(radius: 8)
            if let facadeImage {
                Image(uiImage: facadeImage).resizable().scaledToFit()
                    .frame(width: size.width * 1.6, height: size.height * 1.6)
                    .opacity(document.facadeOpacity)
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
                        .overlay { if selectedID == item.id { Rectangle().stroke(.blue, style: StrokeStyle(lineWidth: 1, dash: [5,3])).padding(-8) } }
                        .contentShape(Rectangle()).onTapGesture { selectedID = item.id }
                        .gesture(item.isLocked ? nil : layerDrag(item.id))
                }
            }
        }
        .scaleEffect(canvasZoom)
        .offset(canvasPan)
        .contentShape(Rectangle())
        .gesture(canvasGesture)
    }

    private var canvasGesture: some Gesture {
        MagnificationGesture().onChanged { value in canvasZoom = min(max(value, 0.25), 5) }
            .simultaneously(with: DragGesture(minimumDistance: 15).onChanged { value in
                if selectedID == nil { canvasPan = value.translation }
            })
    }

    private func layerDrag(_ id: UUID) -> some Gesture {
        DragGesture().onChanged { value in
            guard let i = index(id) else { return }
            if activeDragID != id { activeDragID = id; dragOrigin = CGPoint(x: document.layers[i].x, y: document.layers[i].y) }
            selectedID = id
            document.layers[i].x = dragOrigin.x + value.translation.width / canvasZoom
            document.layers[i].y = dragOrigin.y + value.translation.height / canvasZoom
        }.onEnded { _ in activeDragID = nil }
    }

    private var inspector: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 5) { ForEach(InspectorSection.allCases) { tab in
                    Button { section = tab } label: {
                        VStack(spacing: 3) { Image(systemName: tab.symbol); Text(tab.rawValue).font(.caption2) }
                            .frame(width: 68, height: 48).foregroundStyle(section == tab ? .white : .secondary)
                            .background(section == tab ? .blue : .clear, in: RoundedRectangle(cornerRadius: 10))
                    }
                }}.padding(8)
            }
            Divider()
            ScrollView { controls.padding(14) }.frame(maxHeight: 245)
        }.background(.ultraThinMaterial)
    }

    @ViewBuilder private var controls: some View {
        switch section {
        case .text:
            TextField("Текст вывески", text: layerBinding(\.text)).textFieldStyle(.roundedBorder)
        case .font:
            VStack { TextField("Шрифт (системный / TTF / OTF)", text: layerBinding(\.fontName)).textFieldStyle(.roundedBorder); valueSlider("Размер", value: layerBinding(\.fontSize), range: 16...300, suffix: " pt") }
        case .curves:
            VStack(alignment: .leading) { Label("Преобразовать в кривые", systemImage: "point.topleft.down.to.point.bottomright.curvepath").font(.headline); Text("3D работает и с редактируемым текстом. В кривые переводить нужно только для ручного редактирования узлов.").font(.caption).foregroundStyle(.secondary) }
        case .style:
            VStack { colorField("Цвет", value: layerBinding(\.fillHex)); colorField("Тень", value: layerBinding(\.shadowHex)); valueSlider("Тень", value: layerBinding(\.shadowOpacity), range: 0...1, suffix: "%", multiplier: 100) }
        case .transform:
            VStack { valueSlider("Масштаб", value: layerBinding(\.scale), range: 0.2...4, suffix: "%", multiplier: 100); valueSlider("Поворот", value: layerBinding(\.rotation), range: -180...180, suffix: "°") }
        case .geometry:
            valueSlider("Глубина буквы", value: layerBinding(\.depthMM), range: 10...200, suffix: " мм")
        case .material:
            VStack { Picker("Материал", selection: layerBinding(\.material)) { ForEach(SignMaterialPreset.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.menu); colorField("Лицевая часть", value: layerBinding(\.faceHex)); colorField("Боковина", value: layerBinding(\.sideHex)) }
        case .lighting:
            VStack { Toggle("Подсветка буквы", isOn: layerBinding(\.signLightEnabled)); valueSlider("Яркость", value: layerBinding(\.signLightIntensity), range: 0...1, suffix: "%", multiplier: 100); valueSlider("Освещение сцены", value: $document.sceneLightIntensity, range: 0.15...2, suffix: "%", multiplier: 100); valueSlider("Направление", value: $document.sceneLightAzimuth, range: -180...180, suffix: "°"); Toggle("Тень", isOn: $document.shadowEnabled) }
        case .facade:
            VStack { PhotosPicker(selection: $photoItem, matching: .images) { Label("Импортировать фасад", systemImage: "photo") }.buttonStyle(.borderedProminent); valueSlider("Прозрачность", value: $document.facadeOpacity, range: 0.2...1, suffix: "%", multiplier: 100) }
        case .layers:
            VStack { Button { addText() } label: { Label("Добавить текст", systemImage: "plus") }.buttonStyle(.borderedProminent); ForEach(document.layers.reversed()) { item in HStack { Button { selectedID = item.id } label: { Text(item.name).bold() }; Spacer(); Button { toggle(item.id, \.isHidden) } label: { Image(systemName: item.isHidden ? "eye.slash" : "eye") }; Button { toggle(item.id, \.isLocked) } label: { Image(systemName: item.isLocked ? "lock.fill" : "lock.open") } }.padding(8).background(selectedID == item.id ? .blue.opacity(0.2) : .white.opacity(0.05), in: RoundedRectangle(cornerRadius: 8)) } }
        }
    }

    private func valueSlider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, suffix: String, multiplier: Double = 1) -> some View { VStack { HStack { Text(title); Spacer(); Text("\(Int(value.wrappedValue * multiplier))\(suffix)").monospacedDigit().foregroundStyle(.secondary) }; Slider(value: value, in: range) } }
    private func colorField(_ title: String, value: Binding<String>) -> some View { HStack { Text(title); Spacer(); Circle().fill(Color(hex: value.wrappedValue)).frame(width: 26,height:26); TextField("#FFFFFF", text:value).frame(width:96).textFieldStyle(.roundedBorder) } }
    private func index(_ id: UUID?) -> Int? { guard let id else { return nil }; return document.layers.firstIndex { $0.id == id } }
    private func layerBinding<T>(_ kp: WritableKeyPath<LetteringLayer,T>) -> Binding<T> { Binding(get: { guard let i=index(selectedID) else { return LetteringLayer()[keyPath:kp] }; return document.layers[i][keyPath:kp] }, set: { guard let i=index(selectedID) else{return}; document.layers[i][keyPath:kp]=$0 }) }
    private func toggle(_ id: UUID,_ kp: WritableKeyPath<LetteringLayer,Bool>) { guard let i=index(id) else{return}; document.layers[i][keyPath:kp].toggle() }
    private func addText() { var l=LetteringLayer(); l.id=UUID(); l.name="Надпись \(document.layers.count+1)"; l.text="НОВАЯ НАДПИСЬ"; document.layers.append(l); selectedID=l.id; section = .text }
    private func save() { if let d=try? JSONEncoder().encode(document) { UserDefaults.standard.set(d,forKey:"ColorizeDesignV1") } }
    private func restore() { if let d=UserDefaults.standard.data(forKey:"ColorizeDesignV1"), let s=try? JSONDecoder().decode(LetteringDocument.self,from:d){document=s}; if document.layers.isEmpty{document.layers=[LetteringLayer()]} }
    private func loadFacade() async { guard let data=try? await photoItem?.loadTransferable(type:Data.self), let image=UIImage(data:data) else{return}; facadeImage=image }
}

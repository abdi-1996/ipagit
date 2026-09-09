import SwiftUI
import PhotosUI
import UIKit

struct EditorView: View {
    @State private var project = SignProject()
    @State private var photoItem: PhotosPickerItem?
    @State private var facadeImage: UIImage?
    @State private var signOffset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    @State private var signScale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var signRotation = Angle.zero
    @State private var lastRotation = Angle.zero
    @State private var isNight = false
    @State private var showInspector = true
    @State private var show3D = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 0.035, green: 0.045, blue: 0.065).ignoresSafeArea()
                VStack(spacing: 12) {
                    canvas
                    bottomBar
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            }
            .navigationTitle("Colorize Sign 3D")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    PhotosPicker(selection: $photoItem, matching: .images) {
                        Label("Фасад", systemImage: "photo.on.rectangle")
                    }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { isNight.toggle() } label: {
                        Image(systemName: isNight ? "moon.stars.fill" : "sun.max.fill")
                    }
                    Button { show3D = true } label: {
                        Label("3D", systemImage: "cube.transparent")
                    }
                    Button { withAnimation { showInspector.toggle() } } label: {
                        Image(systemName: "slider.horizontal.3")
                    }
                }
            }
            .task(id: photoItem) { await loadPhoto() }
            .sheet(isPresented: $show3D) {
                NavigationStack {
                    Sign3DView(project: project, isNight: isNight)
                        .navigationTitle("3D-просмотр")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Готово") { show3D = false }
                            }
                        }
                }
            }
        }
    }

    private var canvas: some View {
        GeometryReader { proxy in
            ZStack {
                if let facadeImage {
                    Image(uiImage: facadeImage)
                        .resizable()
                        .scaledToFill()
                } else {
                    LinearGradient(colors: [.gray.opacity(0.55), .black], startPoint: .top, endPoint: .bottom)
                    VStack(spacing: 10) {
                        Image(systemName: "building.2.crop.circle")
                            .font(.system(size: 54))
                        Text("Добавьте фотографию фасада")
                            .font(.headline)
                        Text("Затем перемещайте, поворачивайте и масштабируйте вывеску жестами")
                            .font(.caption).foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }.padding(30)
                }

                if isNight { Color.black.opacity(0.56) }

                signOverlay
                    .offset(signOffset)
                    .scaleEffect(signScale)
                    .rotationEffect(signRotation)
                    .gesture(moveGesture.simultaneously(with: magnifyGesture).simultaneously(with: rotateGesture))

                VStack {
                    HStack {
                        Label(isNight ? "НОЧЬ" : "ДЕНЬ", systemImage: isNight ? "moon.fill" : "sun.max.fill")
                            .font(.caption.bold())
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(.ultraThinMaterial, in: Capsule())
                        Spacer()
                        Text("\(Int(project.widthCM)) × \(Int(project.heightCM)) см")
                            .font(.caption.monospacedDigit())
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(.ultraThinMaterial, in: Capsule())
                    }
                    Spacer()
                }.padding(12)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.12)))
        }
    }

    private var signOverlay: some View {
        let glow = project.lighting != .none && isNight
        return ZStack {
            if project.depthCM > 0 {
                Text(project.text)
                    .font(.system(size: 42, weight: .black, design: .rounded))
                    .foregroundStyle(.black.opacity(0.85))
                    .offset(x: CGFloat(project.depthCM / 2.5), y: CGFloat(project.depthCM / 2.5))
            }
            Text(project.text)
                .font(.system(size: 42, weight: .black, design: .rounded))
                .foregroundStyle(project.material.color)
                .shadow(color: glow ? Color(hex: project.lightHex).opacity(project.brightness) : .black.opacity(0.45), radius: glow ? 18 : 3)
                .shadow(color: glow ? Color(hex: project.lightHex).opacity(project.brightness * 0.7) : .clear, radius: 35)
        }
        .padding(16)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.cyan.opacity(0.8), style: StrokeStyle(lineWidth: 1, dash: [5])))
    }

    private var bottomBar: some View {
        Group {
            if showInspector {
                ScrollView {
                    VStack(spacing: 14) {
                        TextField("Текст вывески", text: $project.text)
                            .textFieldStyle(.roundedBorder)
                        Picker("Материал", selection: $project.material) {
                            ForEach(SignMaterial.allCases) { Text($0.rawValue).tag($0) }
                        }.pickerStyle(.segmented)
                        Picker("Подсветка", selection: $project.lighting) {
                            ForEach(LightingMode.allCases) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.menu)
                        dimension("Ширина", value: $project.widthCM, range: 50...1000, suffix: "см")
                        dimension("Высота", value: $project.heightCM, range: 10...300, suffix: "см")
                        dimension("Глубина", value: $project.depthCM, range: 0...30, suffix: "см")
                        dimension("Яркость", value: $project.brightness, range: 0...1, suffix: "%", multiplier: 100)
                    }
                    .padding(14)
                }
                .frame(maxHeight: 250)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
            } else {
                HStack {
                    Button("Сбросить положение") {
                        withAnimation { signOffset = .zero; lastOffset = .zero; signScale = 1; lastScale = 1; signRotation = .zero; lastRotation = .zero }
                    }
                    Spacer()
                    Text("Нажмите настройки для редактирования")
                        .font(.caption).foregroundStyle(.secondary)
                }.padding(10)
            }
        }
    }

    private func dimension(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, suffix: String, multiplier: Double = 1) -> some View {
        VStack(spacing: 5) {
            HStack { Text(title); Spacer(); Text("\(Int(value.wrappedValue * multiplier)) \(suffix)").monospacedDigit().foregroundStyle(.secondary) }
            Slider(value: value, in: range)
        }
    }

    private var moveGesture: some Gesture {
        DragGesture().onChanged { signOffset = CGSize(width: lastOffset.width + $0.translation.width, height: lastOffset.height + $0.translation.height) }
            .onEnded { _ in lastOffset = signOffset }
    }
    private var magnifyGesture: some Gesture {
        MagnificationGesture().onChanged { signScale = min(max(lastScale * $0, 0.2), 4) }
            .onEnded { _ in lastScale = signScale }
    }
    private var rotateGesture: some Gesture {
        RotationGesture().onChanged { signRotation = lastRotation + $0 }
            .onEnded { _ in lastRotation = signRotation }
    }

    private func loadPhoto() async {
        guard let data = try? await photoItem?.loadTransferable(type: Data.self), let image = UIImage(data: data) else { return }
        facadeImage = image
    }
}

extension Color {
    init(hex: String) {
        let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: clean).scanHexInt64(&value)
        self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}

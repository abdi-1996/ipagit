import SwiftUI
import SceneKit
import UIKit

struct Sign3DView: UIViewRepresentable {
    let document: LetteringDocument
    let selectedID: UUID?
    let orbitContext: Bool
    let cameraControlEnabled: Bool
    let rendered: Bool
    let facadeImage: UIImage?
    let facadeOffset: CGSize
    let facadeScale: Double

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView(
            frame: .zero,
            options: [SCNView.Option.preferredRenderingAPI.rawValue: SCNRenderingAPI.metal.rawValue]
        )
        view.antialiasingMode = .multisampling4X
        view.autoenablesDefaultLighting = false
        view.backgroundColor = .white
        view.rendersContinuously = true
        view.isPlaying = true
        view.defaultCameraController.interactionMode = .orbitTurntable
        view.defaultCameraController.inertiaEnabled = true
        return view
    }

    func updateUIView(_ view: SCNView, context: Context) {
        let oldTransform = orbitContext ? view.pointOfView?.transform : nil
        let size = resolvedViewSize(view)
        let scene = buildScene(viewSize: size)

        view.scene = scene
        view.pointOfView = scene.rootNode.childNode(withName: "camera", recursively: true)
        view.allowsCameraControl = cameraControlEnabled

        if orbitContext, let oldTransform {
            view.pointOfView?.transform = oldTransform
        }
    }

    private func resolvedViewSize(_ view: SCNView) -> CGSize {
        if view.bounds.width > 20, view.bounds.height > 20 {
            return view.bounds.size
        }
        return UIScreen.main.bounds.size
    }

    private func buildScene(viewSize: CGSize) -> SCNScene {
        let scene = SCNScene()
        scene.background.contents = UIColor.white

        addBackdrop(to: scene, viewSize: viewSize)
        addLights(to: scene)
        addCamera(to: scene, viewSize: viewSize)

        for layer in document.layers where !layer.isHidden {
            if !rendered && !orbitContext {
                addDepthHint(for: layer, to: scene)
            }

            scene.rootNode.addChildNode(makeSignNode(layer))

            if document.shadowEnabled {
                addGraphicShadow(for: layer, to: scene)
            }

            if rendered && layer.signLightEnabled &&
                (layer.signLightMode == .halo || layer.signLightMode == .both) {
                addHalo(for: layer, to: scene)
            }
        }

        if rendered {
            scene.lightingEnvironment.contents = environmentTexture()
            scene.lightingEnvironment.intensity = CGFloat(max(0.2, document.sceneLightIntensity))
        }

        return scene
    }

    private func addBackdrop(to scene: SCNScene, viewSize: CGSize) {
        let viewAspect = max(0.1, viewSize.width / max(1, viewSize.height))

        var width = viewSize.width
        var height = viewSize.height

        if let image = facadeImage, image.size.height > 0 {
            let imageAspect = image.size.width / image.size.height
            if imageAspect > viewAspect {
                width = viewSize.width
                height = width / imageAspect
            } else {
                height = viewSize.height
                width = height * imageAspect
            }
        }

        width *= CGFloat(facadeScale)
        height *= CGFloat(facadeScale)

        let plane = SCNPlane(width: width, height: height)
        let material = SCNMaterial()
        material.lightingModel = .constant
        material.diffuse.contents = facadeImage ?? UIColor.white
        material.diffuse.intensity = CGFloat(document.facadeOpacity)
        material.isDoubleSided = true
        plane.materials = [material]

        let node = SCNNode(geometry: plane)
        node.name = "facade"
        node.position = SCNVector3(
            Float(facadeOffset.width),
            Float(-facadeOffset.height),
            -30
        )
        scene.rootNode.addChildNode(node)
    }

    private func addLights(to scene: SCNScene) {
        let ambient = SCNLight()
        ambient.type = .ambient
        ambient.color = UIColor(white: rendered ? 0.58 : 0.76, alpha: 1)
        ambient.intensity = CGFloat((rendered ? 500 : 760) * document.sceneLightIntensity)
        let ambientNode = SCNNode()
        ambientNode.light = ambient
        scene.rootNode.addChildNode(ambientNode)

        let key = SCNLight()
        key.type = .directional
        key.color = rendered ? sceneLightColor() : UIColor(white: 0.95, alpha: 1)
        key.intensity = CGFloat((rendered ? 1150 : 900) * document.sceneLightIntensity)
        key.castsShadow = false

        let keyNode = SCNNode()
        keyNode.light = key
        let az = Float(document.sceneLightAzimuth * .pi / 180)
        let el = Float(document.sceneLightElevation * .pi / 180)
        keyNode.eulerAngles = SCNVector3(-el, az, 0)
        scene.rootNode.addChildNode(keyNode)

        if rendered {
            let rim = SCNLight()
            rim.type = .directional
            rim.color = UIColor(white: 0.86, alpha: 1)
            rim.intensity = CGFloat(300 * document.sceneLightIntensity)

            let rimNode = SCNNode()
            rimNode.light = rim
            rimNode.eulerAngles = SCNVector3(
                Float(-35.0 * .pi / 180),
                Float(-125.0 * .pi / 180),
                0
            )
            scene.rootNode.addChildNode(rimNode)
        }
    }

    private func addCamera(to scene: SCNScene, viewSize: CGSize) {
        let camera = SCNCamera()
        camera.usesOrthographicProjection = true

        // 1 world unit is approximately 1 point on screen.
        // This keeps the 2D -> 3D switch from changing letter size.
        camera.orthographicScale = Double(max(1, viewSize.height / 2))
        camera.zNear = 0.1
        camera.zFar = 5000
        camera.wantsHDR = rendered
        camera.wantsExposureAdaptation = rendered
        camera.exposureOffset = rendered ? 0.12 : 0

        let node = SCNNode()
        node.name = "camera"
        node.camera = camera
        node.position = SCNVector3(0, 0, 1000)
        node.look(at: SCNVector3(0, 0, 0))
        scene.rootNode.addChildNode(node)
    }

    private func makeSignNode(_ layer: LetteringLayer) -> SCNNode {
        let extrusion = CGFloat(max(1, layer.depthMM)) * 0.12
        let geometry = makeGeometry(layer, extrusion: extrusion)
        geometry.materials = rendered
            ? renderedMaterials(layer)
            : solidMaterials(selected: layer.id == selectedID)

        let node = SCNNode(geometry: geometry)
        node.name = "sign-\(layer.id.uuidString)"
        centerPivot(of: node)

        node.scale = SCNVector3(
            Float(layer.scale * layer.widthScale),
            Float(layer.scale),
            1
        )
        node.position = SCNVector3(
            Float(layer.x),
            Float(-layer.y),
            0
        )
        node.eulerAngles.z = Float(-layer.rotation * .pi / 180)
        node.opacity = CGFloat(layer.opacity)
        return node
    }

    private func makeGeometry(_ layer: LetteringLayer, extrusion: CGFloat) -> SCNGeometry {
        if let vector = layer.vectorShape {
            let shape = SCNShape(path: bezierPath(vector), extrusionDepth: extrusion)
            shape.chamferRadius = rendered ? min(2.0, extrusion * 0.08) : min(0.8, extrusion * 0.03)
            return shape
        }

        let text = SCNText(string: layer.text, extrusionDepth: extrusion)
        text.font = UIFont(name: layer.fontName, size: CGFloat(layer.fontSize))
            ?? UIFont.systemFont(ofSize: CGFloat(layer.fontSize), weight: .bold)
        text.flatness = rendered ? 0.12 : 0.5
        text.chamferRadius = rendered ? min(2.0, extrusion * 0.08) : min(0.8, extrusion * 0.03)
        text.alignmentMode = CATextLayerAlignmentMode.center.rawValue
        return text
    }

    private func solidMaterials(selected: Bool) -> [SCNMaterial] {
        let front = SCNMaterial()
        front.lightingModel = .lambert
        front.diffuse.contents = selected
            ? UIColor(white: 0.76, alpha: 1)
            : UIColor(white: 0.64, alpha: 1)

        let side = SCNMaterial()
        side.lightingModel = .lambert
        side.diffuse.contents = UIColor(white: 0.34, alpha: 1)

        let back = SCNMaterial()
        back.lightingModel = .lambert
        back.diffuse.contents = UIColor(white: 0.28, alpha: 1)

        return [front, side, back]
    }

    private func renderedMaterials(_ layer: LetteringLayer) -> [SCNMaterial] {
        let front = material(color: UIColor(hex: layer.faceHex), preset: layer.material)
        let side = material(color: UIColor(hex: layer.sideHex), preset: layer.material)
        let back = material(color: UIColor(hex: layer.backHex), preset: layer.material)

        if layer.signLightEnabled &&
            (layer.signLightMode == .face || layer.signLightMode == .both) {
            let glow = colorForKelvin(layer.signLightKelvin)
                .withAlphaComponent(CGFloat(0.35 + layer.signLightIntensity * 0.65))
            front.emission.contents = glow
            front.emission.intensity = CGFloat(0.35 + layer.signLightIntensity)
        }

        return [front, side, back]
    }

    private func material(color: UIColor, preset: SignMaterialPreset) -> SCNMaterial {
        let material = SCNMaterial()
        material.lightingModel = .physicallyBased
        material.diffuse.contents = color
        material.metalness.contents = preset.metallic
        material.roughness.contents = preset.roughness

        if preset == .acrylic {
            material.transparency = 0.96
            material.fresnelExponent = 1.3
        }

        return material
    }

    private func addDepthHint(for layer: LetteringLayer, to scene: SCNScene) {
        let offset = CGFloat(min(18, max(3, layer.depthMM * 0.10)))
        let geometry = makeGeometry(layer, extrusion: 0.2)
        let material = SCNMaterial()
        material.lightingModel = .constant
        material.diffuse.contents = UIColor(white: 0.28, alpha: 1)
        geometry.materials = [material]

        let node = SCNNode(geometry: geometry)
        centerPivot(of: node)
        node.scale = SCNVector3(
            Float(layer.scale * layer.widthScale),
            Float(layer.scale),
            1
        )
        node.position = SCNVector3(
            Float(layer.x + Double(offset)),
            Float(-layer.y - Double(offset * 0.65)),
            -3
        )
        node.eulerAngles.z = Float(-layer.rotation * .pi / 180)
        node.opacity = CGFloat(layer.opacity)
        scene.rootNode.addChildNode(node)
    }

    private func addGraphicShadow(for layer: LetteringLayer, to scene: SCNScene) {
        let geometry = makeGeometry(layer, extrusion: 0.1)
        let material = SCNMaterial()
        material.lightingModel = .constant
        material.diffuse.contents = UIColor.black.withAlphaComponent(
            CGFloat(max(0.10, layer.shadowOpacity * (rendered ? 0.72 : 0.48)))
        )
        material.isDoubleSided = true
        geometry.materials = [material]

        let node = SCNNode(geometry: geometry)
        centerPivot(of: node)
        node.scale = SCNVector3(
            Float(layer.scale * layer.widthScale),
            Float(layer.scale),
            1
        )

        let radians = document.sceneLightAzimuth * .pi / 180
        let distance = 5.0 + min(26.0, layer.depthMM * 0.13)
        let x = layer.x - cos(radians) * distance
        let y = -layer.y + sin(radians) * distance

        node.position = SCNVector3(Float(x), Float(y), -26)
        node.eulerAngles.z = Float(-layer.rotation * .pi / 180)
        node.renderingOrder = -1
        scene.rootNode.addChildNode(node)
    }

    private func addHalo(for layer: LetteringLayer, to scene: SCNScene) {
        let color = colorForKelvin(layer.signLightKelvin)
        let scales: [(Float, CGFloat)] = [
            (1.025, 0.22),
            (1.055, 0.13),
            (1.09, 0.07)
        ]

        for (extraScale, alpha) in scales {
            let geometry = makeGeometry(layer, extrusion: 0.08)
            let material = SCNMaterial()
            material.lightingModel = .constant
            material.diffuse.contents = color.withAlphaComponent(
                alpha * CGFloat(layer.signLightIntensity)
            )
            material.emission.contents = color
            material.transparency = alpha * CGFloat(layer.signLightIntensity)
            material.blendMode = .add
            material.writesToDepthBuffer = false
            material.isDoubleSided = true
            geometry.materials = [material]

            let node = SCNNode(geometry: geometry)
            centerPivot(of: node)
            node.scale = SCNVector3(
                Float(layer.scale * layer.widthScale) * extraScale,
                Float(layer.scale) * extraScale,
                1
            )
            node.position = SCNVector3(
                Float(layer.x),
                Float(-layer.y),
                -27
            )
            node.eulerAngles.z = Float(-layer.rotation * .pi / 180)
            node.renderingOrder = -2
            scene.rootNode.addChildNode(node)
        }
    }

    private func centerPivot(of node: SCNNode) {
        let box = node.boundingBox
        node.pivot = SCNMatrix4MakeTranslation(
            (box.min.x + box.max.x) * 0.5,
            (box.min.y + box.max.y) * 0.5,
            (box.min.z + box.max.z) * 0.5
        )
    }

    private func bezierPath(_ vector: VectorShapeData) -> UIBezierPath {
        let path = UIBezierPath()

        for command in vector.commands {
            switch command.kind {
            case .move:
                if let p = command.p1 {
                    path.move(to: CGPoint(x: p.x, y: -p.y))
                }
            case .line:
                if let p = command.p1 {
                    path.addLine(to: CGPoint(x: p.x, y: -p.y))
                }
            case .quad:
                if let c = command.p1, let e = command.p2 {
                    path.addQuadCurve(
                        to: CGPoint(x: e.x, y: -e.y),
                        controlPoint: CGPoint(x: c.x, y: -c.y)
                    )
                }
            case .cubic:
                if let c1 = command.p1, let c2 = command.p2, let e = command.p3 {
                    path.addCurve(
                        to: CGPoint(x: e.x, y: -e.y),
                        controlPoint1: CGPoint(x: c1.x, y: -c1.y),
                        controlPoint2: CGPoint(x: c2.x, y: -c2.y)
                    )
                }
            case .close:
                path.close()
            }
        }

        return path
    }

    private func sceneLightColor() -> UIColor {
        let elevation = document.sceneLightElevation
        if elevation < 12 {
            return UIColor(red: 1, green: 0.60, blue: 0.34, alpha: 1)
        }
        if elevation < 25 {
            return UIColor(red: 1, green: 0.78, blue: 0.58, alpha: 1)
        }
        return UIColor(red: 1, green: 0.97, blue: 0.91, alpha: 1)
    }

    private func environmentTexture() -> UIImage {
        let size = CGSize(width: 256, height: 128)
        return UIGraphicsImageRenderer(size: size).image { context in
            let colors = [
                UIColor(white: 0.18, alpha: 1).cgColor,
                UIColor(white: 0.92, alpha: 1).cgColor,
                UIColor(white: 0.28, alpha: 1).cgColor
            ] as CFArray
            let locations: [CGFloat] = [0, 0.48, 1]

            if let gradient = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: colors,
                locations: locations
            ) {
                context.cgContext.drawLinearGradient(
                    gradient,
                    start: CGPoint(x: 0, y: 0),
                    end: CGPoint(x: size.width, y: size.height),
                    options: []
                )
            }
        }
    }
}

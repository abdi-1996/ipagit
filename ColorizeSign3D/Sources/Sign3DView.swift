import SwiftUI
import SceneKit
import UIKit

struct Sign3DView: UIViewRepresentable {
    let document: LetteringDocument
    let selectedID: UUID?
    let orbitEnabled: Bool
    let rendered: Bool
    let facadeImage: UIImage?

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView(frame: .zero, options: [SCNView.Option.preferredRenderingAPI.rawValue: SCNRenderingAPI.metal.rawValue])
        view.antialiasingMode = .multisampling4X
        view.autoenablesDefaultLighting = false
        view.backgroundColor = UIColor(white: 0.08, alpha: 1)
        view.rendersContinuously = true
        view.isPlaying = true
        view.defaultCameraController.interactionMode = .orbitTurntable
        view.defaultCameraController.inertiaEnabled = true
        return view
    }

    func updateUIView(_ view: SCNView, context: Context) {
        let oldTransform = orbitEnabled ? view.pointOfView?.transform : nil
        let scene = buildScene()
        view.scene = scene
        view.allowsCameraControl = orbitEnabled
        view.pointOfView = scene.rootNode.childNode(withName: "camera", recursively: true)
        if orbitEnabled, let oldTransform { view.pointOfView?.transform = oldTransform }
    }

    private func buildScene() -> SCNScene {
        let scene = SCNScene()
        scene.background.contents = UIColor(white: rendered ? 0.12 : 0.08, alpha: 1)
        addBackdrop(to: scene)
        addLights(to: scene)
        addCamera(to: scene)

        for layer in document.layers where !layer.isHidden {
            scene.rootNode.addChildNode(makeSignNode(layer))
            if rendered && document.shadowEnabled { addGraphicShadow(for: layer, to: scene) }
            if rendered && layer.signLightEnabled && (layer.signLightMode == .halo || layer.signLightMode == .both) {
                addHalo(for: layer, to: scene)
            }
        }

        if rendered {
            scene.lightingEnvironment.contents = environmentTexture()
            scene.lightingEnvironment.intensity = CGFloat(max(0.2, document.sceneLightIntensity))
        }
        return scene
    }

    private func addBackdrop(to scene: SCNScene) {
        let aspect: CGFloat = (facadeImage?.size.height ?? 0) > 0 ? (facadeImage!.size.width / facadeImage!.size.height) : 1
        let maxSide: CGFloat = 18
        let width = aspect >= 1 ? maxSide : maxSide * aspect
        let height = aspect >= 1 ? maxSide / aspect : maxSide
        let plane = SCNPlane(width: width, height: height)
        let material = SCNMaterial()
        material.lightingModel = .constant
        material.diffuse.contents = facadeImage ?? UIColor.white
        material.diffuse.intensity = CGFloat(document.facadeOpacity)
        material.isDoubleSided = true
        plane.materials = [material]
        let node = SCNNode(geometry: plane)
        node.name = "facade"
        node.position = SCNVector3(0, 0, -2.6)
        scene.rootNode.addChildNode(node)
    }

    private func addLights(to scene: SCNScene) {
        let ambient = SCNLight()
        ambient.type = .ambient
        ambient.color = UIColor(white: rendered ? 0.62 : 0.72, alpha: 1)
        ambient.intensity = CGFloat((rendered ? 520 : 700) * document.sceneLightIntensity)
        let ambientNode = SCNNode(); ambientNode.light = ambient
        scene.rootNode.addChildNode(ambientNode)

        let key = SCNLight()
        key.type = .directional
        key.color = sceneLightColor()
        key.intensity = CGFloat((rendered ? 1150 : 850) * document.sceneLightIntensity)
        let keyNode = SCNNode(); keyNode.light = key
        let az = Float(document.sceneLightAzimuth * .pi / 180)
        let el = Float(document.sceneLightElevation * .pi / 180)
        keyNode.eulerAngles = SCNVector3(-el, az, 0)
        scene.rootNode.addChildNode(keyNode)

        if rendered {
            let rim = SCNLight(); rim.type = .directional; rim.color = UIColor(white: 0.82, alpha: 1)
            rim.intensity = CGFloat(320 * document.sceneLightIntensity)
            let rimNode = SCNNode(); rimNode.light = rim
            rimNode.eulerAngles = SCNVector3(Float(-35.0 * .pi / 180), Float(-125.0 * .pi / 180), 0)
            scene.rootNode.addChildNode(rimNode)
        }
    }

    private func addCamera(to scene: SCNScene) {
        let camera = SCNCamera()
        camera.fieldOfView = 42
        camera.zNear = 0.1
        camera.zFar = 100
        camera.wantsHDR = rendered
        camera.wantsExposureAdaptation = rendered
        camera.exposureOffset = rendered ? 0.15 : 0
        let node = SCNNode(); node.name = "camera"; node.camera = camera
        node.position = orbitEnabled ? SCNVector3(0, 0.4, 18) : SCNVector3(1.15, 0.7, 18)
        node.look(at: SCNVector3(0, 0, 0))
        scene.rootNode.addChildNode(node)
    }

    private func makeSignNode(_ layer: LetteringLayer) -> SCNNode {
        let geometry = makeGeometry(layer, extrusion: CGFloat(max(1, layer.depthMM)) / 135)
        geometry.materials = rendered ? renderedMaterials(layer) : solidMaterials(selected: layer.id == selectedID)
        let node = SCNNode(geometry: geometry)
        node.name = layer.name
        centerPivot(of: node)
        let base = Float(0.015 * layer.scale)
        node.scale = SCNVector3(base * Float(layer.widthScale), base, 1)
        node.position = SCNVector3(Float(layer.x / 120), Float(-layer.y / 120), 0)
        node.eulerAngles.z = Float(-layer.rotation * .pi / 180)
        node.opacity = CGFloat(layer.opacity)
        return node
    }

    private func makeGeometry(_ layer: LetteringLayer, extrusion: CGFloat) -> SCNGeometry {
        if let vector = layer.vectorShape {
            let shape = SCNShape(path: bezierPath(vector), extrusionDepth: extrusion)
            shape.chamferRadius = rendered ? min(0.8, extrusion * 0.08) : 0
            return shape
        }
        let text = SCNText(string: layer.text, extrusionDepth: extrusion)
        text.font = UIFont(name: layer.fontName, size: CGFloat(layer.fontSize)) ?? UIFont.systemFont(ofSize: CGFloat(layer.fontSize), weight: .bold)
        text.flatness = rendered ? 0.12 : 0.55
        text.chamferRadius = rendered ? min(0.8, extrusion * 0.08) : 0
        text.alignmentMode = CATextLayerAlignmentMode.center.rawValue
        return text
    }

    private func solidMaterials(selected: Bool) -> [SCNMaterial] {
        let m = SCNMaterial(); m.lightingModel = .lambert
        m.diffuse.contents = selected ? UIColor(white: 0.78, alpha: 1) : UIColor(white: 0.58, alpha: 1)
        m.ambient.contents = UIColor(white: 0.45, alpha: 1)
        m.specular.contents = UIColor(white: 0.25, alpha: 1)
        return [m, m, m]
    }

    private func renderedMaterials(_ layer: LetteringLayer) -> [SCNMaterial] {
        let front = material(color: UIColor(hex: layer.faceHex), preset: layer.material)
        let side = material(color: UIColor(hex: layer.sideHex), preset: layer.material)
        let back = material(color: UIColor(hex: layer.backHex), preset: layer.material)
        if layer.signLightEnabled && (layer.signLightMode == .face || layer.signLightMode == .both) {
            front.emission.contents = colorForKelvin(layer.signLightKelvin).withAlphaComponent(CGFloat(0.35 + layer.signLightIntensity * 0.65))
        }
        return [front, side, back]
    }

    private func material(color: UIColor, preset: SignMaterialPreset) -> SCNMaterial {
        let m = SCNMaterial(); m.lightingModel = .physicallyBased
        m.diffuse.contents = color
        m.metalness.contents = preset.metallic
        m.roughness.contents = preset.roughness
        if preset == .acrylic { m.transparency = 0.96; m.fresnelExponent = 1.3 }
        return m
    }

    private func addGraphicShadow(for layer: LetteringLayer, to scene: SCNScene) {
        let geometry = makeGeometry(layer, extrusion: 0.012)
        let m = SCNMaterial(); m.lightingModel = .constant
        m.diffuse.contents = UIColor.black.withAlphaComponent(CGFloat(max(0.08, layer.shadowOpacity * 0.72)))
        m.isDoubleSided = true; geometry.materials = [m]
        let node = SCNNode(geometry: geometry); centerPivot(of: node)
        let base = Float(0.015 * layer.scale)
        node.scale = SCNVector3(base * Float(layer.widthScale), base, 1)
        let radians = document.sceneLightAzimuth * .pi / 180
        let distance = 0.16 + min(0.55, layer.depthMM / 300)
        node.position = SCNVector3(Float(layer.x / 120 - cos(radians) * distance), Float(-layer.y / 120 + sin(radians) * distance), -1.25)
        node.eulerAngles.z = Float(-layer.rotation * .pi / 180)
        node.renderingOrder = -1
        scene.rootNode.addChildNode(node)
    }

    private func addHalo(for layer: LetteringLayer, to scene: SCNScene) {
        let color = colorForKelvin(layer.signLightKelvin)
        let scales: [(Float, CGFloat)] = [(1.025, 0.22), (1.055, 0.13), (1.09, 0.07)]
        for (extraScale, alpha) in scales {
            let geometry = makeGeometry(layer, extrusion: 0.008)
            let m = SCNMaterial(); m.lightingModel = .constant
            m.diffuse.contents = color.withAlphaComponent(alpha * CGFloat(layer.signLightIntensity))
            m.emission.contents = color
            m.transparency = alpha * CGFloat(layer.signLightIntensity)
            m.blendMode = .add; m.writesToDepthBuffer = false; m.isDoubleSided = true
            geometry.materials = [m]
            let node = SCNNode(geometry: geometry); centerPivot(of: node)
            let base = Float(0.015 * layer.scale) * extraScale
            node.scale = SCNVector3(base * Float(layer.widthScale), base, 1)
            node.position = SCNVector3(Float(layer.x / 120), Float(-layer.y / 120), -1.45)
            node.eulerAngles.z = Float(-layer.rotation * .pi / 180)
            node.renderingOrder = -2
            scene.rootNode.addChildNode(node)
        }
    }

    private func centerPivot(of node: SCNNode) {
        let box = node.boundingBox
        node.pivot = SCNMatrix4MakeTranslation((box.min.x + box.max.x) * 0.5, (box.min.y + box.max.y) * 0.5, (box.min.z + box.max.z) * 0.5)
    }

    private func bezierPath(_ vector: VectorShapeData) -> UIBezierPath {
        let path = UIBezierPath()
        for command in vector.commands {
            switch command.kind {
            case .move: if let p = command.p1 { path.move(to: CGPoint(x: p.x, y: -p.y)) }
            case .line: if let p = command.p1 { path.addLine(to: CGPoint(x: p.x, y: -p.y)) }
            case .quad:
                if let c = command.p1, let e = command.p2 { path.addQuadCurve(to: CGPoint(x: e.x, y: -e.y), controlPoint: CGPoint(x: c.x, y: -c.y)) }
            case .cubic:
                if let c1 = command.p1, let c2 = command.p2, let e = command.p3 { path.addCurve(to: CGPoint(x: e.x, y: -e.y), controlPoint1: CGPoint(x: c1.x, y: -c1.y), controlPoint2: CGPoint(x: c2.x, y: -c2.y)) }
            case .close: path.close()
            }
        }
        return path
    }

    private func sceneLightColor() -> UIColor {
        let elevation = document.sceneLightElevation
        if elevation < 12 { return UIColor(red: 1, green: 0.60, blue: 0.34, alpha: 1) }
        if elevation < 25 { return UIColor(red: 1, green: 0.78, blue: 0.58, alpha: 1) }
        return UIColor(red: 1, green: 0.97, blue: 0.91, alpha: 1)
    }

    private func environmentTexture() -> UIImage {
        let size = CGSize(width: 256, height: 128)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            let colors = [UIColor(white: 0.18, alpha: 1).cgColor, UIColor(white: 0.92, alpha: 1).cgColor, UIColor(white: 0.28, alpha: 1).cgColor] as CFArray
            let locations: [CGFloat] = [0, 0.48, 1]
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: locations) {
                ctx.cgContext.drawLinearGradient(gradient, start: CGPoint(x: 0, y: 0), end: CGPoint(x: size.width, y: size.height), options: [])
            }
        }
    }
}

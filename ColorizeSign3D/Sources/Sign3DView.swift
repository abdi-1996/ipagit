import SwiftUI
import SceneKit
import UIKit

struct Sign3DView: UIViewRepresentable {
    let project: SignProject
    let isNight: Bool

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView()
        view.allowsCameraControl = true
        view.autoenablesDefaultLighting = false
        view.antialiasingMode = .multisampling4X
        view.backgroundColor = isNight ? UIColor(red: 0.015, green: 0.02, blue: 0.04, alpha: 1) : UIColor(red: 0.65, green: 0.74, blue: 0.82, alpha: 1)
        view.scene = makeScene()
        return view
    }

    func updateUIView(_ view: SCNView, context: Context) {
        view.backgroundColor = isNight ? UIColor(red: 0.015, green: 0.02, blue: 0.04, alpha: 1) : UIColor(red: 0.65, green: 0.74, blue: 0.82, alpha: 1)
        view.scene = makeScene()
    }

    private func makeScene() -> SCNScene {
        let scene = SCNScene()
        let wall = SCNBox(width: 12, height: 6, length: 0.18, chamferRadius: 0.03)
        wall.firstMaterial?.diffuse.contents = wallColor
        wall.firstMaterial?.roughness.contents = 0.82
        let wallNode = SCNNode(geometry: wall)
        wallNode.position = SCNVector3(0, 0, -0.18)
        scene.rootNode.addChildNode(wallNode)

        let text = SCNText(string: project.text, extrusionDepth: CGFloat(project.depthCM / 35))
        text.font = project.font == .classic
            ? UIFont(name: "TimesNewRomanPS-BoldMT", size: 1.2)
            : .systemFont(ofSize: 1.2, weight: .black)
        text.flatness = 0.15
        text.chamferRadius = 0.025
        let material = SCNMaterial()
        material.diffuse.contents = UIColor(Color(hex: project.faceHex))
        material.metalness.contents = project.material == .gold || project.material == .steel ? 0.85 : 0.05
        material.roughness.contents = project.material == .steel ? 0.2 : (project.material == .neon ? 0.12 : 0.38)
        if isNight && project.lighting != .none {
            material.emission.contents = UIColor(Color(hex: project.lightHex)).withAlphaComponent(project.brightness)
            material.emission.intensity = CGFloat(project.lighting == .halo ? 0.35 : (project.material == .neon ? project.brightness * 1.4 : project.brightness))
        }
        text.materials = [material]
        let signNode = SCNNode(geometry: text)
        let bounds = signNode.boundingBox
        let width = bounds.max.x - bounds.min.x
        let targetWidth = Float(min(max(project.widthCM / 70, 2), 9))
        let scale = targetWidth / max(width, 0.01)
        signNode.scale = SCNVector3(scale, scale, scale)
        signNode.position = SCNVector3(-targetWidth / 2, -0.45, 0.08)
        scene.rootNode.addChildNode(signNode)

        if project.hasPanel {
            let panel = SCNBox(width: CGFloat(targetWidth + 0.7), height: 1.75, length: 0.12, chamferRadius: 0.08)
            panel.firstMaterial?.diffuse.contents = UIColor(Color(hex: project.panelHex))
            panel.firstMaterial?.roughness.contents = 0.55
            let panelNode = SCNNode(geometry: panel)
            panelNode.position = SCNVector3(0, 0, -0.02)
            scene.rootNode.addChildNode(panelNode)
            signNode.position.z = 0.13
        }

        if isNight && project.lighting != .none {
            let light = SCNLight()
            light.type = .omni
            light.color = UIColor(Color(hex: project.lightHex))
            light.intensity = CGFloat(project.brightness * 900)
            light.attenuationEndDistance = 6
            let lightNode = SCNNode()
            lightNode.light = light
            lightNode.position = SCNVector3(0, 0, 1.2)
            scene.rootNode.addChildNode(lightNode)
        }

        let key = SCNLight()
        key.type = .directional
        key.intensity = isNight ? 180 : 1100
        key.castsShadow = true
        let keyNode = SCNNode()
        keyNode.light = key
        keyNode.eulerAngles = SCNVector3(-0.6, -0.5, 0)
        scene.rootNode.addChildNode(keyNode)

        let ambient = SCNLight()
        ambient.type = .ambient
        ambient.color = UIColor(white: isNight ? 0.18 : 0.55, alpha: 1)
        ambient.intensity = isNight ? 140 : 380
        let ambientNode = SCNNode()
        ambientNode.light = ambient
        scene.rootNode.addChildNode(ambientNode)

        let camera = SCNCamera()
        camera.fieldOfView = 48
        let cameraNode = SCNNode()
        cameraNode.camera = camera
        cameraNode.position = SCNVector3(0, 0.2, 11)
        scene.rootNode.addChildNode(cameraNode)
        scene.background.contents = isNight ? UIColor.black : UIColor(red: 0.65, green: 0.74, blue: 0.82, alpha: 1)
        return scene
    }

    private var wallColor: UIColor {
        if isNight { return UIColor(white: 0.10, alpha: 1) }
        switch project.facadeFinish {
        case .brick: return UIColor(red: 0.48, green: 0.22, blue: 0.14, alpha: 1)
        case .concrete: return UIColor(white: 0.52, alpha: 1)
        case .dark: return UIColor(white: 0.16, alpha: 1)
        case .photo: return UIColor(white: 0.78, alpha: 1)
        }
    }
}

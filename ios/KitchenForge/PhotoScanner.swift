import UIKit
import PhotosUI
import Vision
import AVFoundation
import UniformTypeIdentifiers

/// Uses only the photo chosen by the user. Images are processed in memory and
/// are never uploaded, added to the photo library, or passed into JavaScript.
final class PhotoScanner: NSObject, UIImagePickerControllerDelegate,
                          UINavigationControllerDelegate, PHPickerViewControllerDelegate {
    private weak var presenter: UIViewController?
    private let processingQueue = DispatchQueue(label: "com.kitchenforge.photo-scanner", qos: .userInitiated)
    private var requestID: String?
    private var mode = "food"
    private var completion: (([String: Any]) -> Void)?

    init(presenter: UIViewController) {
        self.presenter = presenter
        super.init()
    }

    func scan(requestID: String, source: String, mode: String,
              completion: @escaping ([String: Any]) -> Void) {
        guard self.requestID == nil else {
            completion(["requestId": requestID, "text": "", "labels": [],
                        "error": "A photo scan is already open. Finish or cancel it first."])
            return
        }
        guard let presenter = presenter, presenter.viewIfLoaded?.window != nil,
              presenter.presentedViewController == nil else {
            completion(["requestId": requestID, "text": "", "labels": [],
                        "error": "Close the current dialog and try your photo again."])
            return
        }
        self.requestID = requestID
        self.mode = mode
        self.completion = completion

        if source == "library" {
            // The system picker grants access to the selected image only, so
            // KitchenForge does not request broad photo-library permission.
            var configuration = PHPickerConfiguration()
            configuration.filter = .images
            configuration.selectionLimit = 1
            configuration.preferredAssetRepresentationMode = .current
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            picker.modalPresentationStyle = .fullScreen
            presenter.present(picker, animated: true)
            return
        }

        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            finish(error: "This device has no available camera. Choose a photo instead.")
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            presentCamera()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self = self, self.requestID == requestID else { return }
                    if granted {
                        self.presentCamera()
                    } else {
                        self.finish(error: "Camera access was denied. Allow Camera in Settings, or choose a photo instead.")
                    }
                }
            }
        case .denied:
            finish(error: "Camera access is off. Allow Camera in Settings, or choose a photo instead.")
        case .restricted:
            finish(error: "Camera access is restricted on this device. Choose a photo instead.")
        @unknown default:
            finish(error: "Camera access is unavailable. Choose a photo instead.")
        }
    }

    private func presentCamera() {
        guard let presenter = presenter, presenter.viewIfLoaded?.window != nil,
              presenter.presentedViewController == nil else {
            finish(error: "The camera could not open. Close the current dialog and try again.")
            return
        }
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.mediaTypes = [UTType.image.identifier]
        picker.cameraCaptureMode = .photo
        picker.allowsEditing = false
        picker.delegate = self
        picker.modalPresentationStyle = .fullScreen
        presenter.present(picker, animated: true)
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true) { [weak self] in self?.finish(cancelled: true) }
    }

    func imagePickerController(_ picker: UIImagePickerController,
                               didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        let image = info[.originalImage] as? UIImage
        picker.dismiss(animated: true) { [weak self] in
            guard let self = self else { return }
            guard let image = image else {
                self.finish(error: "The camera did not return a photo. Please try again.")
                return
            }
            self.process(image)
        }
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true) { [weak self] in
            guard let self = self else { return }
            guard let provider = results.first?.itemProvider else {
                self.finish(cancelled: true)
                return
            }
            guard provider.canLoadObject(ofClass: UIImage.self) else {
                self.finish(error: "This photo format cannot be read. Choose a JPEG or HEIC photo instead.")
                return
            }
            provider.loadObject(ofClass: UIImage.self) { [weak self] object, error in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    guard error == nil, let image = object as? UIImage else {
                        self.finish(error: "The selected photo could not be opened. If it is in iCloud, download it in Photos and try again.")
                        return
                    }
                    self.process(image)
                }
            }
        }
    }

    private func process(_ image: UIImage) {
        guard let requestID = requestID else { return }
        let scanMode = mode
        processingQueue.async { [weak self] in
            autoreleasepool {
                // Bound memory and OCR cost for modern high-resolution photos.
                // Rendering also applies camera/EXIF rotation before Vision runs.
                let maxDimension: CGFloat = 2400
                let longestSide = max(image.size.width, image.size.height)
                guard longestSide > 0 else {
                    DispatchQueue.main.async { self?.finish(error: "This photo is empty. Please take another photo.") }
                    return
                }
                let scale = min(1, maxDimension / longestSide)
                let size = CGSize(width: max(1, image.size.width * scale), height: max(1, image.size.height * scale))
                let format = UIGraphicsImageRendererFormat()
                format.scale = 1
                format.opaque = true
                let normalized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
                    image.draw(in: CGRect(origin: .zero, size: size))
                }
                guard let cgImage = normalized.cgImage else {
                    DispatchQueue.main.async { self?.finish(error: "This photo could not be processed. Try a different photo.") }
                    return
                }

                let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
                let textRequest = VNRecognizeTextRequest()
                textRequest.recognitionLevel = .accurate
                textRequest.usesLanguageCorrection = true
                if #available(iOS 16.0, *) {
                    textRequest.automaticallyDetectsLanguage = true
                }

                var text = ""
                var labels: [[String: Any]] = []
                var textSucceeded = false
                var classificationSucceeded = false
                do {
                    try handler.perform([textRequest])
                    // Preserve Vision's reading order and line breaks for receipt parsing.
                    text = (textRequest.results ?? [])
                        .compactMap { $0.topCandidates(1).first?.string }
                        .joined(separator: "\n")
                    textSucceeded = true
                } catch {
                    // Food classification may still return useful candidates.
                }

                if scanMode == "food" {
                    let classificationRequest = VNClassifyImageRequest()
                    do {
                        try handler.perform([classificationRequest])
                        // The web app maps supported food labels to pantry names
                        // and always asks the user to review before saving.
                        labels = (classificationRequest.results ?? [])
                            .filter { $0.confidence >= 0.25 }
                            .prefix(12)
                            .map { ["name": $0.identifier.replacingOccurrences(of: "_", with: " "),
                                    "confidence": Double($0.confidence)] }
                        classificationSucceeded = true
                    } catch {
                        // Printed food names can still be suggested from OCR.
                    }
                }

                let failed = !textSucceeded && !classificationSucceeded
                let recognizedText = text
                let recognizedLabels = labels
                DispatchQueue.main.async {
                    guard let self = self, self.requestID == requestID else { return }
                    self.finish(text: recognizedText, labels: recognizedLabels,
                                error: failed ? "This photo could not be analyzed. Try a clear, well-lit photo, or add items manually." : nil)
                }
            }
        }
    }

    private func finish(text: String = "", labels: [[String: Any]] = [],
                        error: String? = nil, cancelled: Bool = false) {
        guard let requestID = requestID else { return }
        var payload: [String: Any] = ["requestId": requestID, "text": text, "labels": labels]
        if let error = error { payload["error"] = error }
        if cancelled { payload["cancelled"] = true }
        let callback = completion
        self.requestID = nil
        completion = nil
        callback?(payload)
    }
}

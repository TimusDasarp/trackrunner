//
//  TrackRunnerGlass.swift
//  TrackRunner
//

import SwiftUI

extension View {
    @ViewBuilder
    func trackRunnerGlass(cornerRadius: CGFloat = 8, tint: Color? = nil, interactive: Bool = false) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)

        if #available(iOS 26.0, *) {
            if let tint {
                if interactive {
                    glassEffect(.regular.tint(tint).interactive(), in: .rect(cornerRadius: cornerRadius))
                } else {
                    glassEffect(.regular.tint(tint), in: .rect(cornerRadius: cornerRadius))
                }
            } else if interactive {
                glassEffect(.regular.interactive(), in: .rect(cornerRadius: cornerRadius))
            } else {
                glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
            }
        } else {
            background(.regularMaterial, in: shape)
                .overlay {
                    shape.stroke(Color.primary.opacity(0.08))
                }
        }
    }
}

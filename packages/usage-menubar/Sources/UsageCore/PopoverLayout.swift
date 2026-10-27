import Foundation
import CoreGraphics

/// Content size excludes the popover arrow and a small clearance from screen edges.
public enum PopoverLayout {
    public static func viewport(contentHeight: CGFloat, visibleFrame: CGRect, anchorFrame: CGRect) -> CGSize {
        let clearance: CGFloat = 16
        let width = max(1, min(400, visibleFrame.width - clearance))
        let availableHeight = max(1, min(visibleFrame.maxY, anchorFrame.minY) - visibleFrame.minY - clearance)
        let height = contentHeight.isFinite ? max(1, contentHeight) : availableHeight
        return CGSize(width: width, height: min(height, availableHeight))
    }
}

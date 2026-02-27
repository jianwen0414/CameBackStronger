"""
Coordinate translator for mapping pixel positions to GPS coordinates.

Supports two modes:
  1. Fixed camera coordinate — returns CAMERA_LAT/CAMERA_LONG from env
  2. Homography matrix — loads matrix.npy and applies cv2.perspectiveTransform

Falls back to fixed coords when matrix.npy does not exist.
"""

import os
import numpy as np

try:
    import cv2
    _CV2 = True
except ImportError:
    _CV2 = False


class CoordinateTranslator:
    """Translate pixel foot-points to GPS coordinates."""

    def __init__(
        self,
        camera_lat: float | None = None,
        camera_long: float | None = None,
        matrix_path: str | None = None,
    ) -> None:
        self.camera_lat = camera_lat or float(os.getenv("CAMERA_LAT", "0"))
        self.camera_long = camera_long or float(os.getenv("CAMERA_LONG", "0"))

        if matrix_path is None:
            matrix_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "matrix.npy"
            )

        self._matrix: np.ndarray | None = None
        if os.path.exists(matrix_path):
            try:
                self._matrix = np.load(matrix_path)
                print(f">>> Homography matrix loaded from {matrix_path}")
            except Exception as e:
                print(f"⚠️  Failed to load homography matrix: {e}")

    @property
    def has_homography(self) -> bool:
        return self._matrix is not None

    def pixel_to_gps(self, x: float, y: float) -> tuple[float, float]:
        """
        Convert a pixel coordinate to (lat, long).

        If a homography matrix is available, uses cv2.perspectiveTransform.
        Otherwise returns the fixed camera coordinates.
        """
        if self._matrix is not None and _CV2:
            pt = np.array([[[x, y]]], dtype=np.float64)
            transformed = cv2.perspectiveTransform(pt, self._matrix)
            lat = float(transformed[0][0][1])
            lon = float(transformed[0][0][0])
            return lat, lon

        return self.camera_lat, self.camera_long

    def foot_point(self, bbox: tuple[int, int, int, int]) -> tuple[float, float]:
        """
        Compute the ground-level foot point from a person bounding box.
        bbox = (x1, y1, x2, y2)
        Returns pixel (cx, y2) — center-bottom of the box.
        """
        x1, y1, x2, y2 = bbox
        cx = (x1 + x2) / 2.0
        return cx, float(y2)

    def bbox_to_gps(self, bbox: tuple[int, int, int, int]) -> tuple[float, float]:
        """Shortcut: person bbox → GPS coordinate via foot point."""
        fx, fy = self.foot_point(bbox)
        return self.pixel_to_gps(fx, fy)

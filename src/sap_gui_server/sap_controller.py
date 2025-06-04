import sys

if sys.platform == "win32":
    from .sap_controller_windows import SapController  # type: ignore
elif sys.platform == "darwin":
    from .sap_controller_macos import SapController  # type: ignore
else:
    raise ImportError("Unsupported platform: " + sys.platform)

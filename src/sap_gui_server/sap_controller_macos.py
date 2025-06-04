import os
import subprocess
import time
import logging
from typing import Dict, Any

import pyautogui
import psutil
from mss import mss
from PIL import Image
from io import BytesIO
import base64

logger = logging.getLogger(__name__)

class SapController:
    """Simplified SAP controller implementation for macOS."""
    def __init__(self):
        self._initialized = False
        self._sap_app_path = os.getenv(
            "SAP_GUI_APP",
            "/Applications/SAP Clients/SAPGUI 7.80rev6/SAPGUI 7.80rev6.app",
        )
        logger.debug("MacOS SapController initialized")

    def _take_screenshot(self) -> str:
        """Capture screenshot of the active window and return base64 string."""
        active_window = pyautogui.getActiveWindow()
        if not active_window:
            raise Exception("No active window found")
        monitor = {
            "top": active_window.top,
            "left": active_window.left,
            "width": active_window.width,
            "height": active_window.height,
        }
        with mss() as sct:
            screenshot = sct.grab(monitor)
            img = Image.frombytes("RGB", screenshot.size, screenshot.rgb)
        buf = BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()

    def launch_transaction(self, transaction: str) -> Dict[str, Any]:
        """Launch SAP GUI and open given transaction."""
        cmd = ["open", self._sap_app_path]
        try:
            subprocess.Popen(cmd)
            time.sleep(3)
        except Exception as e:
            logger.error(f"Failed to launch SAP GUI: {e}")
            raise Exception(f"Failed to launch SAP GUI: {e}")
        return {"image": self._take_screenshot()}

    def click_position(self, x: int, y: int) -> Dict[str, Any]:
        pyautogui.click(x, y)
        time.sleep(0.5)
        return {"image": self._take_screenshot()}

    def move_mouse(self, x: int, y: int) -> Dict[str, Any]:
        pyautogui.moveTo(x, y)
        time.sleep(0.5)
        return {"image": self._take_screenshot()}

    def type_text(self, text: str) -> Dict[str, Any]:
        mapping = {
            "ENTER": "enter",
            "TAB": "tab",
            "ESC": "esc",
            "BACKSPACE": "backspace",
            "DELETE": "delete",
            "UP": "up",
            "DOWN": "down",
            "LEFT": "left",
            "RIGHT": "right",
        }
        buffer = ""
        i = 0
        while i < len(text):
            if text[i] == "{":
                end = text.find("}", i)
                if end != -1:
                    if buffer:
                        pyautogui.write(buffer)
                        buffer = ""
                    key = text[i + 1 : end].upper()
                    if key in mapping:
                        pyautogui.press(mapping[key])
                    elif key.startswith("F") and key[1:].isdigit():
                        pyautogui.press(key.lower())
                    i = end + 1
                    continue
            if text[i] == "~":
                if buffer:
                    pyautogui.write(buffer)
                    buffer = ""
                pyautogui.press("enter")
                i += 1
                continue
            buffer += text[i]
            i += 1
        if buffer:
            pyautogui.write(buffer)
        time.sleep(0.5)
        return {"image": self._take_screenshot()}

    def scroll_screen(self, direction: str) -> Dict[str, Any]:
        amount = -5 if direction.lower() == "down" else 5
        pyautogui.scroll(amount)
        time.sleep(0.5)
        return {"image": self._take_screenshot()}

    def end_session(self) -> None:
        subprocess.run(["osascript", "-e", 'tell application "SAPGUI" to quit'], check=False)
        time.sleep(2)
        for proc in psutil.process_iter(["name"]):
            name = proc.info.get("name", "")
            if "SAP" in name:
                proc.kill()

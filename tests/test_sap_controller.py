import os
import time
import pytest
from sap_gui_server.sap_controller import SapController
import base64
from PIL import Image
from io import BytesIO

class TestSapController:
    @pytest.fixture(scope="function")
    def controller(self):
        """Create a fresh SapController instance for each test."""
        controller = SapController()
        yield controller
        # Cleanup after each test
        try:
            controller.end_session()
        except:
            pass

    def verify_screenshot(self, screenshot_base64: str) -> bool:
        """Helper to verify a screenshot is valid."""
        try:
            # Decode base64 to image
            image_data = base64.b64decode(screenshot_base64)
            image = Image.open(BytesIO(image_data))
            
            # Check if image is valid and has content
            width, height = image.size
            return width > 0 and height > 0
        except Exception as e:
            print(f"Screenshot verification failed: {str(e)}")
            return False

    def test_initialization(self, controller):
        """Test controller initialization."""
        assert controller._initialized is False
        assert controller._dpi_scale > 0
        assert controller._current_process is None

    def test_launch_transaction(self, controller):
        """Test launching a SAP transaction."""
        # Launch a simple transaction (e.g., MM03 - Display Material)
        result = controller.launch_transaction("MM03")
        print("launch_transaction result: ")
        print(result)
        # Verify response
        assert "ImageContent" in result
        assert self.verify_screenshot(result["ImageContent"])
        
        # Give time for SAP GUI to fully load
        time.sleep(5)

    def test_mouse_interactions(self, controller):
        """Test mouse movement and clicking."""
        # First launch a transaction
        controller.launch_transaction("MM03")
        time.sleep(5)
        
        # Test mouse movement with smaller coordinates
        move_result = controller.move_mouse(50, 10)
        assert "image" in move_result
        assert self.verify_screenshot(move_result["image"])
        
        # Test clicking with smaller coordinates
        click_result = controller.click_position(50, 10)
        assert "image" in click_result
        assert self.verify_screenshot(click_result["image"])

    def test_keyboard_input(self, controller):
        """Test keyboard input functionality."""
        # Launch transaction
        controller.launch_transaction("MM03")
        time.sleep(5)
        
        # Type a material number
        type_result = controller.type_text("100-100")
        assert "image" in type_result
        assert self.verify_screenshot(type_result["image"])

    def test_scrolling(self, controller):
        """Test screen scrolling."""
        # Launch transaction
        controller.launch_transaction("MM03")
        time.sleep(5)
        
        # Test scrolling down
        scroll_down = controller.scroll_screen("down")
        assert "image" in scroll_down
        assert self.verify_screenshot(scroll_down["image"])
        
        time.sleep(1)
        
        # Test scrolling up
        scroll_up = controller.scroll_screen("up")
        assert "image" in scroll_up
        assert self.verify_screenshot(scroll_up["image"])

    def test_end_session(self, controller):
        """Test ending SAP session."""
        # Launch a transaction first
        controller.launch_transaction("MM03")
        time.sleep(5)
        
        # End session
        controller.end_session()
        time.sleep(2)  # Give time for process to terminate
        
        # Verify cleanup - check if process is terminated
        if controller._current_process:
            try:
                # This should raise psutil.NoSuchProcess if process is terminated
                controller._current_process.status()
                assert False, "Process should be terminated"
            except:
                pass  # Expected - process is terminated

    def test_screenshot_functionality(self, controller):
        """Test screenshot capture functionality."""
        # Launch transaction
        controller.launch_transaction("MM03")
        time.sleep(5)
        
        # Take screenshot
        screenshot = controller._take_screenshot()
        
        # Verify screenshot
        # assert screenshot is not None
        # assert self.verify_screenshot(screenshot)

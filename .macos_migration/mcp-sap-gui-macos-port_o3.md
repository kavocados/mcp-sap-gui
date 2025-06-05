# Porting MCP SAP GUI Server to macOS: Achieving Full Feature Parity

## Overview and Current Windows-Only Design

The MCP SAP GUI Server (as implemented in mcp-sap-gui) is currently designed for Windows, tightly integrating with Windows-only APIs and SAP GUI for Windows. It automates SAP GUI interactions by launching an SAP session, injecting user credentials, and simulating UI actions (mouse clicks, keystrokes, scrolling), then returning screenshots for the AI model to analyze. To achieve full feature parity on macOS, we must identify and replace all Windows-specific components with macOS-compatible alternatives, ensuring that all existing features (launching transactions, clicking, typing, scrolling, screenshotting, etc.) behave the same on macOS.

Below we break down the Windows-specific dependencies and behaviors in the current codebase, then detail how to reimplement each for macOS. We provide concrete guidance on libraries, system integration techniques, and potential macOS limitations to address during the port.

## Windows-Specific Dependencies and Features in Current Implementation

The Windows version relies on several OS-specific mechanisms and libraries:

- **Windows Registry & SAP Shortcuts**: The code reads the SAP GUI installation path from the Windows registry and uses the `sapshcut.exe` utility to launch SAP sessions directly¹ ². Credentials (system ID, client, user, password) are passed via command-line args to log in automatically, and an initial transaction code can be supplied (`-command=` argument)³.

- **Windows Process/OS Commands**: It uses Windows commands and APIs for process control. For example, it calls `taskkill` to terminate any existing `saplogon.exe` or `sapshcut.exe` processes when starting or ending a session⁴ ⁵. It also uses psutil to detect when the SAP process (`saplogon.exe`) has started⁶.

- **Win32 GUI APIs for Window Management**: The automation logic heavily uses the Win32 API via pywin32 (e.g. `win32gui`, `win32con`, `win32process`) to find and manipulate SAP GUI windows. It enumerates top-level windows to locate the SAP main window while ignoring the SAP Logon launcher window⁷ ⁸. It then ensures the SAP window is active (not minimized) and brings it to foreground using Win32 calls (`ShowWindow`, `BringWindowToTop`, `SetForegroundWindow`)⁹ ¹⁰. This includes a special sequence using the COM interface `WScript.Shell.SendKeys('%')` (pressing Alt) to work around Windows focus restrictions¹¹.

- **UI Text Extraction via Win32**: The Windows server even retrieves text from the SAP GUI window for status or error messages. It calls `win32gui.EnumChildWindows` on the main window to gather child control texts, filtering for keywords like "error" or "success" to compile lists of error/status messages. This uses the fact that Windows controls expose their text via `GetWindowText`¹².

- **Input Simulation (Mouse & Keyboard)**: Mouse movements and clicks are done via the cross-platform library PyAutoGUI, but keyboard input on Windows leverages the `WScript.Shell` COM interface to send keystrokes (especially to handle special keys like Enter, F-keys, etc.)¹³. The code calculates DPI scaling using `ctypes.windll.user32` calls (for high-DPI displays) to adjust coordinates before clicking¹⁴ ¹⁵.

- **Screenshot Capture**: It uses the `mss` library to capture the active window region. On Windows, PyAutoGUI's `getActiveWindow()` returns the active window's coordinates (using Win32 internally) which are then passed to `mss().grab()`¹⁶ ¹⁷. The screenshot is then encoded to base64 and returned.

- **Batch Scripts & Installation**: Ancillary pieces like `setup.bat`, `run.bat`, etc., assume a Windows environment (using `.bat` and Windows commands). Integration scripts call `python -m sap_gui_server.server` under the hood via those batch files.

In summary, the current design is Windows-centric, using Windows-specific COM and Win32 APIs for window discovery, activation, and keyboard input, plus Windows utilities (`sapshcut.exe`, `taskkill`) for launching and closing SAP. These will not work on macOS and must be replaced or adapted using macOS-friendly approaches.

## Adapting to macOS – Key Changes and Strategies

Porting to macOS involves addressing each of the above points with platform-specific solutions. macOS runs SAP GUI for Java (the Java-based SAP frontend) instead of the Windows-native GUI, which introduces differences in how we start sessions and interact with the UI. Below are the major components to reimplement or adjust:

### 1. Launching SAP GUI Sessions on macOS

**Windows approach**: Used `sapshcut.exe` with credentials from env vars to directly open a session.

**macOS challenges**: There is no `sapshcut.exe` on Mac. Instead, SAP provides SAP GUI for Java, typically installed as an application (e.g. "SAP Client" or "SAPGUI" in `/Applications`). We must programmatically launch this app and initiate a connection with the provided system, client, user, and password.

**Recommended solution**: Leverage SAP GUI for Java's support for connection shortcut files or automation scripting:

- **Use SAP Shortcut Files (.sap / .sapc)**: SAP GUI for Java can open connection files (.sap or .sapc) directly¹⁸. We can dynamically generate a temporary SAP shortcut file containing the connection parameters (host, system, client, etc., and possibly the initial transaction). Then invoke the SAP GUI app to open that file. For example:
  - Create a `.sapc` file (XML or config format) with the needed details (connection string, system ID, etc., and if allowed, the user credentials and maybe password). The SAP Java GUI will parse this to start the session. (If security policies forbid storing a plaintext password in the shortcut, see below for handling credentials input.)
  - Launch the file by calling macOS `open` command: e.g. `subprocess.run(["open", myfile.sapc])`. If SAP GUI is properly associated with `.sapc` / `.sap` files, this will start SAP GUI and auto-connect¹⁹. This method bypasses the need to manually navigate the SAP Logon GUI.
  - Confirm that the session opens. If a password wasn't accepted via the shortcut (newer SAP GUI for Java may not allow password in shortcuts for security²⁰), the login screen will prompt for it. In that case, we need a fallback to detect the login prompt and fill the password (see Input Simulation below).

- **Alternative: AppleScript or JavaScript Automation**: SAP GUI for Java has a built-in JavaScript automation engine²¹. In Preferences, scripting can be enabled, allowing execution of scripts to open connections and even drive the UI. For instance, the scripting API has calls like `application.openConnectionByConnectionString("conn=/H/host/S/3200&...")` to open a connection. In theory, one could pre-write a JavaScript to launch the session and maybe log in, and trigger it via AppleScript or command line. However, this approach is complex to integrate externally – it might require the user to manually enable scripting and possibly still manually trigger the script from the SAP GUI interface. For full automation within our Python server, relying on AppleScript GUI scripting is more straightforward:
  - We can use AppleScript (via the `osascript` command) to tell the SAP GUI app to launch a given connection or simply to activate the app. For example: `osascript -e 'tell application "SAP Gui" to activate'` will bring the app frontmost. AppleScript can also perform GUI scripting if Accessibility is enabled (e.g., selecting menu items or clicking buttons by name), though this requires the UI element names and might be brittle if the app isn't fully scriptable.
  - If `.sapc` files are used, AppleScript may not be needed for the initial launch (the `open` command suffices). But we might use AppleScript to handle any GUI login dialogs that appear (for example, entering the password if not passed in the shortcut, or dismissing any "multiple logon" warning).

**Steps to implement session launch on Mac**:

1. **Locate SAP GUI App**: Determine the installation path. On macOS, SAP GUI for Java might be installed as "SAP GUI <version>.app" or similar. Check standard locations (like `/Applications/SAP Clients/SAPGUI*.app`). This could be configurable via an environment variable (e.g. `SAP_GUI_APP_PATH`) if needed. Unlike Windows where the registry was used¹, on Mac we may rely on a known default path or user input if the app is not in a predictable location.

2. **Generate Connection File**: Using the environment variables `SAP_SYSTEM`, `SAP_CLIENT`, etc., generate a connection string or `.sapc` file. For example, a simple connection string might be `conn=/H/<host>/S/<port>` (possibly obtained from `SAP_SYSTEM` if it's a server address), or if `SAP_SYSTEM` is an SID defined in a central configuration, use that. If the user has pre-defined entries in SAP Logon, the simplest route is to open by entry name: we might create a shortcut referencing the system by SID or description that matches their SAP Logon entry. (The `.sap` file format supports specifying an entry by name or direct server info – these are text-based config files²².)

3. **Embed Credentials**: If possible, include client, user, and password in the connection file. The SAP shortcut format has fields for user and client, and historically could include the password (possibly encoded). However, newer versions might forbid storing password for security, meaning the login dialog will pause for user input. If we cannot pre-set the password, plan to handle the login prompt via automation (discussed below).

4. **Open the Connection**: Use Python to launch SAP GUI. If we have a `.sapc` file, do `subprocess.Popen(["open", myfile])`. Alternatively, use `open -a "SAPGUI.app" --args ...` if SAP GUI supports command-line `--args` for connection strings (some applications allow passing a connection string as an argument). The SAP GUI for Java documentation indicates you can double-click or directly run a connection document to start a session¹⁹, which is what we leverage.

5. **Wait for Launch**: Similar to how on Windows we waited for `saplogon.exe` to appear⁶, on Mac we should wait for the SAP GUI process to start. We can use psutil to check for a process (likely named "java" or "SAPGUI" depending on how the app runs). Another approach is to wait for the main window to appear via GUI automation (e.g. poll `pyautogui.getActiveWindow()` until an SAP GUI window shows up). A timeout (e.g. 5-10 seconds) should be used to avoid hanging if something fails.

If implemented correctly, `launch_transaction` on macOS will perform the above steps and return the first screenshot of the SAP session (just like Windows does). If the Mac flow cannot jump directly into a transaction code (due to password prompts or lack of `-command` equivalent), it's acceptable to have `launch_transaction` land on the main SAP screen (post-login). The AI can then navigate to the transaction via further steps (typing the T-code and pressing Enter). Full parity means the user can still start a session and eventually reach a transaction – whether in one command or a couple of steps – but ideally we minimize extra steps with the above automation.

### 2. UI Automation & Input Handling on macOS

**Windows approach**: Uses Win32 APIs to ensure the SAP window is front and maximized, then uses PyAutoGUI for mouse moves/clicks. Keyboard input was sent via the Windows WScript COM (allowing special key notation). Child window text was read via Win32.

**macOS strategy**: macOS does not have a Win32 API, so we rely on a combination of PyAutoGUI, macOS Accessibility APIs, and possibly AppleScript for certain window management tasks. Key considerations:

- **Bringing SAP window to front**: When launching via `open`, the SAP GUI app should become active by default (applications on macOS typically come to foreground when launched). If needed, we can explicitly activate it using AppleScript:
  - `osascript -e 'tell application "SAP GUI" to activate'`. We do not have a direct equivalent to `SetForegroundWindow`, but `activate` in AppleScript or using the Cocoa API (`NSWorkspace.sharedWorkspace().launchApp`) achieves the same. We should also ensure the window is not minimized or behind others. If multiple SAP GUI windows exist (e.g. the Logon window plus a session window), we may need to identify the correct one. We can use the window title or other attributes:
  - SAP session windows usually have titles like "SAP Easy Access – <System ID> – <client>*" or the transaction name, whereas the Logon pad window might be titled "SAP Logon". We can attempt to differentiate by title. On macOS, PyAutoGUI's window functions (via PyGetWindow) allow getting all windows of an app or by title. We could use `pyautogui.getWindowsWithTitle("SAP Logon")` to detect the Logon list window and ignore it, then find any other SAP windows. Alternatively, use Accessibility: with PyObjC, one could query the AXUIElement tree for windows of the SAP GUI process and pick the one that isn't named "SAP Logon". This mirrors the Windows logic of skipping the logon window²³.

- **Maximizing or resizing**: Unlike Windows, macOS doesn't commonly programmatically maximize windows. However, to get full-screen screenshots of the SAP client, we might want to resize the window to a standard large size. Options include AppleScript GUI scripting (`tell application "System Events" to set size of window 1 of process "SAP GUI" to {width,height}`), or using the Quartz Window Services API to set the window bounds. This can ensure the whole SAP GUI content is visible (important for consistent coordinate use). If not, we rely on whatever size the window opened with. (Many SAP GUI for Java implementations open a session window at a default size which might be smaller than the screen.)

- We should still implement a function `_ensure_sap_window_active()` analogous to the Windows version²⁴, but inside it use Mac-specific calls. For example:
  - Check if the SAP GUI app is active. We can use PyAutoGUI's `getActiveWindow()` and check its `.title` or `.app` property to see if it's the SAP GUI window. If not, call AppleScript activate.
  - If the window is minimized (iconified), AppleScript can "perform action AXRaise" or simply activate might un-minimize it. We can also simulate clicking the app's dock icon via AppleScript if needed.
  - Optionally, adjust window size (since macOS doesn't have a straightforward "SW_MAXIMIZE", we either skip or do a manual resize as described).
  - No need for the Windows Alt-key trick – on macOS, once we call activate, the system will allow focus. There is also no equivalent of SetForegroundWindow restrictions.

- **Mouse movements and clicks**: PyAutoGUI works on macOS for controlling the mouse cursor. The same calls `pyautogui.moveTo(x,y)` and `pyautogui.click()` will work, provided the script has Accessibility permissions (the user must enable "Control My Computer" for the Python process in System Preferences > Security & Privacy > Accessibility). We should document this requirement for macOS users. The current code's `_click_with_dpi_scaling()` will need modification:
  - The Windows DPI scaling logic uses `ctypes.windll.user32` to get the system DPI¹⁴. On macOS, this specific approach is not applicable. If using a retina display, PyAutoGUI might automatically work in pixel coordinates (PyAutoGUI typically expects absolute screen pixel coordinates on macOS). We should test if PyAutoGUI's coordinates align with actual screen pixels on retina (it may use CGPoints which are in the virtual coordinate system, but typically it handles this internally). If not, we might need to detect the retina scale factor. For example, using Quartz APIs: `CGDisplayScreenSize` vs `CGDisplayPixelsWide` can compute a scale (commonly 2.0 for retina). We can incorporate a similar `_get_dpi_scale()` for macOS that returns 2.0 on retina Macs (and 1.0 on non-retina) to scale coordinates. This ensures that if the AI provides coordinates relative to a standard 1920x1080 window, we map them correctly to the Mac's coordinate system.
  - After adjusting (if needed) for DPI, use `pyautogui.moveTo` and click same as Windows. PyAutoGUI will generate the proper Quartz events.
  - Double-click support: If needed (e.g. to open a connection from the SAP Logon list), PyAutoGUI can send multiple clicks or have a `.doubleClick()` method. We may incorporate that if opening an entry requires double-click, or just call click twice.

- **Scroll**: The Windows code uses `pyautogui.scroll(amount)` for scroll wheel²⁵. On macOS, `pyautogui.scroll()` is supported as well (it uses Quartz events). We might need to invert the scroll direction depending on "natural scroll" settings, but since the code uses positive for up and negative for down (which PyAutoGUI interprets accordingly), it should just work similarly. This preserves the `sap_scroll` feature.

- **Keyboard input**: macOS doesn't have WScript.Shell. We have a few ways to simulate typing:
  - PyAutoGUI provides a `pyautogui.typewrite()` (or `pyautogui.write()`) to send a string of characters, and `pyautogui.press()` for special keys. However, PyAutoGUI's ability to send special keys (Enter, F1-F12, Tab, etc.) by name may be limited – it can press keys like `pyautogui.press('enter')` but it doesn't understand a combined string with placeholders like `"Hello{ENTER}"`. We would need to parse and translate the special key syntax that the Windows code expects (they support `~` or `{ENTER}` etc.²⁶).
  - One approach is to implement our own parser in the `type_text` method on macOS: e.g., replace `~` or `{ENTER}` with a signal to hit Enter, `{TAB}` with Tab, `{F1}` … `{F12}` with function keys, etc., then send appropriate events. With PyAutoGUI, this means calling `pyautogui.press("enter")`, etc., at the right points.
  - Alternatively, use the pynput library (a cross-platform input controller). Pynput can send key presses at a lower level via Quartz. For example, use `pynput.keyboard.Controller()` to type a string or press special keys (it has a press method for special keys like `Key.enter`). This gives fine control but is another dependency. PyAutoGUI might be sufficient for basic needs.
  - Another robust method is AppleScript: `osascript -e 'tell application "System Events" to keystroke "text"'` can type normal text, and `... to key code 36` for Enter (key code 36 is Return), etc. But calling osascript for each keystroke might be overkill and slow. It's simpler to stick with a Python-side solution unless we face issues.
  - **Recommendation**: Start with PyAutoGUI's built-in `write()` for alphanumeric text and handle special keys via separate calls (`press` or `hotkey` for combos). Ensure the SAP window is focused (it should be if we activated it) before typing. For example, to implement `sap_type("Hello{ENTER}")` on Mac, we would:
    1. Call `_ensure_sap_window_active()` (already brings window front).
    2. Parse the input: send "Hello" via `pyautogui.write("Hello")`.
    3. Detect `{ENTER}` token and call `pyautogui.press("enter")`.
    4. Small delay (like 0.5s) to allow SAP to process the enter.
    5. Return a screenshot of the result (similar to Windows capturing after typing²⁷).
  - Note: macOS also requires Accessibility permission for synthetic keyboard events (the same permission as for mouse). So as long as the user grants access, PyAutoGUI and/or pynput will be able to type.

- **Handling multi-logon popups**: On Windows, if SAP warns about multiple sessions, a modal "License Information for Multiple Logons" appears and the code finds it and clicks through it²⁸. On macOS SAP GUI, such a popup may appear as well (likely as a Java dialog). We should ensure this scenario is handled:
  - We won't have Win32 to directly find the popup by title. Instead, we could do an image-based or text OCR detection on the screenshot. For example, after launching a session, if the screenshot image contains the words "Multiple Logon" or similar, the AI could be expected to click the appropriate button. Alternatively, we can preemptively detect a second window:
    - SAP GUI for Java might open that warning as a Java modal dialog. It might not be a separate top-level macOS window (could be a child of the app). If it is a separate window, its title might contain "License Information" as well. We could use PyAutoGUI's `getWindowsWithTitle("License Information")` on Mac to find it. If found, calculate its center and click the "Continue with this logon" option (in Windows code they clicked at 38% of the popup height – presumably the second radio button³⁰).
    - Alternatively, simply attempt to detect if no main window comes up and a secondary window is present, then handle it. This is a complex edge case but for parity we mention it.
  - Another approach: since this scenario is triggered by multiple concurrent logins with same user, perhaps instruct the Mac user to allow it in SAP settings or just ensure the script kills existing sessions (we already do kill on Windows). If we kill existing sessions first, the popup might be avoided altogether.

- **Extracting UI text (error/status)**: macOS does not allow easy retrieval of window control text like Windows does with `EnumChildWindows`¹². To preserve the feature where the server returns lists of error or status messages (if this is actually used by the MCP client), we have two possible strategies:
  - Use macOS Accessibility API: Apple's Accessibility framework can read UI element titles, values, etc. We could use PyObjC to access AXUIElement for the SAP GUI window and traverse its children. If SAP GUI for Java exposes the UI elements via AX (most standard UI toolkits on macOS do), we might find text in labels or status bar. For instance, the SAP status bar message might be accessible as a static text element. Implementing this is non-trivial but doable: it involves enabling the Accessibility API and writing code to find children of the window that have text attributes. Libraries like atomac (Automation for Mac) or AXPython could help. Given the complexity, this might be a stretch goal – we might initially skip text extraction on Mac.
  - Use OCR on screenshots: A simpler (though less reliable) method is to run OCR on the screenshot image to detect text. Python can use pytesseract (with Tesseract OCR engine) to scrape text from the image, then filter for keywords like "error" or "success". This would not be as structured as the Windows approach, but could catch error messages that appear on screen. This requires including Tesseract and might be slow, so it's an optional approach if text feedback is critical.
  - **Recommendation**: Document that some text parsing features may be limited on macOS. The core use-case for the MCP server is likely relying on image-based reasoning by the AI (the documentation for the tool emphasizes that the AI will rely on screenshots and must use image recognition to find fields³¹). Since direct UI element access is minimal even on Windows (it only grabs simple text), it might be acceptable to drop or reduce this on Mac. If needed, implement an OCR-based fallback to identify obvious error messages in screenshots (e.g., run OCR and search for "error" keyword).

### 3. Screen Capture on macOS

Capturing screenshots of the SAP window (or the relevant region) is essential for parity, since the server returns an image after each action. On macOS we have a few options:

- **Use mss as on Windows**: The `mss` library is cross-platform. On macOS it uses the Quartz API to capture screen regions. The code already uses `mss().grab(monitor)` where monitor is defined by the active window's coordinates³². This should work on macOS as long as we supply the correct region. We will get the active window via PyAutoGUI (or by tracking the window position via other means) and then call `mss`³³. Important: Starting with macOS 10.15 (Catalina), apps must have Screen Recording permission to capture the screen. So, the user will need to grant our process permission to capture screenshots (in System Preferences > Security & Privacy > Screen Recording). This is separate from the Accessibility permission.

- **PyAutoGUI's screenshot()**: As an alternative, PyAutoGUI can take screenshots via Pillow (PIL). However, by default `pyautogui.screenshot()` captures the entire primary screen. We would have to crop it to the SAP window region. We can get the SAP window's bounding box from `getActiveWindow()` (which uses the PyGetWindow module and should give `.left`, `.top`, `.width`, `.height`). If that works, cropping is straightforward. If `getActiveWindow()` is unreliable on Mac (needs testing), using mss with coordinates might be more direct.

- **Quartz direct capture**: For completeness, one could use Quartz's `CGWindowListCreateImage` to capture a specific window by its window ID. This requires obtaining the CGWindowID of the SAP window. PyGetWindow might provide that, or we can get it via Accessibility. This is advanced and probably unnecessary if mss works with coordinates.

**Plan**: Continue to use the existing pattern:
- After each action (click, type, etc.), call our `_take_screenshot()` which grabs the active window region. On Mac, implement `_take_screenshot()` by:
  1. Verify the SAP window is active (the earlier steps should ensure this).
  2. Use PyAutoGUI or other means to get the window's position and size. For example:
     ```python
     win = pyautogui.getActiveWindow()
     if not win:
         raise Exception("No active window found")
     box = {"top": win.top, "left": win.left, "width": win.width, "height": win.height}
     ```
  3. Pass that box to `mss().grab(box)`, then convert to PIL Image and base64 (same as current code¹⁷).
  4. If `pyautogui.getActiveWindow()` fails (returns None or inaccurate bounds on Mac), consider using `Quartz.CGWindowListCopyWindowInfo` to find the SAP GUI window's bounds via the OS (matching by title or PID). But this is a fallback.
- Ensure to catch exceptions if screenshot fails, and prompt user to enable permissions if needed (maybe log a warning like "Screen capture failed – ensure screen recording permission is granted").

This will maintain the screenshot return formats feature as documented (the current design allows `return_screenshot` parameter to control if images are returned or not³⁴, which we can keep consistent).

### 4. Process and Session Management

- **Ending the session**: On Windows, `end_session` kills the SAP process via `taskkill`⁵. On macOS, to achieve the same, we have options:
  - Use psutil to find the SAP GUI process (e.g., find processes whose name contains "SAP" or the known Java class if SAP GUI runs as a Java process). Then call `proc.terminate()` or `os.kill(pid, 9)` to force-kill. We must be careful to kill the correct process (not other Java apps). If the SAP GUI app runs in its own dedicated JVM, its process name might be `SAPGUI_Client` or simply `java` with some identifiable arguments.
  - Use AppleScript: `osascript -e 'tell application "SAP GUI" to quit'`. This will attempt a graceful quit of the application, closing all sessions. If a confirmation dialog appears ("Do you really want to exit?" or unsaved data prompts), that could stall. We might need to handle that by enabling "do not ask on exit" in SAP GUI settings or by force-killing if quit doesn't succeed promptly.
  - Using `killall`: as a brute force, `subprocess.run(["killall", "SAPGUI"])` if the process name is SAPGUI, or `killall -9 java` which is too broad (don't do that). It's better to specifically target by PID or by app name. `killall "SAP GUI"` might not work if the process name is different from the app name. Instead, using AppleScript is cleaner for an official exit.

  **Recommendation**: Try AppleScript quit first for a clean shutdown (giving SAP GUI a chance to close connections properly). If the process remains after a timeout, fall back to psutil kill. The `end_session` implementation on Mac could be:
  ```python
  import psutil, subprocess, time
  try:
      subprocess.run(["osascript", "-e", 'tell application "SAP GUI" to quit'], check=True)
  except Exception:
      logger.warning("Failed to send quit to SAP GUI")
  # Wait a moment for the app to exit
  time.sleep(2)
  # Ensure no lingering process (force kill if still running)
  for proc in psutil.process_iter(['name']):
      if proc.info['name'] and "SAP" in proc.info['name']:
          proc.kill()
  ```
  This mimics the Windows behavior of ensuring the session is closed. We should adjust the process name filter based on the actual process name observed (could be "SAPGUI.app" or "java" with certain args – this might need tuning).

- **Environment & Config**: Ensure the `.env` or config values the user provides (`SAP_SYSTEM`, `SAP_CLIENT`, etc.) are utilized similarly. On Mac we might introduce a new variable if needed (e.g., `SAP_GUI_PATH` if not in default location). The code should load these via dotenv as it already does³⁵.

- **Installation/Integration changes**: The Windows repository provides batch scripts for installation and integration. For macOS, we should provide equivalents or instructions:
  - Replace `setup.bat`, `run.bat` with a shell script (`setup.sh`, `run.sh`) or at least document how to run on Mac (e.g., "run `pip install -r requirements.txt`, then `python3 -m sap_gui_server.server` to start the server").
  - The integration with "Cline" or "Roo" (if applicable) might require different commands (the batch script uses `npx` and Windows specifics³⁶). On Mac, likely `npx` works without `node.exe` specification. Just ensure any path differences are handled (maybe use relative paths or `pwd` in the `integrate.py`).
  - This is more about parity in user experience: a Mac user should be able to install and run the server with minimal fuss. Providing a README update for macOS with steps (including granting permissions) would be part of the plan.

### 5. Compatible Libraries and Tools for macOS

To implement the above, use the following libraries and macOS features:

- **PyAutoGUI**: Already in use for Windows, it supports macOS. Ensure the `pyobjc` dependency is installed (PyAutoGUI uses PyObjC or Quartz internally on Mac). This will handle mouse movement, clicks, simple keystrokes, and screenshot if needed. Its partner PyGetWindow helps with window info (comes with PyAutoGUI).

- **psutil**: Also cross-platform. Can find and kill processes on macOS (just avoid using Windows-specific process names).

- **mss**: Supports macOS screen capture via Quartz. Continue using it for consistency.

- **PyWin32**: This will be dropped entirely on Mac (not usable). Instead, consider **PyObjC** (Python-Objective-C bridge) if we need deeper system calls (like accessing Accessibility API or reading macOS Window data). PyObjC is a powerful tool to call native macOS frameworks from Python. For example, one could use it to list windows (via `CGWindowListCopyWindowInfo`) or to manipulate GUI (via `AXUIElement`). Using PyObjC requires writing Objective-C flavored code in Python, which is advanced – we might limit use to specific needs (like reading UI text if we decide to implement that).

- **pynput** (optional): For keyboard control if PyAutoGUI's typing is insufficient. Pynput works on macOS (uses Quartz events for keyboard). This can be added to requirements if needed for reliability of special keys.

- **Tesseract OCR** (optional): If choosing OCR for error text, `pytesseract` and the Tesseract binary would be needed. This is optional and might be heavy; consider it only if absolutely needed to replicate the error/status message extraction.

- **AppleScript**: While not a Python library, calling AppleScript via `osascript` is a simple and effective way to interface with macOS features (activating apps, GUI scripting, quitting apps). We should use it for high-level tasks like focusing the app or quitting, rather than trying to force everything through low-level calls. AppleScript usage will require the user to have GUI scripting enabled (which is part of Accessibility permissions).

### 6. Anticipating macOS Limitations or Differences

While we aim for full feature parity, be mindful of a few limitations inherent to macOS or SAP GUI for Java:

- **SAP GUI Differences**: SAP GUI for Java is not 100% identical to SAP GUI for Windows in functionality or UI. Some SAP transactions or GUI elements behave differently or may not be available in the Java version³⁷. This could affect the AI's interaction flow (for instance, certain ALV grid controls or custom controls might render differently). However, from the automation perspective, this mostly means coordinate-based clicking should still work; just be aware that some screens might look different on macOS. It's wise to test crucial transactions in SAP GUI for Java to ensure the AI will see what it expects.

- **Performance**: The Java-based GUI might be slightly slower to respond to automated input. Our implementation already includes small sleeps after actions (e.g., 0.5s after clicks or keys³⁸ ²⁷). We may need to tweak these delays on macOS if we notice that screenshots are taken too early or inputs get missed. Ensuring the window is frontmost (no background clicks) will mitigate issues.

- **Security Prompts**: The first time the automation runs, macOS will prompt the user to allow Accessibility access and Screen Recording for the terminal or Python app. This setup step must be done or the tool won't function. In documentation, clearly instruct the user to enable these in System Preferences.

- **No Console on App Launch**: When using `open` to start the SAP GUI app, note that output/errors from SAP GUI won't be visible to our Python process (since it's a GUI app launch, not a subprocess with stdout). So, if the app fails to start or connect (e.g., invalid system ID), we have to detect it indirectly (perhaps by timeout or checking if a window appeared). Logging should reflect if connection didn't open within the expected time.

- **Coordinate Calibration**: Different macOS machines have different screen resolutions (Retina vs non-Retina, external monitors, etc.). The coordinate system for clicks might require calibration. For example, if the AI assumes 1920x1080 window and the actual SAP window is larger or smaller, coordinates need to scale. On Windows, DPI scaling was addressed¹⁴; on Mac we might need to scale if the window size differs. It could be useful to standardize the SAP GUI window size (if possible, open it at a consistent resolution or maximize it). Alternatively, instruct the AI (or user) that coordinates should be given relative to the current screenshot size. Since the AI is analyzing the screenshot it got, it will likely compute coordinates accordingly. As long as our screenshot on Mac is of the same content, the AI's logic remains valid.

- **Testing Multi-platform Parity**: After implementing, test the full suite of tools on macOS:
  - Launch a transaction and ensure it logs in and captures the initial screen.
  - Perform a sample `sap_click`, `sap_type`, `sap_scroll`, etc., verifying that each returns the expected screenshot and that the SAP GUI responds appropriately (e.g. typing actually enters text in a field).
  - Test edge cases: wrong credentials (should SAP GUI show an error popup? Will our screenshot capture it? Possibly handle it via OCR or at least user can see it in the image), multiple logon scenario, manual closure of app in middle of session, etc.
  - Where possible, maintain the same MCP interface (function names, return formats) so that any client code or AI prompts do not need to change for Mac.

## Actionable Steps for Reimplementation on macOS

**Step 1: Abstract Platform-Specific Code** – Refactor the code to separate Windows-specific logic and macOS logic. For example, create a PlatformController with subclasses or conditional branches: if `sys.platform == 'win32'` use the existing Win32-based methods, if macOS, use the new implementations. This will make it easier to maintain both versions in one codebase. Key areas to abstract: launching SAP (`launch_transaction`), focusing windows, input (click/type), and ending session.

**Step 2: Implement macOS Launch Routine** – Write the macOS version of `launch_transaction`:
- Determine SAP GUI app path or let user configure it.
- Create the connection shortcut (or determine an alternate approach).
- Use subprocess to launch SAP GUI with that shortcut.
- Wait for the session window to appear (possibly loop checking `pyautogui.getActiveWindow()` for a window titled with the system or transaction).
- Handle login prompt if needed: detect if credentials weren't auto-entered (e.g. if after a few seconds the active window title is "SAP Logon" or "Login" instead of a transaction). If so, programmatically enter user/password via `sap_type` calls and press Enter, then proceed.
- Once logged in (maybe detect when the title changes or simply after pressing Enter, wait for main screen), take a screenshot and return it.

**Step 3: Replace Windows UI Automation** – In the macOS controller:
- Write `_ensure_sap_window_active()` using AppleScript or PyAutoGUI focus. Possibly very simple: call AppleScript activate and maybe bring all windows of that app to front.
- Remove any Windows-specific calls like `win32gui.ShowWindow` or `BringWindowToTop`. These have no direct macOS equivalent; rely on the OS to handle focus on activation.
- Remove `winreg` usage; instead, define `_get_sapgui_path()` for Mac if needed (or incorporate path into launch step).
- Remove all `win32gui.EnumWindows` logic for finding windows; on Mac, likely not needed if we directly launch the specific session. If needed, use PyGetWindow to list windows of the app.
- Adjust DPI scaling: implement a `_get_dpi_scale()` for Mac if needed (check if running on a Retina display and return scaling factor).

**Step 4: Input Simulation on Mac** – Implement `click_position(x,y)` and `type_text(text)` for macOS:
- For clicking, utilize PyAutoGUI as is (taking into account scaling and that coordinates (x,y) should be treated relative to the SAP window's top-left). We may use the stored window position to offset coordinates if needed (similar to how `_click_with_dpi_scaling` adds the window rect offset¹⁵). The Windows code stored a global `_main_window_hwnd` and used that to get window position each click³⁹. On Mac, we can store the window geometry instead (e.g., when the session starts, record the window's origin). However, using `pyautogui.moveTo(screen_x, screen_y)` with absolute coordinates already requires the offset. So simply do: `screen_x = window_left + x * scale`, `screen_y = window_top + y * scale`, then move and click. Retrieve `window_left`, `window_top` via PyGetWindow or by storing on launch.
- For typing, incorporate a small parser for special keys and use PyAutoGUI's keyboard functions. Test that keys like Enter, Tab, etc., actually register in SAP on Mac. If issues arise (like PyAutoGUI failing to send certain keys), switch to pynput¹. Ensure to call `.activate()` on the SAP app if for some reason it lost focus before typing (though it shouldn't in our flow).

**Step 5: Screen Capture** – Keep using `_take_screenshot()` with `mss`¹⁷. Test it: on Mac, the `getActiveWindow()` might return a window object with coordinates relative to the current screen's origin. If multiple monitors, coordinates could be global. `mss` expects absolute screen coords, which should match. Just verify the image captured is correct (not blank or full screen). If problems, adjust by maybe capturing full screen and cropping manually with PIL using the window coords.

**Step 6: Testing and Iteration** – Run the new macOS code in a real environment:
- Use a Mac with SAP GUI for Java installed. Populate the `.env` with valid credentials and system (or adapt to supply host and so on).
- Try launching a known simple transaction (like SU01 or just SAP Easy Access). See if it logs in. If it fails to auto-login due to password, implement the fallback automation for login:
  - Detect login window (maybe by image: e.g., look for "Client" or "Password" text on screen via PyAutoGUI's image locate or OCR).
  - Use `pyautogui.write` to type client number, Tab, user, Tab, password, Enter – basically mimicking a user logging in.
  - Continue as normal.
- Test clicking a GUI element by providing coordinates manually (or have the AI identify something). Ensure the click has effect (e.g., clicking a menu or button).
- Verify the screenshots returned reflect the state after each action.
- Compare with Windows behavior for the same sequence to ensure parity.

**Step 7: Documentation & Deployment** – Update README or documentation for macOS:
- Outline installation on Mac (install Python3, `pip install -r requirements.txt`, ensure SAP GUI for Java is installed).
- How to configure environment variables (perhaps needing `SAP_CONNECTION_FILE` or `SAP_HOST` if the approach differs from Windows).
- Permissions needed (Accessibility and Screen Recording).
- Note any minor differences (for example, "On macOS, the tool uses GUI automation; ensure no other windows overlap the SAP GUI window during operation, etc.").
- Provide examples of running the server on macOS and confirm that it integrates with the MCP client (Cline/Roo) similarly (the `integrate.py` script might need to detect Mac and adjust the path format for config).

By following these steps, we will reimplement the MCP SAP GUI Server for macOS with full feature parity to the Windows version. All major features – launching SAP sessions, automated input (click/type/scroll), screenshot feedback, and session termination – will be preserved. We will use macOS-native methods for application control and ensure the solution is robust and user-friendly on macOS.

---

## References

¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ¹⁰ ¹¹ ¹² ¹³ ¹⁴ ¹⁵ ¹⁶ ¹⁷ ²³ ²⁴ ²⁵ ²⁶ ²⁷ ²⁸ ²⁹ ³⁰ ³³ ³⁵ ³⁸ ³⁹ - [sap_controller.py](https://github.com/mario-andreschak/mcp-sap-gui/blob/1bff66dbea315271e2dd874016a5aef085db3478/src/sap_gui_server/sap_controller.py)

¹⁸ ¹⁹ ²¹ - [help.sap.com - SAP GUI for Java PDF](https://help.sap.com/doc/f540a730ff3c46a29c34be1fd3cd3275/810.00/en-US/sap_gui_for_java.pdf)

²⁰ - [Open SAP without having to enter USER and password...](https://community.sap.com/t5/enterprise-resource-planning-q-a/open-sap-without-having-to-enter-user-and-password-saplogon-770/qaq-p/12791082)

²² - [SAP File Extension - What is it? How to open a SAP file?](https://filext.com/file-extension/SAP)

³¹ ³² ³⁶ - [Servidor SAP GUI de MCP | Glama](https://glama.ai/mcp/servers/@mario-andreschak/mcp-sap-gui?locale=es-ES)

³⁴ - [GitHub - mario-andreschak/mcp-sap-gui](https://github.com/mario-andreschak/mcp-sap-gui)

³⁷ - [SAP & Mac OS X - SAPGui and web browsers](https://community.sap.com/t5/additional-blog-posts-by-members/sap-amp-mac-os-x-sapgui-and-web-browsers/ba-p/12897314)
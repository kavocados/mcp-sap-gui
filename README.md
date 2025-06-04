# MCP SAP GUI Server

A Model Context Protocol (MCP) server for SAP GUI automation. This server provides tools to automate interactions with SAP GUI, enabling programmatic control of SAP transactions.

![image](https://github.com/user-attachments/assets/d14fc986-7ab5-4c83-a8c4-d768e2788add)

## Requirements

- Python 3.8 or higher
- SAP GUI installed and configured
- Valid SAP credentials (system, client, user, password)
- Node.js (for npx)

## Installation
0. Clone github folder and run the automated Install using the setup script for your platform:
```
Windows: setup.bat
macOS:   ./setup.sh
```
This will guide you through the build process and will integrate this directly in Cline or Roo, if you select so.

1. OR Manual Install using the build script:
```bash
Windows: build.bat
macOS:   ./build.sh
```

2. Configure SAP credentials:
- Copy `.env.example` to `.env`
- Update the values with your SAP credentials

3. Test server using mcp inspector:
```bash
Windows: run.bat debug
macOS:   ./run.sh debug
```

4. Use the integration script to automatically configure MCP settings:
```bash
Windows: integrate.bat cline  # Configure for Cline
Windows: integrate.bat roo    # Configure for Roo
macOS:   ./integrate.sh cline
macOS:   ./integrate.sh roo
```

The script will:
- Automatically determine the correct settings file path
- Create a backup before making any changes
- Safely update the MCP configuration
- Validate changes to prevent corruption

Manual Configuration (if needed):
```json
    "mcp-sap-gui": {
      "command": "python",
      "args": [
        "-m",
        "sap_gui_server.server"
      ],
      "cwd": "PATH_TO_YOUR_FOLDER/mcp-sap-gui",
      "disabled": false,
      "autoApprove": []
    }
```
5. Use this prompt to explain the Tool to your AI Model:
```
**Important Safety Notice:**
SAP is a highly sensitive system where incorrect interactions can have serious consequences. Every action must be performed with utmost precision and care. When in doubt about any action, STOP immediately and request user assistance.

**Available Tools:**
The `mcp-sap-gui` server provides tools for SAP GUI interaction:
* `launch_transaction`: Start a new transaction
* `sap_click`: Click at specific coordinates
* `sap_move_mouse`: Move mouse to coordinates
* `sap_type`: Enter text into fields
* `end_transaction`: Close the current transaction

**Technical Limitations and Requirements:**
1. You will receive only screenshot images of the SAP GUI window after each action
2. No direct access to screen element metadata or technical representation
3. You must use image recognition to:
   * Identify UI elements (fields, buttons, etc.)
   * Determine precise x/y coordinates for interactions
   * Verify element sizes and positions
4. All coordinates must be exact - approximate clicking is not acceptable

**Step-by-Step Process:**
1. Start SAP GUI Session:
   * Call `launch_transaction` with desired transaction code
   * Analyze the returned screenshot carefully
2. Interact with Screen:
   * Use image recognition to identify needed elements
   * Calculate exact coordinates for interaction
   * Execute appropriate action (`sap_click`, `sap_type`, etc.)
   * Verify result in next screenshot
3. Capture Screenshots:
   * Save screenshots at key points in the process
4. End Session:
   * Call `end_transaction` when finished

**Best Practices:**
1. Always verify screen state before any action
2. Double-check coordinates before clicking
3. Document each step with clear annotations
4. If uncertain about any element position, request user verification
5. Maintain consistent screenshot naming convention
```

## Available Tools

The MCP SAP GUI Server provides the following tools for SAP automation:

### Transaction Management
- `launch_transaction`: Launch a specific SAP transaction code
- `end_transaction`: End the current SAP transaction

### Interface Interaction
- `sap_click`: Click at specific coordinates in the SAP GUI window
- `sap_move_mouse`: Move mouse cursor to specific coordinates
- `sap_type`: Type text at the current cursor position
- `sap_scroll`: Scroll the SAP GUI screen (up/down)

### Screen Capture
- `save_last_screenshot`: Save the last captured screenshot of the SAP GUI window. Returns the absolute file path of the saved image.

### Screenshot Return Formats

All tools that interact with the SAP GUI window (launch_transaction, sap_click, sap_move_mouse, sap_type, sap_scroll) support different screenshot return formats controlled by the `return_screenshot` parameter:

1. `none` (Default): Only returns success/error messages
```json
{
    "type": "text",
    "text": "Status: success"
}
```

2. `as_file`: Saves screenshot to the specified target folder and returns the path
```json
{
    "type": "text",
    "text": "Screenshot saved as C:/path/to/file/screenshot.png"
}
```

Note: When using `as_file`, you must specify the target folder using the `as_file_target_folder` parameter. The folder will be created if it doesn't exist.

3. `as_base64`: Returns the raw base64 string
```json
{
    "type": "text",
    "text": "base64_encoded_string_here"
}
```

4. `as_imagecontent`: Returns MCP ImageContent object
```json
{
    "type": "image",
    "data": "base64_encoded_string_here",
    "mimeType": "image/png"
}
```

5. `as_imageurl`: Returns embedded resource with data URL
```json
{
    "type": "resource",
    "resource": {
        "uri": "application:image",
        "mimeType": "image/png",
        "text": "data:image/png;base64,..."
    }
}
```

Example usage:
```python
# Default - no screenshot
result = await client.call_tool("launch_transaction", {
    "transaction": "VA01"
})

# Save to specific folder
result = await client.call_tool("launch_transaction", {
    "transaction": "VA01",
    "return_screenshot": "as_file",
    "as_file_target_folder": "C:/screenshots"
})

# Get base64 string
result = await client.call_tool("launch_transaction", {
    "transaction": "VA01",
    "return_screenshot": "as_base64"
})
```

**Tool Parameter Summary:**

| Tool                | Parameter         | Type      | Default | Description                                                                |
|--------------------|-------------------|-----------|---------|----------------------------------------------------------------------------|
| `launch_transaction`| `transaction`     | `string`  |         | SAP transaction code to launch (e.g., VA01, ME21N, MM03)                   |
|                     | `return_screenshot`| `string`  | `none`  | Screenshot return format (`none`, `as_file`, `as_base64`, `as_imagecontent`, `as_imageurl`) |
|                     | `as_file_target_folder`| `string`  |         | Target folder path for saving screenshots when using 'as_file' return format |
| `sap_click`         | `x`               | `integer` |         | Horizontal pixel coordinate (0-1920) where the click should occur        |
|                     | `y`               | `integer` |         | Vertical pixel coordinate (0-1080) where the click should occur          |
|                     | `return_screenshot`| `string`  | `none`  | Screenshot return format (`none`, `as_file`, `as_base64`, `as_imagecontent`, `as_imageurl`) |
|                     | `as_file_target_folder`| `string`  |         | Target folder path for saving screenshots when using 'as_file' return format |
| `sap_move_mouse`    | `x`               | `integer` |         | Horizontal pixel coordinate (0-1920) to move the cursor to               |
|                     | `y`               | `integer` |         | Vertical pixel coordinate (0-1080) to move the cursor to                 |
|                     | `return_screenshot`| `string`  | `none`  | Screenshot return format (`none`, `as_file`, `as_base64`, `as_imagecontent`, `as_imageurl`) |
|                     | `as_file_target_folder`| `string`  |         | Target folder path for saving screenshots when using 'as_file' return format |
| `sap_type`          | `text`            | `string`  |         | Text to enter at the current cursor position in the SAP GUI window        |
|                     | `return_screenshot`| `string`  | `none`  | Screenshot return format (`none`, `as_file`, `as_base64`, `as_imagecontent`, `as_imageurl`) |
|                     | `as_file_target_folder`| `string`  |         | Target folder path for saving screenshots when using 'as_file' return format |
| `sap_scroll`        | `direction`       | `string`  |         | Direction to scroll the screen ('up' moves content down, 'down' moves up) |
|                     | `return_screenshot`| `string`  | `none`  | Screenshot return format (`none`, `as_file`, `as_base64`, `as_imagecontent`, `as_imageurl`) |
|                     | `as_file_target_folder`| `string`  |         | Target folder path for saving screenshots when using 'as_file' return format |
| `end_transaction`   |                   |           |         |                                                                            |
| `save_last_screenshot`| `filename`        | `string`  |         | Path where the screenshot will be saved                                  |

## Development

### Running Tests

1. Test server using mcp inspector (build + debug):
```bash
Windows: ./run.bat full
macOS:   ./run.sh full
```

2. Or use test suite:
The test suite includes live tests that interact with SAP GUI. Make sure you have SAP GUI installed and configured before running tests.

Run tests:
```bash
Windows: run.bat test server
macOS:   ./run.sh test server
```

The test suite includes:
- SapGuiServer tests (test_server.py)
  * Tool registration
  * Request handling
  * Response formatting
  * Error handling

## Project Structure

```
mcp-sap-gui/
├── src/
│   └── sap_gui_server/
│       ├── __init__.py
│       ├── sap_controller.py  # SAP GUI interaction logic
│       └── server.py         # MCP server implementation
├── tests/
│   ├── __init__.py
│   ├── test_sap_controller.py
│   └── test_server.py
├── build.bat / build.sh          # Build and test script
├── integrate.bat / integrate.sh  # Integration script for Cline/Roo
├── integrate.py       # Python script for safe MCP settings updates
├── requirements.txt   # Production dependencies
└── requirements-dev.txt  # Development dependencies
```

## License

[MIT License]

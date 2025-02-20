# MCP SAP GUI Server

A Model Context Protocol (MCP) server for SAP GUI automation. This server provides tools to automate interactions with SAP GUI, enabling programmatic control of SAP transactions.

## Requirements

- Python 3.8 or higher
- SAP GUI installed and configured
- Valid SAP credentials (system, client, user, password)
- Node.js (for npx)

## Installation

1. Install using build script:
```bash
./build.bat
```

2. Configure SAP credentials:
- Copy `credentials.env.example` to `.env`
- Update the values with your SAP credentials

3. Test server using mcp inspector:
```bash
./run.bat debug
```

4. Use the integration script to automatically configure MCP settings:
```bash
./integrate.bat cline  # Configure for Cline
./integrate.bat roo    # Configure for Roo
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
- `save_last_screenshot`: Save the last captured screenshot of the SAP GUI window

### Image Response Formats

All tools that interact with the SAP GUI window (launch_transaction, sap_click, sap_move_mouse, sap_type, sap_scroll, save_last_screenshot) return screenshots and support two response formats controlled by the `experimental` boolean parameter:

1. Industry Standard Format, used in Cline, Claude, Grok AI, etc. (Default, `experimental=false`):
```json
{
    "type": "image_url",
    "image_url": {
        "url": "data:image/png;base64,..."
    }
}
```

2. MCP Format (Experimental, `experimental=true`):
```python
[
    ImageContent(type="image", data="...", mimeType="image/png"),
    TextContent(type="text", text="...")  # Raw base64 string
]
```

Example usage:
```python
# Industry standard format (default)
result = await client.call_tool("launch_transaction", {
    "transaction": "VA01",
    "experimental": false  # or omit for default
})

# MCP format + raw base64
result = await client.call_tool("launch_transaction", {
    "transaction": "VA01",
    "experimental": true
})
```

Note: The `experimental` parameter is a boolean toggle, not a string. Use `true`/`false` in JSON or `True`/`False` in Python.

## Development

### Running Tests

1. Test server using mcp inspector (build + debug):
```bash
./run.bat full
```

2. Or use test suite:
The test suite includes live tests that interact with SAP GUI. Make sure you have SAP GUI installed and configured before running tests.

Run tests:
```bash
run.bat test server
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
├── build.bat          # Build and test script
├── integrate.bat      # Integration script for Cline/Roo
├── integrate.py       # Python script for safe MCP settings updates
├── requirements.txt   # Production dependencies
└── requirements-dev.txt  # Development dependencies
```


## License

[MIT License]

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
build.bat
```

2. Configure SAP credentials:
- Copy `credentials.env.example` to `credentials.env`
- Update the values with your SAP credentials

3. Test server using mcp inspector:
```bash
run.bat full
```

4. To use in Cline, set up a MCP configuration like this:

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

## Development

### Running Tests

1. Test server using mcp inspector:
```bash
run.bat full
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
├── requirements.txt   # Production dependencies
└── requirements-dev.txt  # Development dependencies
```


## License

[MIT License]

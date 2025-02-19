# MCP SAP GUI Server

A Model Context Protocol (MCP) server for SAP GUI automation.

## Requirements

- Python 3.8 or higher
- SAP GUI installed and configured
- Valid SAP credentials (system, client, user, password)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/mcp-sap-gui.git
cd mcp-sap-gui
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. For development, install additional dependencies:
```bash
pip install -r requirements-dev.txt
```

4. Configure SAP credentials:
- Copy `credentials.env.example` to `credentials.env`
- Update the values with your SAP credentials

## Development

### Running Tests

The test suite includes live tests that interact with SAP GUI. Make sure you have SAP GUI installed and configured before running tests.

1. Set up Python path:
```powershell
$env:PYTHONPATH = "$env:PYTHONPATH;$(Get-Location)\src"
```

2. Run tests:
```bash
pytest tests/ -v
```

Or use the build script:
```bash
.\build.bat
```

### Test Coverage

The test suite includes:
- SapController tests (test_sap_controller.py)
  * Initialization
  * Transaction launching
  * Mouse interactions
  * Keyboard input
  * Scrolling
  * Screenshot functionality
  * Session management

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

## Contributing

1. Install development dependencies:
```bash
pip install -r requirements-dev.txt
```

2. Run tests before submitting changes:
```bash
.\build.bat
```

3. Ensure all tests pass and maintain code coverage

## License

[Your License Here]

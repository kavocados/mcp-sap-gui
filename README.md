# MCP SAP GUI Server

A Model Context Protocol (MCP) server for SAP GUI automation.

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
2. Make sure you have SAP GUI installed, and maintained credentials.env with your Logon Data.
   
3. Configure SAP credentials:
- Copy `credentials.env.example` to `credentials.env`
- Update the values with your SAP credentials

4. Test server using mcp inspector:
```bash
run.bat full
```

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

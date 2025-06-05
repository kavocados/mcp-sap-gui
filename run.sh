#!/bin/bash
if [ "$1" = "test" ]; then
    if [ "$2" = "server" ]; then
        python -m pytest tests/test_server.py -v
    elif [ "$2" = "controller" ]; then
        python -m pytest tests/test_controller.py -v
    else
        python -m pytest tests/ -v
    fi
elif [ "$1" = "server" ]; then
    python -m src.sap_gui_server.server
elif [ "$1" = "debug" ]; then
    npx @modelcontextprotocol/inspector python -m sap_gui_server.server
elif [ "$1" = "full" ]; then
    ./build.sh
    ./run.sh debug
else
    echo "Invalid command."
    echo "Usage:"
    echo "  run.sh test [server|controller]"
    echo "  run.sh server"
    echo "  run.sh debug"
fi

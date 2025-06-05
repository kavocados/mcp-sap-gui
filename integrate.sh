#!/bin/bash
if [ "$1" = "cline" ]; then
    python integrate.py cline
elif [ "$1" = "roo" ]; then
    python integrate.py roo
else
    echo "Usage: integrate.sh [cline|roo]"
    exit 1
fi

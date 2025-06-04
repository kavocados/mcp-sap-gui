#!/bin/bash
pip install -r requirements.txt
pip install -r requirements-dev.txt
pip install -e .
npm install --package-lock-only
npm audit fix
python setup.py build

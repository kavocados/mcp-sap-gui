#!/bin/bash
./build.sh
if [ ! -f .env ]; then
    read -p "Enter SAP System: " SAP_SYSTEM
    read -p "Enter SAP Client: " SAP_CLIENT
    read -p "Enter SAP Username: " SAP_USER
    read -p "Enter SAP Password: " SAP_PASSWORD
    echo "SAP_SYSTEM=$SAP_SYSTEM" > .env
    echo "SAP_CLIENT=$SAP_CLIENT" >> .env
    echo "SAP_USER=$SAP_USER" >> .env
    echo "SAP_PASSWORD=$SAP_PASSWORD" >> .env
fi
read -p "Do you want to integrate with roo, cline, or no integration? (roo/cline/all/none): " INTEGRATION
if [ "$INTEGRATION" = "roo" ]; then
    ./integrate.sh roo
elif [ "$INTEGRATION" = "cline" ]; then
    ./integrate.sh cline
elif [ "$INTEGRATION" = "all" ]; then
    ./integrate.sh cline
    ./integrate.sh roo
fi
read -p "Do you want to run automatic tests? (y/n) recommended=n: " AUTO_TEST
if [ "$AUTO_TEST" = "y" ]; then
    python -m pytest tests/
fi
read -p "Do you want to run manual testing mode? (y/n) recommended=y: " MANUAL_TEST
if [ "$MANUAL_TEST" = "y" ]; then
    ./run.sh debug
fi
echo "Setup completed successfully!"

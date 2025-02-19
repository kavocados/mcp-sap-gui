# escape=`

# Use Windows Server Core as base image
FROM mcr.microsoft.com/windows/servercore:ltsc2019

# Set shell to PowerShell
SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]

# Install Python 3.10
RUN Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.10.0/python-3.10.0-amd64.exe' -OutFile 'python-3.10.0-amd64.exe'; `
    Start-Process python-3.10.0-amd64.exe -ArgumentList '/quiet InstallAllUsers=1 PrependPath=1' -Wait; `
    Remove-Item python-3.10.0-amd64.exe

# Install Poetry
RUN pip install poetry

# Set working directory
WORKDIR /app

# Copy project files
COPY pyproject.toml poetry.lock ./
COPY src/ ./src/
COPY credentials.env.example ./credentials.env

# Install dependencies
RUN poetry config virtualenvs.create false; `
    poetry install --no-dev

# Note: SAP GUI installation should be handled separately as it requires licensing
# The container should be run on a host with SAP GUI installed

# Set environment variables
ENV PYTHONPATH=/app/src

# Run the server
CMD ["python", "src/sap_gui_server/server.py"]

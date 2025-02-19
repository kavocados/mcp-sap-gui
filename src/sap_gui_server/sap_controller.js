import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';
import pkg from 'winreg';
const { Registry } = pkg;
import screenshotPkg from 'screenshot-desktop';
const { screenshot } = screenshotPkg;
import robotPkg from 'robotjs';
const robot = robotPkg;
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Configure logging
const logger = {
  info: (...args) => console.error('[INFO]', ...args),
  debug: (...args) => console.error('[DEBUG]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warning: (...args) => console.error('[WARN]', ...args)
};

// Load environment variables from credentials.env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(path.dirname(path.dirname(__dirname)), 'credentials.env');
try {
  dotenv.config({ path: envPath });
} catch (error) {
  logger.warning(`No credentials.env file found at ${envPath}`);
}

async function getDpiScale() {
  try {
    // For Windows, we can use the registry to get DPI settings
    if (process.platform === 'win32') {
      const reg = new Registry({
        hive: Registry.HKEY_CURRENT_USER,
        key: '\\Control Panel\\Desktop\\WindowMetrics'
      });

      const dpiValue = await new Promise((resolve, reject) => {
        reg.get('AppliedDPI', (err, item) => {
          if (err) reject(err);
          else resolve(item.value);
        });
      });

      const scale = parseInt(dpiValue) / 96.0; // 96 is the base DPI
      logger.debug(`DPI scale factor: ${scale}`);
      return scale;
    }
    return 1.0; // Default for non-Windows systems
  } catch (error) {
    logger.warning(`Failed to get DPI scale: ${error.message}`);
    return 1.0; // Default to no scaling
  }
}

async function findPopupWindow(processPid) {
  if (process.platform !== 'win32') {
    logger.warning('Finding popup window is only supported on Windows');
    return null;
  }

  try {
    // Use PowerShell to find the window
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
          [DllImport("user32.dll")]
          public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
          
          public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
          
          [DllImport("user32.dll")]
          public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
          
          [DllImport("user32.dll")]
          public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
          
          [DllImport("user32.dll")]
          public static extern bool IsWindowVisible(IntPtr hWnd);
        }
"@

      $windows = @()
      $enumCallback = {
        param([IntPtr]$hwnd, [IntPtr]$lparam)
        
        $processId = 0
        [Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId)
        
        if ([Win32]::IsWindowVisible($hwnd)) {
          $title = New-Object System.Text.StringBuilder 256
          [Win32]::GetWindowText($hwnd, $title, 256)
          
          if ($processId -eq ${processPid} -and $title.ToString().Contains("License Information for Multiple Logons")) {
            $windows += @{
              Handle = $hwnd.ToInt64()
              Title = $title.ToString()
              ProcessId = $processId
            }
          }
        }
        return $true
      }

      [Win32]::EnumWindows($enumCallback, [IntPtr]::Zero)
      $windows | ConvertTo-Json
    `;

    const { stdout } = await execAsync(`powershell -Command "${script}"`);
    const windows = JSON.parse(stdout);

    if (windows && windows.length > 0) {
      logger.debug(`Found popup window: ${JSON.stringify(windows[0])}`);
      return windows[0].Handle;
    }

    logger.debug('No matching popup window found');
    return null;
  } catch (error) {
    logger.error(`Error during window enumeration: ${error.message}`);
    return null;
  }
}

async function findSapWindow() {
  if (process.platform !== 'win32') {
    logger.warning('Finding SAP window is only supported on Windows');
    return null;
  }

  try {
    // Use PowerShell to find the SAP window
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
          [DllImport("user32.dll")]
          public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
          
          public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
          
          [DllImport("user32.dll")]
          public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
          
          [DllImport("user32.dll")]
          public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
          
          [DllImport("user32.dll")]
          public static extern bool IsWindowVisible(IntPtr hWnd);
          
          [DllImport("user32.dll")]
          public static extern IntPtr GetForegroundWindow();
        }
"@

      $windows = @()
      $enumCallback = {
        param([IntPtr]$hwnd, [IntPtr]$lparam)
        
        if ([Win32]::IsWindowVisible($hwnd)) {
          $processId = 0
          [Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId)
          
          $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
          if ($process -and $process.ProcessName -eq 'saplogon') {
            $title = New-Object System.Text.StringBuilder 256
            [Win32]::GetWindowText($hwnd, $title, 256)
            
            if (-not $title.ToString().Contains("SAP Logon")) {
              $windows += @{
                Handle = $hwnd.ToInt64()
                Title = $title.ToString()
                ProcessId = $processId
                IsActive = $hwnd -eq [Win32]::GetForegroundWindow()
              }
            }
          }
        }
        return $true
      }

      [Win32]::EnumWindows($enumCallback, [IntPtr]::Zero)
      $windows | ConvertTo-Json
    `;

    const { stdout } = await execAsync(`powershell -Command "${script}"`);
    const windows = JSON.parse(stdout);

    if (!windows || windows.length === 0) {
      logger.debug('No SAP GUI windows found');
      return null;
    }

    // Prefer active window if available
    const activeWindow = windows.find(w => w.IsActive);
    if (activeWindow) {
      logger.debug('Found active SAP GUI window');
      return activeWindow.Handle;
    }

    logger.debug('No active SAP GUI window found, using first window');
    return windows[0].Handle;
  } catch (error) {
    logger.error(`Error during window enumeration: ${error.message}`);
    return null;
  }
}

export class SapController {
  constructor() {
    this._initialized = false;
    this._dpiScale = 1.0; // Will be set in initialize()
    this._currentProcess = null;
    this.initialize();
    logger.debug('SapController initialized');
  }

  async initialize() {
    this._dpiScale = await getDpiScale();
  }

  async ensureSapWindowActive() {
    logger.debug('Ensuring SAP GUI window is active and maximized');

    try {
      const hwnd = await findSapWindow();
      if (!hwnd) {
        throw new Error('No SAP GUI window found');
      }

      // Use PowerShell to manipulate the window
      const script = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class Win32 {
            [DllImport("user32.dll")]
            public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
            
            [DllImport("user32.dll")]
            public static extern bool SetForegroundWindow(IntPtr hWnd);
            
            [DllImport("user32.dll")]
            public static extern IntPtr GetForegroundWindow();
          }
"@

        $hwnd = [IntPtr]${hwnd}
        
        # Restore if minimized (SW_RESTORE = 9)
        [Win32]::ShowWindow($hwnd, 9)
        Start-Sleep -Milliseconds 500
        
        # Maximize window (SW_MAXIMIZE = 3)
        [Win32]::ShowWindow($hwnd, 3)
        Start-Sleep -Milliseconds 500
        
        # Activate window
        [Win32]::SetForegroundWindow($hwnd)
        
        # Verify window is active
        $startTime = Get-Date
        $timeout = [TimeSpan]::FromSeconds(2)
        
        while ((Get-Date) - $startTime -lt $timeout) {
          if ([Win32]::GetForegroundWindow() -eq $hwnd) {
            Write-Output "Window successfully activated"
            break
          }
          [Win32]::SetForegroundWindow($hwnd)
          Start-Sleep -Milliseconds 100
        }
        
        if ([Win32]::GetForegroundWindow() -ne $hwnd) {
          Write-Output "Failed to activate window after timeout"
        }
      `;

      const { stdout } = await execAsync(`powershell -Command "${script}"`);
      logger.debug(stdout);
    } catch (error) {
      logger.error(`Failed to ensure SAP window is active: ${error.message}`);
      throw new Error(`Failed to activate SAP window: ${error.message}`);
    }
  }

  async handleMultipleLogonPopup() {
    logger.info('Checking for multiple logon popup...');

    try {
      if (!this._currentProcess) {
        logger.error('No active SAP GUI process');
        return;
      }

      const processPid = this._currentProcess.pid;
      logger.debug(`Looking for popup window for process ${processPid}`);

      // Try to find popup window with timeout
      const startTime = Date.now();
      const timeout = 3000; // 3 seconds
      let hwnd = null;

      while (Date.now() - startTime < timeout) {
        hwnd = await findPopupWindow(processPid);
        if (hwnd) {
          logger.debug(`Found popup window after ${(Date.now() - startTime) / 1000} seconds`);
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 500)); // Check every 500ms
      }

      if (!hwnd) {
        logger.error(`Could not find popup window after ${timeout / 1000} seconds`);
        return;
      }

      // Use PowerShell to handle the popup
      const script = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class Win32 {
            [DllImport("user32.dll")]
            public static extern bool SetForegroundWindow(IntPtr hWnd);
            
            [DllImport("user32.dll")]
            public static extern IntPtr GetForegroundWindow();
            
            [DllImport("user32.dll")]
            public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
            
            public struct RECT {
              public int Left;
              public int Top;
              public int Right;
              public int Bottom;
            }
          }
"@

        $hwnd = [IntPtr]${hwnd}
        
        # Activate window
        [Win32]::SetForegroundWindow($hwnd)
        Start-Sleep -Milliseconds 200
        
        # Get window dimensions
        $rect = New-Object Win32+RECT
        [Win32]::GetWindowRect($hwnd, [ref]$rect)
        
        $width = $rect.Right - $rect.Left
        $height = $rect.Bottom - $rect.Top
        
        @{
          Left = $rect.Left
          Top = $rect.Top
          Width = $width
          Height = $height
        } | ConvertTo-Json
      `;

      const { stdout } = await execAsync(`powershell -Command "${script}"`);
      const windowInfo = JSON.parse(stdout);

      // Calculate click position (38% from top)
      const clickX = windowInfo.Left + (windowInfo.Width / 2);
      const clickY = windowInfo.Top + (windowInfo.Height * 0.38);

      // Move mouse and click
      robot.moveMouse(clickX, clickY);
      await new Promise(resolve => setTimeout(resolve, 200));
      robot.mouseClick();

      // Press Enter to confirm
      robot.keyTap('enter');
      await new Promise(resolve => setTimeout(resolve, 3000));

      logger.info('Multiple logon popup handled successfully');
    } catch (error) {
      logger.error(`Error handling multiple logon popup: ${error.message}`);
      throw new Error(`Failed to handle multiple logon popup: ${error.message}`);
    }
  }

  async getSapGuiPath() {
    try {
      if (process.platform !== 'win32') {
        throw new Error('SAP GUI path retrieval is only supported on Windows');
      }

      // Try to get path from registry
      const reg = new Registry({
        hive: Registry.HKEY_LOCAL_MACHINE,
        key: '\\SOFTWARE\\WOW6432Node\\SAP\\SAPGUIFrontend'
      });

      const installPath = await new Promise((resolve, reject) => {
        reg.get('InstallationPath', (err, item) => {
          if (err) reject(err);
          else resolve(item.value);
        });
      });

      logger.debug(`Found SAP GUI path in registry: ${installPath}`);
      return installPath;
    } catch (error) {
      logger.warning(`Could not read SAP GUI path from registry: ${error.message}`);
      // Fall back to default path
      const defaultPath = 'C:\\Program Files\\SAP\\FrontEnd\\SAPGUI';
      logger.debug(`Using default SAP GUI path: ${defaultPath}`);
      return defaultPath;
    }
  }

  async launchTransaction(transaction) {
    logger.info(`Launching transaction: ${transaction}`);

    try {
      // Get SAP GUI path and construct full path to sapshcut
      const sapguiPath = await this.getSapGuiPath();
      const sapshcutPath = path.join(sapguiPath, 'sapshcut.exe');

      if (!await fs.access(sapshcutPath).then(() => true).catch(() => false)) {
        const errorMsg = `sapshcut.exe not found at: ${sapshcutPath}`;
        logger.error(errorMsg);
        throw new Error(`Failed to launch SAP: ${errorMsg}`);
      }

      // Get credentials from environment variables
      const system = process.env.SAP_SYSTEM;
      const client = process.env.SAP_CLIENT;
      const user = process.env.SAP_USER;
      const password = process.env.SAP_PASSWORD;

      // Validate required environment variables
      if (!system || !client || !user || !password) {
        throw new Error('Missing required SAP credentials in environment variables');
      }

      // Kill any existing SAP GUI processes
      logger.info('Killing any existing SAP GUI processes');
      await execAsync('taskkill /F /IM saplogon.exe').catch(() => {});
      await execAsync('taskkill /F /IM sapshcut.exe').catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Launch SAP GUI
      const cmd = [
        sapshcutPath,
        '-maxgui',
        `-system=${system}`,
        `-client=${client}`,
        `-command=${transaction}`,
        `-user=${user}`,
        `-pw=${password}`
      ].join(' ');

      logger.debug(`Using sapshcut path: ${sapshcutPath}`);
      const sapProcess = execAsync(cmd);
      this._currentProcess = sapProcess;

      // Wait for process to start
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Handle multiple logon popup
      await this.handleMultipleLogonPopup();

      // Take screenshot
      const image = await this.takeScreenshot();

      return {
        screenshot: image
      };
    } catch (error) {
      logger.error(`Failed to launch transaction ${transaction}: ${error.message}`);
      throw error;
    }
  }

  async clickPosition(x, y) {
    logger.debug(`Clicking at position (${x}, ${y})`);

    try {
      await this.ensureSapWindowActive();

      // Apply DPI scaling
      const scaledX = x * this._dpiScale;
      const scaledY = y * this._dpiScale;

      // Move mouse and click
      robot.moveMouse(scaledX, scaledY);
      await new Promise(resolve => setTimeout(resolve, 200));
      robot.mouseClick();
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        screenshot: await this.takeScreenshot()
      };
    } catch (error) {
      logger.error(`Failed to click at position (${x}, ${y}): ${error.message}`);
      throw new Error(`Failed to click at position: ${error.message}`);
    }
  }

  async moveMouse(x, y) {
    logger.debug(`Moving mouse to position (${x}, ${y})`);

    try {
      await this.ensureSapWindowActive();

      // Apply DPI scaling
      const scaledX = x * this._dpiScale;
      const scaledY = y * this._dpiScale;

      // Move mouse
      robot.moveMouse(scaledX, scaledY);
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        screenshot: await this.takeScreenshot()
      };
    } catch (error) {
      logger.error(`Failed to move mouse to position (${x}, ${y}): ${error.message}`);
      throw new Error(`Failed to move mouse: ${error.message}`);
    }
  }

  async typeText(text) {
    logger.debug(`Typing text: ${text}`);

    try {
      await this.ensureSapWindowActive();

      // Type text
      robot.typeString(text);
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        screenshot: await this.takeScreenshot()
      };
    } catch (error) {
      logger.error(`Failed to type text: ${error.message}`);
      throw new Error(`Failed to type text: ${error.message}`);
    }
  }

  async scrollScreen(direction) {
    logger.debug(`Scrolling screen ${direction}`);

    try {
      await this.ensureSapWindowActive();

      // Simulate scroll
      const scrollAmount = direction.toLowerCase() === 'down' ? -5 : 5;
      robot.scrollMouse(0, scrollAmount);
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        screenshot: await this.takeScreenshot()
      };
    } catch (error) {
      logger.error(`Failed to scroll ${direction}: ${error.message}`);
      throw new Error(`Failed to scroll: ${error.message}`);
    }
  }

  async endSession() {
    logger.info('Ending SAP session');
    try {
      await execAsync('taskkill /F /IM saplogon.exe').catch(() => {});
      await execAsync('taskkill /F /IM sapshcut.exe').catch(() => {});
      logger.info('SAP session ended successfully');
    } catch (error) {
      logger.error(`Error ending session: ${error.message}`);
      throw error;
    }
  }

  async takeScreenshot() {
    try {
      const image = await screenshot();
      return image.toString('base64');
    } catch (error) {
      logger.error(`Failed to take screenshot: ${error.message}`);
      throw new Error(`Failed to take screenshot: ${error.message}`);
    }
  }
}

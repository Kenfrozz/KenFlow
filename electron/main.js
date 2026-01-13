const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

const fs = require('fs');

// Set App User Model ID for Windows (critical for proper icon display in taskbar, start menu, desktop)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.kenflow.app');
}

let mainWindow;
let pythonProcess;

// File to store window state
const windowStatePath = path.join(app.getPath('userData'), 'window-state.json');

function getWindowState() {
  const defaultState = {
    width: 1200,
    height: 800,
    x: undefined,
    y: undefined,
    overlayX: undefined,
    overlayY: undefined
  };

  try {
    if (fs.existsSync(windowStatePath)) {
      const data = JSON.parse(fs.readFileSync(windowStatePath, 'utf8'));
      return { ...defaultState, ...data };
    }
  } catch (e) {
    console.error('Error reading window state:', e);
  }
  return defaultState;
}

function saveWindowState() {
  const currentState = getWindowState(); // Load existing to update partials

  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    currentState.width = bounds.width;
    currentState.height = bounds.height;
    currentState.x = bounds.x;
    currentState.y = bounds.y;
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const bounds = overlayWindow.getBounds();
    currentState.overlayX = bounds.x;
    currentState.overlayY = bounds.y;
  }

  try {
    fs.writeFileSync(windowStatePath, JSON.stringify(currentState));
  } catch (e) {
    console.error('Error saving window state:', e);
  }
}

let overlayWindow;

function createOverlayWindow() {
  if (overlayWindow) return;

  const state = getWindowState();

  overlayWindow = new BrowserWindow({
    width: 600,
    height: 60,
    x: state.overlayX,
    y: state.overlayY,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "icon.ico"),
  });

  overlayWindow.loadFile(path.join(__dirname, "overlay.html"));

  overlayWindow.on('move', saveWindowState);

  overlayWindow.on("closed", () => {
    overlayWindow = null;
    if (mainWindow) {
      mainWindow.webContents.send('overlay-closed');
      // mainWindow.show() removed to prevent resizing issue
    }
  });
}

// Selection Window (Overlay için mesaj seçimi)
let selectionWindow;

function createSelectionWindow() {
  if (selectionWindow) {
    selectionWindow.focus();
    return;
  }

  // Overlay'ın üstünde açılsın
  let x, y;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const bounds = overlayWindow.getBounds();
    x = bounds.x;
    y = bounds.y - 450 - 10; // Overlay'ın üstünde (pencere yüksekliği + boşluk)
    // Ekranın üstüne taşmasını önle
    if (y < 0) y = 10;
  }

  selectionWindow = new BrowserWindow({
    width: 320,
    height: 450,
    x: x,
    y: y,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#0a0a0f",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "icon.ico"),
  });

  selectionWindow.loadFile(path.join(__dirname, "selection.html"));

  selectionWindow.on("closed", () => {
    selectionWindow = null;
    // Overlay'a güncelleme gönder
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('ui-update');
    }
  });
}

// IPC Handlers for Selection Window
ipcMain.on('open-selection-window', () => {
  createSelectionWindow();
});

ipcMain.on('close-selection-window', () => {
  if (selectionWindow) {
    selectionWindow.close();
  }
});

// Window Selection Window (Hedef pencere seçimi)
let windowSelectionWindow;

function createWindowSelectionWindow() {
  if (windowSelectionWindow) {
    windowSelectionWindow.focus();
    return;
  }

  // Overlay'ın üstünde açılsın
  let x, y;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const bounds = overlayWindow.getBounds();
    x = bounds.x;
    y = bounds.y - 500 - 10;
    if (y < 0) y = 10;
  }

  windowSelectionWindow = new BrowserWindow({
    width: 340,
    height: 500,
    x: x,
    y: y,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#0a0a0f",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "icon.ico"),
  });

  windowSelectionWindow.loadFile(path.join(__dirname, "window-selection.html"));

  windowSelectionWindow.on("closed", () => {
    windowSelectionWindow = null;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('ui-update');
    }
  });
}

// IPC Handlers for Window Selection Window
ipcMain.on('open-window-selection-window', () => {
  createWindowSelectionWindow();
});

ipcMain.on('close-window-selection-window', () => {
  if (windowSelectionWindow) {
    windowSelectionWindow.close();
  }
});

// IPC Handlers for Overlay
ipcMain.on('open-overlay', () => {
  createOverlayWindow();
  // mainWindow.hide() removed to keep main window open
});

ipcMain.on('close-overlay', () => {
  if (overlayWindow) {
    overlayWindow.close();
  }
});

ipcMain.on('blur-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.blur();
  }
});

ipcMain.on('ui-update-trigger', () => {
  // Tüm pencerelere güncelleme sinyali gönder
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ui-update');
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('ui-update');
  if (selectionWindow && !selectionWindow.isDestroyed()) selectionWindow.webContents.send('ui-update');
});

ipcMain.on('resize-overlay', (event, { width, height }) => {
  if (overlayWindow) {
    // setSize bazen DPI scaling yüzünden sorunlu olabilir, setContentSize daha güvenli
    // Ayrıca animasyonlu geçiş yerine anlık geçiş yapalım
    overlayWindow.setContentSize(Math.round(width), Math.round(height), false);
  }
});

function createWindow() {
  const state = getWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 600,
    minHeight: 500,
    frame: false,
    transparent: false,
    backgroundColor: "#0a0a0f",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "icon.ico"),
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Save state on resize/move/close
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('close', saveWindowState);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function startPythonBackend() {
  let backendPath;
  let cwd;
  let spawnArgs;

  if (app.isPackaged) {
    // Production: Use the bundled exe
    backendPath = path.join(process.resourcesPath, "python", "kenflow-backend.exe");
    cwd = path.join(process.resourcesPath, "python");
    spawnArgs = { cwd: cwd, windowsHide: true };

    console.log(`Starting packaged backend: ${backendPath}`);
    pythonProcess = spawn(backendPath, [], spawnArgs);
  } else {
    // Development: Use python script
    const pythonPath = process.platform === "win32" ? "python" : "python3";
    const scriptPath = path.join(__dirname, "..", "python", "main.py");
    cwd = path.join(__dirname, "..", "python");

    console.log(`Starting dev backend: ${scriptPath}`);
    pythonProcess = spawn(pythonPath, [scriptPath], { cwd: cwd });
  }

  pythonProcess.stdout.on("data", (data) => {
    console.log(`Python: ${data}`);
  });

  pythonProcess.stderr.on("data", (data) => {
    const output = data.toString().trim();
    // Flask normal loglarını hata olarak gösterme
    // HTTP access logları (127.0.0.1), uyarılar ve başlangıç mesajları normal log
    const isNormalLog =
      output.includes('127.0.0.1') ||           // HTTP access logs
      output.includes('WARNING') ||
      output.includes('Running on') ||
      output.includes('Serving Flask') ||
      output.includes('Press CTRL+C') ||
      output.includes('Restarting with') ||
      output.includes('Debugger is') ||
      output.match(/^\s*\*\s/);                  // Flask asterisk lines

    if (isNormalLog) {
      // Sadece önemli logları göster, her HTTP isteğini değil
      if (!output.includes('127.0.0.1')) {
        console.log(`Python: ${output}`);
      }
    } else if (output.length > 0) {
      console.error(`Python Error: ${output}`);
    }
  });

  pythonProcess.on("close", (code) => {
    console.log(`Python process exited with code ${code}`);
  });

  pythonProcess.on("error", (err) => {
    console.error(`Failed to start Python backend: ${err.message}`);
  });
}

// Window control handlers
ipcMain.handle("window-minimize", () => {
  mainWindow.minimize();
});

ipcMain.handle("window-maximize", () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  } else {
    mainWindow.maximize();
    return true;
  }
});

ipcMain.handle("window-is-maximized", () => {
  return mainWindow.isMaximized();
});

ipcMain.handle("window-close", () => {
  mainWindow.close();
});

app.whenReady().then(() => {
  // Start Python backend immediately
  startPythonBackend();

  // Create window immediately (shows loading state)
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});

use tauri::Manager;

#[tauri::command]
pub fn start_sidecar(app: tauri::AppHandle) -> Result<String, String> {
    // Determine the path to the sidecar script
    // In dev, it might be relative to the CWD (project root).
    // In production (bundled), it will be in the resource directory.

    let mut script_path_buf = app
        .path()
        .resolve("sidecar/index.js", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;

    // Create a log file for the sidecar
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    if !log_dir.exists() {
        std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    }
    let log_path = log_dir.join("sidecar.log");

    // Open log file early to log path resolution steps
    let mut log_file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(true) // Append instead of truncate
        .open(&log_path)
        .ok();

    // Helper macro to log to file
    macro_rules! log {
        ($($arg:tt)*) => {
            if let Some(ref mut f) = log_file {
                use std::io::Write;
                let _ = writeln!(f, $($arg)*);
                let _ = f.flush();
            }
        };
    }

    log!("--- Sidecar Startup Debug ---");
    log!("Initial resolved path: {:?}", script_path_buf);
    log!("Exists? {}", script_path_buf.exists());

    // Fallback for dev environment
    if !script_path_buf.exists() {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        log!("CWD: {:?}", cwd);

        // Try relative to CWD (Project Root)
        let method1 = cwd.join("sidecar/index.js");
        log!("Method 1: {:?} (Exists: {})", method1, method1.exists());

        // Try relative to CWD parent (if CWD is src-tauri)
        let method2 = cwd.join("../sidecar/index.js");
        log!("Method 2: {:?} (Exists: {})", method2, method2.exists());

        // Try relative to CWD grandparent/great-grandparent (if CWD is target/release)
        let method3 = cwd.join("../../../sidecar/index.js");
        log!("Method 3: {:?} (Exists: {})", method3, method3.exists());

        if method1.exists() {
            script_path_buf = method1;
            log!("Selected Method 1");
        } else if method2.exists() {
            script_path_buf = method2;
            log!("Selected Method 2");
        } else if method3.exists() {
            script_path_buf = method3;
            log!("Selected Method 3");
        } else {
            log!(
                "Debug: Could not find sidecar at {:?} or {:?} or {:?} or {:?}",
                script_path_buf,
                method1,
                method2,
                method3
            );
        }
    } else {
        // Even if it exists via resolve, sometimes it's good to verify or handle case where
        // bundling might have flattened it.
        // If we resolved "sidecar/index.js" successfully, great.
        // But if the user reports MODULE_NOT_FOUND for "sidecar/index.js", maybe it's not there physically?
        // But resolve() returns a path.
    }

    // Fallback: If "sidecar/index.js" doesn't exist, try just "index.js" in resources
    if !script_path_buf.exists() {
        log!("Trying search for index.js inside resources root...");
        if let Ok(root_script) = app
            .path()
            .resolve("index.js", tauri::path::BaseDirectory::Resource)
        {
            log!(
                "Resource root/index.js: {:?} (Exists: {})",
                root_script,
                root_script.exists()
            );
            if root_script.exists() {
                script_path_buf = root_script;
            }
        }

        // Fallback 2: Recursively scan immediate subdirectories (e.g. _up_/sidecar/index.js)
        if !script_path_buf.exists() {
            if let Ok(resource_root) = app.path().resolve("", tauri::path::BaseDirectory::Resource)
            {
                log!("Scanning resource root: {:?}", resource_root);
                if let Ok(entries) = std::fs::read_dir(&resource_root) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_dir() {
                            // Try subfolder/index.js
                            let candidate = path.join("index.js");
                            if candidate.exists() {
                                script_path_buf = candidate;
                                log!("Found in subfolder: {:?}", script_path_buf);
                                break;
                            }
                            // Try subfolder/sidecar/index.js
                            let candidate2 = path.join("sidecar").join("index.js");
                            if candidate2.exists() {
                                script_path_buf = candidate2;
                                log!("Found in subfolder/sidecar: {:?}", script_path_buf);
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    // Check for bundled node.exe in the same directory as the script
    let mut node_path = "node".to_string();

    // Check if there is a node.exe in the sidecar folder (bundled)
    if let Some(parent) = script_path_buf.parent() {
        let bundled_node = parent.join("node.exe");
        if bundled_node.exists() {
            node_path = bundled_node.to_string_lossy().to_string();
            log!("Using bundled node: {}", node_path);
        } else {
            // Also check for "node" (binary) in case of linux/mac bundles if we ever support them
            let bundled_node_unix = parent.join("node");
            if bundled_node_unix.exists() {
                node_path = bundled_node_unix.to_string_lossy().to_string();
                log!("Using bundled node (unix): {}", node_path);
            } else {
                log!("Bundled node not found, using system node");
            }
        }
    }

    let script_path = script_path_buf.to_string_lossy().to_string();
    log!("Final script path: {}", script_path);

    // Spawn in a thread to avoid blocking main loop
    // Clone log output handles for thread
    // Note: Logging inside thread will need to reopen or share handle carefully.
    // For simplicity, reopen in append mode inside thread.

    let log_path_clone = log_path.clone();
    let script_path_clone = script_path.clone();
    let node_path_clone = node_path.clone();

    std::thread::spawn(move || {
        let mut f_thread = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(true)
            .open(&log_path_clone)
            .ok();

        if let Some(ref mut f) = f_thread {
            use std::io::Write;
            let _ = writeln!(f, "--- Spawning Thread ---");
            let _ = f.flush();
        }

        let stdout_file = f_thread.as_ref().and_then(|f| f.try_clone().ok());
        let stderr_file = f_thread.as_ref().and_then(|f| f.try_clone().ok());

        // Use bundled node if found, otherwise assume it is in PATH.
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let mut cmd = std::process::Command::new(&node_path_clone);
            // Handle long paths explicitly if needed, but usually strictly canonical paths work.
            // If path starts with \\?\, node might handle it.

            cmd.arg(&script_path_clone).creation_flags(CREATE_NO_WINDOW);

            if let Some(f) = stdout_file {
                cmd.stdout(f);
            }
            if let Some(f) = stderr_file {
                cmd.stderr(f);
            }

            let _ = cmd.spawn();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let mut cmd = std::process::Command::new(&node_path_clone);
            cmd.arg(&script_path_clone);

            if let Some(f) = stdout_file {
                cmd.stdout(f);
            }
            if let Some(f) = stderr_file {
                cmd.stderr(f);
            }

            let _ = cmd.spawn();
        }
    });

    Ok("Sidecar started".to_string())
}

#[tauri::command]
pub fn send_whatsapp_message(_number: String, _message: String) -> Result<String, String> {
    // Connect to WebSocket and send message
    // Using simple one-off connection for now, strictly for MVP.
    // ideally we keep a connection open in a shared state.

    // Requires 'tungstenite' or similar in Cargo.toml if we do this in Rust.
    // Or we can simple emit an event to the sidecar if we had a persistent IPC.

    // For this "Command Pattern", let's assume we send via WebSocket.

    Ok("Message queued".to_string())
}

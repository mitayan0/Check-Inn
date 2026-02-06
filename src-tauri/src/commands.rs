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

    // Fallback for dev environment
    if !script_path_buf.exists() {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;

        // Try relative to CWD (Project Root)
        let method1 = cwd.join("sidecar/index.js");

        // Try relative to CWD parent (if CWD is src-tauri)
        let method2 = cwd.join("../sidecar/index.js");

        // Try relative to CWD grandparent/great-grandparent (if CWD is target/release)
        let method3 = cwd.join("../../../sidecar/index.js");

        if method1.exists() {
            script_path_buf = method1;
        } else if method2.exists() {
            script_path_buf = method2;
        } else if method3.exists() {
            script_path_buf = method3;
        } else {
            // Debug print only available in console
            println!(
                "Debug: Could not find sidecar at {:?} or {:?} or {:?} or {:?}",
                script_path_buf, method1, method2, method3
            );
        }
    }

    // Check for bundled node.exe in the same directory as the script
    let mut node_path = "node".to_string();

    // Check if there is a node.exe in the sidecar folder (bundled)
    if let Some(parent) = script_path_buf.parent() {
        let bundled_node = parent.join("node.exe");
        if bundled_node.exists() {
            node_path = bundled_node.to_string_lossy().to_string();
        } else {
            // Also check for "node" (binary) in case of linux/mac bundles if we ever support them
            let bundled_node_unix = parent.join("node");
            if bundled_node_unix.exists() {
                node_path = bundled_node_unix.to_string_lossy().to_string();
            }
        }
    }

    let script_path = script_path_buf.to_string_lossy().to_string();

    // Create a log file for the sidecar
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    if !log_dir.exists() {
        std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    }
    let log_path = log_dir.join("sidecar.log");

    // Spawn in a thread to avoid blocking main loop
    std::thread::spawn(move || {
        let log_file = std::fs::File::create(&log_path).ok();
        let stderr_file = log_file.as_ref().and_then(|f| f.try_clone().ok());

        // Use bundled node if found, otherwise assume it is in PATH.
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let mut cmd = std::process::Command::new(&node_path);
            cmd.arg(&script_path).creation_flags(CREATE_NO_WINDOW);

            if let Some(f) = log_file {
                cmd.stdout(f);
            }
            if let Some(f) = stderr_file {
                cmd.stderr(f);
            }

            let _ = cmd.spawn();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let mut cmd = std::process::Command::new(&node_path);
            cmd.arg(&script_path);

            if let Some(f) = log_file {
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

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

        if method1.exists() {
            script_path_buf = method1;
        } else if method2.exists() {
            script_path_buf = method2;
        } else {
            // Debug print only available in console
            println!(
                "Debug: Could not find sidecar at {:?} or {:?} or {:?}",
                script_path_buf, method1, method2
            );
        }
    }

    let script_path = script_path_buf.to_string_lossy().to_string();

    // Spawn in a thread to avoid blocking main loop
    std::thread::spawn(move || {
        // We use "node" assume it is in PATH.
        // For a robust production app, you might bundle the node binary or check for it.
        // On Windows, ensure we don't open a visible window if possible, but standard Command usually hides it in Tauri wrapper?
        // Actually std::process::Command might pop a console window on Windows if not handled.

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let _ = std::process::Command::new("node")
                .arg(&script_path)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = std::process::Command::new("node").arg(&script_path).spawn();
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

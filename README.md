# Check-Inn Light

A Tauri 2.0 + Svelte 5 application for WhatsApp automation.

## Project Structure
- `src/`: Svelte 5 Frontend (Runes, TailwindCSS, Material Design)
- `src-tauri/`: Rust Backend (Commands, System Tray, SQL)
- `sidecar/`: Node.js Sidecar (WhatsApp Web Client)

## Setup
1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Install Sidecar Dependencies**:
   ```bash
   cd sidecar
   npm install
   cd ..
   ```
3. **Run Development Mode**:
   ```bash
   npm run tauri dev
   ```

## Architecture
- **Frontend**: Navigation Rail, Status Dashboard, History Table.
- **Backend**: Rust manages the Node.js sidecar lifecycle and SQLite database.
- **Sidecar**: Runs `whatsapp-web.js` and communicates via WebSocket (Port 3001) or standard IPC.

## Key Files
- `src/lib/stores/session.svelte.ts`: Reactive state management.
- `src-tauri/src/commands.rs`: Rust command implementations.
- `sidecar/index.js`: WhatsApp logic.

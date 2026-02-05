# Check Inn

**Check Inn** is a modern, lightweight desktop application designed to streamline your daily work reporting. Built with performance and privacy in mind, it acts as your personal attendance assistant, automating WhatsApp updates for check-ins, breaks, and daily stand-ups.


## 🚀 Features

*   **⚡ One-Click Check-ins**: Instantly send "Check In", "Break", and "Check Out" messages to your team or manager via WhatsApp.
*   **🤖 Automated Reporting**: Sends cleanly formatted daily stand-ups (Yesterday, Today, Blockers) with zero hassle.
*   **📊 Work Stats & Analytics**: Visualize your productivity with beautiful bar charts, tracking total hours worked and average session lengths.
*   **📝 Customizable Templates**: Personalize your message formats with dynamic variables like `{name}`, `{time}`, and `{date}`.
*   **📂 History & Export**: Keep a local log of all your sessions and export them to CSV for your records.
*   **👻 Background Mode**: Minimizes to the system tray to stay out of your way while keeping your session active.
*   **🔒 Private & Local**: All data is stored locally on your machine using SQLite. No cloud servers, no tracking.

## 🛠 Tech Stack

*   **Core**: [Tauri v2](https://tauri.app) (Rust) for an ultra-lightweight, secure footprint.
*   **Frontend**: [Svelte 5](https://svelte.dev) for high-performance, reactive UI.
*   **Styling**: TailwindCSS + Material Symbols for a clean, modern aesthetic.
*   **Automation**: Node.js Sidecar running `whatsapp-web.js` for reliable WhatsApp integration.
*   **Database**: SQLite for local data persistence.

## 📦 Installation

Download the latest installer (`.exe` or `.msi`) from the [Releases](https://github.com/mitayan0/Check-Inn/releases) page.

## 👨‍💻 Development

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/mitayan0/Check-Inn.git
    cd Check-Inn
    ```

2.  **Install Frontend Dependencies**:
    ```bash
    npm install
    ```

3.  **Install Sidecar Dependencies**:
    ```bash
    cd sidecar
    npm install
    cd ..
    ```

4.  **Run in Dev Mode**:
    ```bash
    npm run tauri dev
    ```

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

const { exec } = require('child_process');
const path = require('path');

// We look for processes with 'wwebjs_auth' in their command line
// This is the specific user data dir used by our whatsapp-web.js instance
const SEARCH_TERM = 'wwebjs_auth';

console.log(`Checking for stuck Chrome processes containing "${SEARCH_TERM}"...`);

// WMIC command to find process IDs
const wmicCmd = `wmic process where "name='chrome.exe' and commandline like '%${SEARCH_TERM}%'" get processid`;

exec(wmicCmd, (error, stdout, stderr) => {
    if (error) {
        // If wmic fails (e.g. no processes found returns error code sometimes), just log it
        console.log('WMIC check completed (possibly no processes found or error):', error.message);
        return;
    }

    // Parse PIDs
    const lines = stdout.split('\n');
    const pids = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        // Check if it's a number
        if (/^\d+$/.test(trimmed)) {
            pids.push(trimmed);
        }
    });

    if (pids.length === 0) {
        console.log('No stuck processes found.');
        return;
    }

    console.log(`Found ${pids.length} process(es) to kill: ${pids.join(', ')}`);

    // Kill ONLY these PIDs
    const killCmd = `taskkill /F ${pids.map(pid => `/PID ${pid}`).join(' ')}`;

    exec(killCmd, (killError, killStdout, killStderr) => {
        if (killError) {
            console.error('Failed to kill processes:', killError.message);
        } else {
            console.log('Successfully killed stuck processes.');
        }
    });
});

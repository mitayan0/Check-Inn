const { Client, LocalAuth } = require('whatsapp-web.js');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Load environment variables
try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {
    // Dotenv might not be installed or .env missing
}

// Setup file logging
const LOG_FILE = path.join(process.env.APPDATA || process.env.HOME || '.', 'check-inn-sidecar.log');
function log(msg, ...args) {
    const timestamp = new Date().toISOString();
    const formatted = args.length ? `${msg} ${JSON.stringify(args)}` : msg;
    const line = `[${timestamp}] ${formatted}\n`;
    try {
        fs.appendFileSync(LOG_FILE, line);
    } catch (e) {
        // Ignored
    }
    console.log(msg, ...args);
}

function logError(msg, err) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ERROR: ${msg} ${err ? (err.stack || err) : ''}\n`;
    try {
        fs.appendFileSync(LOG_FILE, line);
    } catch (e) {
        // Ignored
    }
    console.error(msg, err);
}

// Global error handlers
process.on('uncaughtException', (err) => {
    logError('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    logError('Unhandled Rejection at:', promise);
    logError('Reason:', reason);
});

// Constants
const PORT = 3002; // Internal port for IPC
const SESSION_DIR = path.join(process.env.APPDATA || '.', '.wwebjs_auth');
const HARDCODED_GEMINI_KEY = process.env.GEMINI_API_KEY;

log('Starting sidecar...');
log('Log file:', LOG_FILE);
log('Session dir:', SESSION_DIR);

// Initialize WebSocket Server
const wss = new WebSocket.Server({ port: PORT });
wss.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        log('Sidecar already running on port ' + PORT);
        process.exit(0); // Exit gracefully as another instance is serving
    } else {
        logError('WebSocket Server Error:', e);
        throw e;
    }
});

log(`Sidecar running on port ${PORT}`);

let client = null;

wss.on('connection', (ws) => {
    log('Client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleCommand(data, ws);
        } catch (e) {
            logError('Failed to parse message:', e);
        }
    });

    ws.on('error', (e) => {
        logError('WebSocket client error:', e);
    });
});

function handleCommand(data, ws) {
    switch (data.type) {
        case 'INIT':
            initWhatsApp(ws);
            break;
        case 'REFRESH_GROUPS':
            log('REFRESH_GROUPS command received');
            broadcast({ type: 'FETCHING_GROUPS', payload: true });
            getGroups()
                .then(groups => {
                    log(`REFRESH_GROUPS completed with ${groups.length} groups`);
                    ws.send(JSON.stringify({ type: 'GROUPS', payload: groups }));
                })
                .catch(err => {
                    logError('REFRESH_GROUPS error:', err);
                })
                .finally(() => {
                    broadcast({ type: 'FETCHING_GROUPS', payload: false });
                });
            break;
        case 'LOGOUT':
            log('LOGOUT command received... initiating cleanup');
            // Notify frontend that logout has started so it can show a spinner/loading state
            ws.send(JSON.stringify({ type: 'LOGOUT_PENDING' }));

            (async () => {
                let browserPid = null;

                if (client) {
                    // Try to get the browser PID before destroying
                    try {
                        if (client.pupBrowser && client.pupBrowser.process()) {
                            browserPid = client.pupBrowser.process().pid;
                            log('Browser PID captured:', browserPid);
                        }
                    } catch (e) {
                        log('Could not capture browser PID:', e.message);
                    }

                    try {
                        log('Client logout started...');
                        // Attempt valid logout with a timeout
                        const logoutPromise = client.logout();
                        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 3000));
                        await Promise.race([logoutPromise, timeoutPromise]);
                        log('Client logout finished (or timed out).');
                    } catch (e) {
                        logError('Logout failed/skipped:', e.message);
                    }

                    try {
                        log('Destroying browser instance...');
                        const destroyPromise = client.destroy();
                        const destroyTimeout = new Promise(resolve => setTimeout(resolve, 5000));
                        await Promise.race([destroyPromise, destroyTimeout]);
                        log('Browser destroy finished (or timed out).');
                    } catch (e) {
                        logError('Destroy failed:', e.message);
                    }

                    client = null;
                }

                isReady = false;
                lastQR = null;

                // Force kill the browser process if it's still running
                if (browserPid) {
                    try {
                        log('Force killing browser process:', browserPid);
                        process.kill(browserPid, 'SIGKILL');
                    } catch (e) {
                        log('Browser process already terminated or could not be killed:', e.message);
                    }
                }

                // Also try to kill any orphaned chrome processes associated with our session
                try {
                    const { execSync } = require('child_process');
                    // Windows-specific: kill any chrome processes using our session directory
                    if (process.platform === 'win32') {
                        log('Attempting to kill orphaned Chrome processes...');
                        try {
                            execSync('taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq about:blank" 2>nul', { stdio: 'ignore' });
                        } catch (e) {
                            // Ignore errors - no matching processes is fine
                        }
                    }
                } catch (e) {
                    log('Could not kill orphaned processes:', e.message);
                }

                // Wait longer for the OS to release file locks on the folder
                log('Waiting for file locks to be released...');
                await new Promise(resolve => setTimeout(resolve, 3000));

                // Notify frontend that we're disconnected now
                broadcast({ type: 'DISCONNECTED' });

                try {
                    log('Removing session directory:', SESSION_DIR);
                    // Use promisified version with retries
                    const removeWithRetry = async (retries = 5) => {
                        for (let i = 0; i < retries; i++) {
                            try {
                                await fs.promises.rm(SESSION_DIR, { recursive: true, force: true });
                                log('Session directory removed successfully.');
                                return true;
                            } catch (err) {
                                logError(`Remove attempt ${i + 1}/${retries} failed:`, err.message);
                                if (i < retries - 1) {
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                }
                            }
                        }
                        return false;
                    };

                    await removeWithRetry();
                } catch (fsErr) {
                    logError('FS cleanup error:', fsErr);
                }

                // Re-initialize to show QR code immediately for next user
                log('Re-initializing WhatsApp client...');
                initWhatsApp(ws);
            })();
            break;
        case 'SEND_MESSAGE':
            log('SEND_MESSAGE command received');
            sendMessage(data.payload, ws);
            break;
        case 'FETCH_GROUP_MESSAGES':
            log('FETCH_GROUP_MESSAGES command received');
            (async () => {
                try {
                    const { groupId, fromDate, toDate, userName } = data.payload;
                    ws.send(JSON.stringify({ type: 'ANALYZING', payload: true }));

                    const result = await fetchAndAnalyzeMessages(groupId, fromDate, toDate, userName);
                    ws.send(JSON.stringify({ type: 'ANALYSIS_RESULT', payload: result }));
                } catch (err) {
                    logError('FETCH_GROUP_MESSAGES error:', err);
                    ws.send(JSON.stringify({ type: 'ANALYSIS_ERROR', payload: err.message }));
                } finally {
                    ws.send(JSON.stringify({ type: 'ANALYZING', payload: false }));
                }
            })();
            break;
        case 'SUMMARIZE_TASKS':
            log('SUMMARIZE_TASKS command received');
            (async () => {
                try {
                    const { tasks, provider, apiKey, model } = data.payload;
                    const summary = await callLLM(tasks, provider, apiKey, model);
                    ws.send(JSON.stringify({ type: 'SUMMARY_RESULT', payload: summary }));
                } catch (err) {
                    logError('SUMMARIZE_TASKS error:', err);
                    ws.send(JSON.stringify({ type: 'SUMMARY_ERROR', payload: err.message }));
                }
            })();
            break;
        default:
            log('Unknown command:', data.type);
    }
}

/**
 * Universal LLM Caller
 */
async function callLLM(tasks, provider, apiKey, model) {
    let effectiveApiKey = apiKey;
    if (provider === 'gemini' && (!apiKey || apiKey.trim() === '')) {
        effectiveApiKey = HARDCODED_GEMINI_KEY;
    }

    if (!effectiveApiKey) throw new Error(`API Key missing for ${provider}`);
    if (!tasks || tasks.length === 0) return "No tasks to summarize.";

    const prompt = `You are a professional project manager. Summarize the following work tasks into a concise, professional achievement report. Use bullet points. Focus on outcomes. Keep it under 150 words.\n\nTasks:\n${tasks.join('\n')}`;

    if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1/models/${model || 'gemini-2.5-flash'}:generateContent?key=${effectiveApiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
            throw new Error('Invalid response structure from Gemini API');
        }
        return data.candidates[0].content.parts[0].text;
    }

    if (provider === 'groq' || provider === 'openrouter') {
        const url = provider === 'groq'
            ? 'https://api.groq.com/openai/v1/chat/completions'
            : 'https://openrouter.ai/api/v1/chat/completions';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://github.com/mitayan0/Check-Inn' } : {})
            },
            body: JSON.stringify({
                model: model || (provider === 'groq' ? 'llama3-8b-8192' : 'google/gemini-flash-1.5'),
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || data.error);
        if (!data.choices || !data.choices[0]?.message?.content) {
            throw new Error('Invalid response structure from API');
        }
        return data.choices[0].message.content;
    }

    throw new Error(`Unsupported provider: ${provider}`);
}

let lastQR = null;
let isReady = false;
let isReinitializing = false; // Prevent multiple reinitializations

// Helper to detect if an error indicates a stale/broken browser session
function isStaleSessionError(err) {
    if (!err) return false;
    const message = err.message || err.toString();
    return message.includes('detached Frame') ||
        message.includes('Execution context was destroyed') ||
        message.includes('Target closed') ||
        message.includes('Session closed') ||
        message.includes('Protocol error');
}

let reinitPromise = null; // Promise-based lock for reinitializeClient

// Reinitialize the WhatsApp client when the browser session becomes stale
async function reinitializeClient() {
    // Use promise-based lock to prevent race conditions
    if (reinitPromise) {
        log('Reinitialize already in progress, waiting for existing...');
        return reinitPromise;
    }

    reinitPromise = (async () => {
        isReinitializing = true;
        log('Reinitializing WhatsApp client due to stale session...');
        broadcast({ type: 'RECONNECTING' });

        try {
            let browserPid = null;

            if (client) {
                // Try to get the browser PID before destroying
                try {
                    if (client.pupBrowser && client.pupBrowser.process()) {
                        browserPid = client.pupBrowser.process().pid;
                        log('Browser PID captured for reinit:', browserPid);
                    }
                } catch (e) {
                    log('Could not capture browser PID:', e.message);
                }

                try {
                    const destroyPromise = client.destroy();
                    const destroyTimeout = new Promise(resolve => setTimeout(resolve, 5000));
                    await Promise.race([destroyPromise, destroyTimeout]);
                } catch (e) {
                    logError('Error destroying stale client:', e.message);
                }
                client = null;
            }
            isReady = false;
            lastQR = null;

            // Force kill the browser process if it's still running
            if (browserPid) {
                try {
                    log('Force killing stale browser process:', browserPid);
                    process.kill(browserPid, 'SIGKILL');
                } catch (e) {
                    log('Browser process already terminated:', e.message);
                }
            }

            // Wait a moment before reinitializing
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Initialize with the first connected WebSocket client
            const wsClient = [...wss.clients].find(c => c.readyState === WebSocket.OPEN);
            if (wsClient) {
                initWhatsApp(wsClient);
            } else {
                log('No connected WebSocket clients to reinitialize with');
            }
        } finally {
            isReinitializing = false;
            reinitPromise = null;
        }
    })();

    return reinitPromise;
}

function initWhatsApp(ws) {
    if (client) {
        // If client exists, assume we are reconnecting or fetching state.
        if (isReady) {
            ws.send(JSON.stringify({ type: 'READY' }));
            getGroups().then(groups => {
                ws.send(JSON.stringify({ type: 'GROUPS', payload: groups }));
            });
        } else if (lastQR) {
            ws.send(JSON.stringify({ type: 'QR', payload: lastQR }));
        }
        return;
    }

    log('Initializing WhatsApp Client...');

    try {
        client = new Client({
            authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--disable-extensions'
                ]
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2403.4.html',
            }
        });

        client.on('qr', (qr) => {
            log('QR Code received');
            lastQR = qr;
            isReady = false;
            // Broadcast to all connected clients (ignoring just this one for simplicity, or iterate wss.clients)
            broadcast({ type: 'QR', payload: qr });
        });

        client.on('ready', async () => {
            log('WhatsApp is ready!');
            isReady = true;
            lastQR = null;
            broadcast({ type: 'READY' });

            // Give WhatsApp Web some time to fully sync chat data before fetching groups
            // The 'ready' event fires before all chats are necessarily loaded
            log('Waiting for chat sync before fetching groups...');
            broadcast({ type: 'FETCHING_GROUPS', payload: true });
            await new Promise(resolve => setTimeout(resolve, 3000));

            log('Fetching groups...');
            const groups = await getGroups();
            broadcast({ type: 'GROUPS', payload: groups });
            broadcast({ type: 'FETCHING_GROUPS', payload: false });
        });

        client.on('auth_failure', (msg) => {
            logError('Auth failure:', msg);
            broadcast({ type: 'ERROR', payload: msg });
        });

        client.on('disconnected', (reason) => {
            log('Client disconnected:', reason);
            isReady = false;
            client = null;
            broadcast({ type: 'DISCONNECTED' });
        });

        client.initialize().catch(async err => {
            logError('Client initialization failed:', err);
            // Handle specific "browser already running" error
            if (err.message && err.message.includes('browser is already running')) {
                log('Detected stuck browser process. Attempting cleanup and retry...');
                try {
                    const { execSync } = require('child_process');
                    if (process.platform === 'win32') {
                        execSync('taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq about:blank" 2>nul', { stdio: 'ignore' });
                    }
                    // Wait a bit
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    // Retry initialization once
                    // We need to re-create the client or just re-call initialize? 
                    // Usually initialize() can't be called twice on same instance if failed partially?
                    // Safer to destroy and restart? 
                    // But here we are inside initWhatsApp.
                    // Valid retry strategy:
                    if (client) {
                        client.destroy().catch(() => { });
                        client = null;
                    }
                    // Recursive call to init (will create new client)
                    setTimeout(() => initWhatsApp(ws), 1000);
                } catch (retryErr) {
                    logError('Retry failed:', retryErr);
                }
            }
        });
    } catch (e) {
        logError('Failed to create/init client:', e);
    }
}

async function getGroups(retryCount = 0) {
    if (!client || !isReady) {
        log('getGroups: Client not ready');
        return [];
    }
    try {
        log(`Syncing Groups (Attempt ${retryCount + 1})...`);

        // 1. Primary method: Use the library's built-in getChats
        // This is usually the safest and most compatible way, but can hang on large accounts
        let chats = [];
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('getChats timed out')), 20000)
            );
            chats = await Promise.race([client.getChats(), timeoutPromise]);
            log(`Sync: Found ${chats.length} total chats in current session.`);
        } catch (err) {
            logError(`Sync: Primary getChats failed or timed out (${err.message}). Proceeding to fallback...`);
            // Check if primary method failed due to stale session - if so, reinit immediately
            if (isStaleSessionError(err)) {
                log('Detected stale browser session in primary getChats, triggering reinitialize...');
                reinitializeClient(); // Don't await, let it run in background
                return []; // Return empty and let reinit handle it
            }
            chats = []; // Ensure falls through to deep sync
        }

        let groups = chats
            .filter(chat => {
                // Broadest possible filter for groups
                const isGroup = chat.isGroup === true;
                // Fix: Use chat.id._serialized consistently, not chat._serialized
                const hasGroupId = chat.id && chat.id._serialized && chat.id._serialized.endsWith('@g.us');
                return isGroup || hasGroupId;
            })
            .map(chat => ({
                id: chat.id._serialized || chat.id,
                name: chat.name || chat.formattedTitle || 'Unnamed Group'
            }));

        log(`Sync: Primary method found ${groups.length} groups from ${chats.length} chats.`);

        // 2. Secondary method: Deep extraction fallback via multiple Store locations
        // If the library returns 0, it might be because its internal store isn't synced.
        // We try to pull directly from the browser's memory using multiple approaches.
        if (groups.length === 0 && client.pupPage) {
            log('Sync: Standard method returned 0 groups, trying direct browser sync...');
            try {
                const deepGroups = await client.pupPage.evaluate(() => {
                    const results = [];

                    // Method 1: Standard Store.Chat
                    if (window.Store && window.Store.Chat) {
                        try {
                            const chatModels = window.Store.Chat.getModelsArray ?
                                window.Store.Chat.getModelsArray() :
                                (window.Store.Chat._models || []);

                            chatModels.forEach(c => {
                                const chatId = c.id && c.id._serialized ? c.id._serialized : null;
                                if (c.isGroup || (chatId && chatId.endsWith('@g.us'))) {
                                    results.push({
                                        id: chatId,
                                        name: c.name || c.formattedTitle || c.contact?.name || 'Unnamed Group'
                                    });
                                }
                            });
                        } catch (e) {
                            console.error('Store.Chat method failed:', e);
                        }
                    }

                    // Method 2: GroupMetadata store (alternative location)
                    if (results.length === 0 && window.Store && window.Store.GroupMetadata) {
                        try {
                            const groupMeta = window.Store.GroupMetadata.getModelsArray ?
                                window.Store.GroupMetadata.getModelsArray() :
                                (window.Store.GroupMetadata._models || []);

                            groupMeta.forEach(g => {
                                const groupId = g.id && g.id._serialized ? g.id._serialized : null;
                                if (groupId) {
                                    results.push({
                                        id: groupId,
                                        name: g.subject || g.name || 'Unnamed Group'
                                    });
                                }
                            });
                        } catch (e) {
                            console.error('GroupMetadata method failed:', e);
                        }
                    }

                    return results;
                });

                if (deepGroups && deepGroups.length > 0) {
                    log(`Sync: Deep sync found ${deepGroups.length} groups.`);
                    groups = deepGroups;
                } else {
                    log('Sync: Deep sync also returned 0 groups.');
                }
            } catch (evalErr) {
                logError('Sync: Deep sync evaluation failed.', evalErr);
                // Check if this is a stale session error
                if (isStaleSessionError(evalErr)) {
                    log('Detected stale browser session, triggering reinitialize...');
                    reinitializeClient(); // Don't await, let it run in background
                    return []; // Return empty and let reinit handle it
                }
            }
        }

        log(`Sync: Identified ${groups.length} groups total.`);
        if (groups.length > 0 && groups.length <= 10) {
            groups.forEach(g => log(` - [${g.name}] (${g.id})`));
        }

        // 3. Retry logic with increasing delays
        // If we still have 0, it usually means WA Web is still "Loading chats..."
        if (groups.length === 0 && retryCount < 6) {
            // Use increasing delays: 3s, 4s, 5s, 6s, 7s, 8s
            const delay = 3000 + (retryCount * 1000);
            log(`Sync: No groups found yet. Waiting ${delay / 1000}s for WA data sync (attempt ${retryCount + 1}/6)...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return getGroups(retryCount + 1);
        }

        return groups;
    } catch (e) {
        logError('CRITICAL: getGroups failed:', e);
        // Check if this is a stale session error
        if (isStaleSessionError(e)) {
            log('Detected stale browser session in getGroups, triggering reinitialize...');
            reinitializeClient(); // Don't await, let it run in background
        }
        return [];
    }
}

function broadcast(msg) {
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(msg));
        }
    });
}

async function findGroupIdByName(targetName) {
    try {
        log(`Searching for group '${targetName}'...`);

        // 1. Try fast lookup via getChats (with timeout)
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('getChats timed out')), 5000)
            );
            const chats = await Promise.race([client.getChats(), timeoutPromise]);
            const group = chats.find(chat => chat.isGroup && (chat.name === targetName || chat.formattedTitle === targetName));
            if (group && group.id && group.id._serialized) return group.id._serialized;
        } catch (err) {
            logError(`findGroupIdByName: Primary lookup failed (${err.message}). Trying deep lookup...`);
        }

        // 2. Deep lookup via Puppeteer
        const groupId = await client.pupPage.evaluate((targetName) => {
            if (!window.Store || !window.Store.Chat) return null;
            const chats = window.Store.Chat.getModelsArray();
            const group = chats.find(c =>
                (c.isGroup || (c.id && c.id._serialized && c.id._serialized.endsWith('@g.us'))) &&
                (c.name === targetName || c.formattedTitle === targetName)
            );
            return (group && group.id && group.id._serialized) ? group.id._serialized : null;
        }, targetName);

        if (groupId) return groupId;

    } catch (e) {
        logError('findGroupIdByName error:', e);
    }
    return null;
}

async function sendMessage(payload, ws) {
    if (!client || !isReady) return;
    const { targetType, target, message } = payload;

    try {
        let chatId;

        if (targetType === 'self') {
            // Send to yourself
            chatId = client.info.wid._serialized;
        } else if (targetType === 'group') {
            chatId = await findGroupIdByName(target);
            if (!chatId) {
                throw new Error(`Group '${target}' not found (lookup failed)`);
            }
        } else {
            // Send to specific number
            const sanitized = target.replace(/\D/g, '');
            chatId = `${sanitized}@c.us`;
        }

        await client.sendMessage(chatId, message);
        ws.send(JSON.stringify({ type: 'MSG_SENT', payload: { target, message } }));
    } catch (error) {
        logError('Send failed:', error);
        ws.send(JSON.stringify({ type: 'ERROR', payload: error.toString() }));
    }
}

// ============== WORK HOURS ANALYZER ==============

/**
 * Parse a check-in message to extract data
 * Real format examples:
 *   * Name: Mitayan Chakma *
 *   * Daily Check-In: Sunday, February 08, 2026  3:19 PM
 *   (1) What did you do...
 *   => Task 1
 *   (2) What did you complete...
 *   => Task 2
 *   (3) What is blocking...
 *   => None
 */
/**
 * Helper to parse time override from message body (e.g. "1:20am")
 * Returns a new Date object if a valid time is found, otherwise null.
 * Uses the messageTimestamp as the base date.
 */
function parseTimeOverride(body, messageTimestamp) {
    // Regex for "1:20am", "1.20 pm", "13:00", etc. Requires delimiter between hours and minutes.
    const timeRegex = /\b(0?[1-9]|1[0-2]|1[3-9]|2[0-3])[:.]([ 0-5][0-9])\s*([aApP][mM])?\b/;
    const match = body.match(timeRegex);

    if (!match) return null;

    let [_, hours, minutes, modifier] = match;
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);

    // Handle AM/PM
    if (modifier) {
        modifier = modifier.toLowerCase();
        if (modifier === 'pm' && hours < 12) hours += 12;
        if (modifier === 'am' && hours === 12) hours = 0;
    }

    const overriddenDate = new Date(messageTimestamp);
    overriddenDate.setHours(hours, minutes, 0, 0);

    // If overridden date is significantly in the future relative to message (e.g. >1hr),
    // assume it refers to the previous day.
    if (overriddenDate > new Date(messageTimestamp.getTime() + 3600000)) {
        overriddenDate.setDate(overriddenDate.getDate() - 1);
    }

    return overriddenDate;
}


/**
 * Fetch messages from a group and analyze work hours
 * @param {string} groupId - WhatsApp group ID
 * @param {string} fromDateStr - Start date (YYYY-MM-DD)
 * @param {string} toDateStr - End date (YYYY-MM-DD)
 * @param {string} userName - Optional: filter by this user's name (partial match)
 */
/**
 * Core Algorithm: State Machine for Work Hours Analysis
 */
async function fetchAndAnalyzeMessages(groupId, fromDateStr, toDateStr) {
    const fromDate = new Date(fromDateStr);
    fromDate.setHours(0, 0, 0, 0);

    // Extend toDate to end of day
    const toDate = new Date(toDateStr);
    toDate.setHours(23, 59, 59, 999);

    const chat = await client.getChatById(groupId);
    if (!chat) throw new Error('Group not found');

    log(`Fetching messages from ${fromDateStr} to ${toDateStr} for Group: ${chat.name}`);

    // Fetch a manageable batch of messages to ensure we cover the range + buffer
    // 1000 is usually enough for 30-day activity and keeps analysis snappy.
    const messages = await chat.fetchMessages({ limit: 1000 });

    // Sort chronologically (oldest to newest)
    messages.sort((a, b) => a.timestamp - b.timestamp);

    log(`fetched ${messages.length} raw messages. Analyzing...`);

    // State Machine Storage
    const myPushName = client.info.pushname || 'Me';
    const myId = client.info.wid._serialized;
    const bufferDate = new Date(fromDate.getTime() - 172800000); // 48 hours buffer

    // We only track the single user (the connected account)
    const activeUser = {
        id: myId,
        name: myPushName,
        state: 'IDLE',
        currentSession: null,
        sessions: []
    };

    // Regex Patterns
    const REGEX_CHECKIN = /\*\s*Daily Check-In/i;
    const REGEX_CHECKOUT = /(?:checkout|check\s+out|chect\s+out)/i;
    const REGEX_TASKS_SECTION = /\(2\)([\s\S]*?)(?:\(3\)|\n\n|$)/i;
    const REGEX_TASKS_SIMPLE = /=>\s*(.+)/g;

    let processedCount = 0;

    // Helper: Cap session at 6 AM next day
    function capSessionAt6AM(session, context = "") {
        const SessionStart = new Date(session.start);
        const SessionDay = new Date(SessionStart);
        SessionDay.setHours(0, 0, 0, 0);

        const Cutoff = new Date(SessionDay);
        Cutoff.setDate(Cutoff.getDate() + 1);
        Cutoff.setHours(6, 0, 0, 0);

        if (session.end > Cutoff) {
            log(`[6AM Rule] (${context}) Capping session end from ${session.end.toLocaleString()} to ${Cutoff.toLocaleString()}`);
            session.end = Cutoff;
            session.duration = (session.end - session.start) / (1000 * 60);
            session.capped = true;
        }
    }

    // Helper: Extract tasks
    const checkTasks = (text) => {
        let tasks = [];
        const sectionMatch = text.match(REGEX_TASKS_SECTION);
        if (sectionMatch) {
            const rawTasks = sectionMatch[1];
            tasks = rawTasks
                .split(/\n|=>/)
                .map(t => t.trim())
                .filter(t => t.length > 2 && !t.startsWith('('));
        } else {
            const simpleMatches = [...text.matchAll(REGEX_TASKS_SIMPLE)];
            tasks = simpleMatches.map(m => m[1].trim());
        }
        return tasks;
    };

    // --- MAIN PROCESSING LOOP ---
    for (const msg of messages) {
        // Yield occasionally to keep event loop responsive
        processedCount++;
        if (processedCount % 100 === 0) {
            await new Promise(resolve => setImmediate(resolve));
        }
        const msgDate = new Date(msg.timestamp * 1000);
        if (msgDate < bufferDate) continue;

        // SELF-ONLY FILTER
        if (!msg.fromMe) continue;

        const body = msg.body || '';
        if (!body) continue;

        // --- PRE-PROCESS: REMOVE QUOTES ---
        const lines = body.split('\n');
        const cleanLines = lines.filter(l => !l.trim().startsWith('>'));
        const cleanBody = cleanLines.join('\n').trim();
        if (!cleanBody) continue;

        let user = activeUser;

        // --- EVENT 2: CHECK_OUT --- (Priority)
        if (REGEX_CHECKOUT.test(cleanBody)) {
            if (user.state === 'WORKING' && user.currentSession) {
                const overrideDate = parseTimeOverride(cleanBody, msgDate);
                const endDate = overrideDate || msgDate;
                const session = user.currentSession;
                session.end = endDate;

                const SessionStart = new Date(session.start);
                const SessionDay = new Date(SessionStart);
                SessionDay.setHours(0, 0, 0, 0);
                const Cutoff = new Date(SessionDay);
                Cutoff.setDate(Cutoff.getDate() + 1);
                Cutoff.setHours(6, 0, 0, 0);

                if (endDate > Cutoff) {
                    log(`[6AM Rule] Ignoring late checkout at ${endDate.toLocaleString()}`);
                    continue;
                }

                session.duration = (session.end - session.start) / (1000 * 60);
                if (session.duration < 0) session.duration = 0;

                user.sessions.push(session);
                log(`Self paired with checkout at ${endDate.toLocaleTimeString()}, duration: ${Math.round(session.duration)}m`);

                user.state = 'IDLE';
                user.currentSession = null;
            }
        }
        // --- EVENT 1: CHECK_IN ---
        else if (REGEX_CHECKIN.test(cleanBody)) {
            // Update name from Check-in if present
            const nameMatch = cleanBody.match(/\*\s*Name:\s*(.+?)\s*\*/i);
            if (nameMatch) activeUser.name = nameMatch[1].trim();

            if (user.state === 'WORKING' && user.currentSession) {
                const session = user.currentSession;
                session.end = msgDate;
                capSessionAt6AM(session, "AutoClose");
                session.duration = (session.end - session.start) / (1000 * 60);
                if (session.duration < 0) session.duration = 0;
                session.autoClosed = true;
                user.sessions.push(session);
                user.currentSession = null;
            }

            user.state = 'WORKING';
            const tasks = checkTasks(cleanBody);

            user.currentSession = {
                start: msgDate,
                date: msgDate.toLocaleDateString(),
                tasks: tasks,
                messages: [cleanBody]
            };

            log(`Found self-tracking check-in at ${msgDate.toLocaleTimeString()} (Name: ${user.name})`);
        }
    }

    // --- AGGREGATION ---
    const targetUsers = [activeUser];
    let filteredUsers = targetUsers;

    let sessionsInRange = [];

    for (const user of filteredUsers) {
        // Handle Unfinished Session
        if (user.state === 'WORKING' && user.currentSession) {
            const session = user.currentSession;
            const SessionStart = new Date(session.start);
            const SessionDay = new Date(SessionStart);
            SessionDay.setHours(0, 0, 0, 0);
            const Cutoff = new Date(SessionDay);
            Cutoff.setDate(Cutoff.getDate() + 1);
            Cutoff.setHours(6, 0, 0, 0);

            const Now = new Date();
            let effectiveEnd = Now;
            if (effectiveEnd > Cutoff) {
                effectiveEnd = Cutoff;
                session.capReason = "6AM_CUTOFF";
            } else {
                session.capReason = "ONGOING";
            }

            session.end = effectiveEnd;
            session.duration = (session.end - session.start) / (1000 * 60);
            session.isUnfinished = true;

            user.sessions.push(session);
        }

        for (const session of user.sessions) {
            if (session.start >= fromDate && session.start <= toDate) {
                sessionsInRange.push({
                    ...session,
                    userName: user.name
                });
            }
        }
    }

    // Group by Logical Date
    const sessionsByDate = new Map();
    for (const session of sessionsInRange) {
        // Use consistent Local Time for grouping
        // toDateString() gives "Mon Feb 09 2026" (Local)
        // We also want a YYYY-MM-DD string in Local Time for sorting/display
        const dateKey = session.start.toDateString();

        // Construct YYYY-MM-DD in Local Time
        const year = session.start.getFullYear();
        const month = String(session.start.getMonth() + 1).padStart(2, '0');
        const dayOfMonth = String(session.start.getDate()).padStart(2, '0');
        const dateIsoLocal = `${year}-${month}-${dayOfMonth}`;

        log(`Grouping session: ${session.start.toLocaleString()} -> Key: "${dateKey}", ISO: "${dateIsoLocal}"`);

        if (!sessionsByDate.has(dateKey)) {
            sessionsByDate.set(dateKey, {
                date: dateIsoLocal,
                displayDate: dateKey,
                sessions: [],
                totalMinutes: 0,
                tasks: new Set(),
                userName: session.userName
            });
        }

        const day = sessionsByDate.get(dateKey);
        day.sessions.push(session);
        day.totalMinutes += session.duration;
        session.tasks.forEach(t => day.tasks.add(t));
    }

    // Format for Frontend
    const formatCompactTime = (date) => {
        let hours = date.getHours();
        let minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const minStr = minutes > 0 ? ':' + minutes.toString().padStart(2, '0') : '';
        return `${hours}${minStr} ${ampm}`;
    };

    const resultWorkDays = Array.from(sessionsByDate.values()).map(day => {
        // Sort sessions by start time
        const sortedSessions = day.sessions.sort((a, b) => a.start - b.start);

        // Determine Break/Final
        sortedSessions.forEach((s, i) => {
            s.isBreak = i < sortedSessions.length - 1;
            s.isFinal = i === sortedSessions.length - 1;
        });

        const totalHours = Math.floor(day.totalMinutes / 60);
        const totalMins = Math.round(day.totalMinutes % 60);

        const sessionSummary = sortedSessions.map(s => {
            const startStr = formatCompactTime(s.start);
            const endStr = s.end ? formatCompactTime(s.end) : '???';
            const durStr = `${Math.floor(s.duration / 60)}h ${Math.round(s.duration % 60)}m`;
            const label = s.isFinal ? ' (final)' : s.isBreak ? ' (break)' : '';
            const note = s.isUnfinished ? ' [Auto-Capped]' : s.autoClosed ? ' [Auto-Closed]' : '';
            return `${startStr} to ${endStr} (${durStr})${label}${note}`;
        }).join('\n');

        return {
            date: day.date,
            checkInTime: formatCompactTime(sortedSessions[0].start),
            checkOutTime: sortedSessions[sortedSessions.length - 1].end
                ? formatCompactTime(sortedSessions[sortedSessions.length - 1].end)
                : 'Ongoing',
            duration: Math.round(day.totalMinutes),
            durationFormatted: `${totalHours}h ${totalMins}m`,
            yesterdayWork: [],
            todayFocus: Array.from(day.tasks),
            blockers: [],
            sessionCount: sortedSessions.length,
            sessionSummary: sessionSummary,
            name: day.userName,
            sessionList: sortedSessions.map(s => ({
                ...s,
                duration: Math.round(s.duration || 0),
                checkIn: formatCompactTime(s.start),
                checkOut: s.end ? formatCompactTime(s.end) : 'Ongoing'
            }))
        };
    });

    if (resultWorkDays.length > 0) {
        // Log summarized sessions for debugging if needed, but remove the noisy JSON dump
        log(`Analysis completed for ${resultWorkDays.length} days.`);
    }

    // Sort by date sortable
    resultWorkDays.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Grand Totals
    const grandTotalMinutes = resultWorkDays.reduce((sum, day) => sum + day.duration, 0);
    const grandHours = Math.floor(grandTotalMinutes / 60);
    const grandMins = Math.round(grandTotalMinutes % 60);

    const result = {
        groupName: chat.name,
        fromDate: fromDateStr,
        toDate: toDateStr,
        workDays: resultWorkDays,
        totalDays: resultWorkDays.length,
        totalSessions: sessionsInRange.length,
        totalHours: grandHours,
        totalMinutes: grandMins,
        totalFormatted: `${grandHours}h ${grandMins}m`,
        totalRawMinutes: grandTotalMinutes
    };

    return result;
}

const { Client, LocalAuth } = require('whatsapp-web.js');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

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
const PORT = 3001; // Internal port for IPC
const SESSION_DIR = path.join(process.env.APPDATA || '.', '.wwebjs_auth');

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
                if (client) {
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
                        await client.destroy();
                    } catch (e) {
                        logError('Destroy failed:', e.message);
                    }

                    client = null;
                }

                isReady = false;

                // Wait 1s for the OS to release file locks on the folder
                await new Promise(resolve => setTimeout(resolve, 1000));

                try {
                    log('Removing session directory:', SESSION_DIR);
                    fs.rm(SESSION_DIR, { recursive: true, force: true, maxRetries: 5 }, (err) => {
                        if (err) logError('Failed to remove session dir (locked?):', err);
                        else log('Session directory removed successfully.');

                        // Re-initialize to show QR code immediately for next user
                        // We must wait for the folder to be gone
                        initWhatsApp(ws);
                    });
                } catch (fsErr) {
                    logError('FS cleanup error:', fsErr);
                }
            })();
            break;
        case 'SEND_MESSAGE':
            log('SEND_MESSAGE command received');
            sendMessage(data.payload, ws);
            break;
        default:
            log('Unknown command:', data.type);
    }
}

let lastQR = null;
let isReady = false;

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

            log('Fetching groups...');
            broadcast({ type: 'FETCHING_GROUPS', payload: true });
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

        client.initialize().catch(err => {
            logError('Client initialization failed:', err);
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
                setTimeout(() => reject(new Error('getChats timed out')), 15000)
            );
            chats = await Promise.race([client.getChats(), timeoutPromise]);
            log(`Sync: Found ${chats.length} total chats in current session.`);
        } catch (err) {
            logError(`Sync: Primary getChats failed or timed out (${err.message}). Proceeding to fallback...`);
            chats = []; // Ensure falls through to deep sync
        }

        let groups = chats
            .filter(chat => {
                // Broadest possible filter for groups
                const isGroup = chat.isGroup === true;
                const isGroupId = chat.id && chat._serialized && chat._serialized.endsWith('@g.us');
                const isAltId = chat.id && chat.id._serialized && chat.id._serialized.endsWith('@g.us');
                return isGroup || isGroupId || isAltId;
            })
            .map(chat => ({
                id: chat.id._serialized || chat.id,
                name: chat.name || chat.formattedTitle || 'Unnamed Group'
            }));

        // 2. Secondary method: Deep extraction fallback
        // If the library returns 0, it might be because its internal store isn't synced.
        // We try to pull directly from the browser's memory.
        if (groups.length === 0) {
            log('Sync: Standard method returned 0 groups, trying direct browser sync...');
            try {
                const deepGroups = await client.pupPage.evaluate(() => {
                    if (!window.Store || !window.Store.Chat) return [];
                    return window.Store.Chat.getModelsArray()
                        .filter(c => c.isGroup || (c.id && c.id._serialized && c.id._serialized.endsWith('@g.us')))
                        .map(c => ({
                            id: c.id._serialized,
                            name: c.name || c.formattedTitle || 'Unnamed Group'
                        }));
                });
                if (deepGroups && deepGroups.length > 0) {
                    log(`Sync: Deep sync found ${deepGroups.length} groups.`);
                    groups = deepGroups;
                }
            } catch (evalErr) {
                logError('Sync: Deep sync evaluation failed.', evalErr);
            }
        }

        log(`Sync: Identified ${groups.length} groups:`);
        // groups.forEach(g => log(` - [${g.name}] (${g.id})`)); // Reduce spam

        // 3. Retry logic
        // If we still have 0, it usually means WA Web is still "Loading chats..."
        if (groups.length === 0 && retryCount < 4) {
            const delay = 4000;
            log(`Sync: No groups found yet. Waiting ${delay / 1000}s for WA data sync...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return getGroups(retryCount + 1);
        }

        return groups;
    } catch (e) {
        logError('CRITICAL: getGroups failed:', e);
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
            if (group) return group.id._serialized;
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
            return group ? group.id._serialized : null;
        }, targetName);

        if (groupId) return groupId;

    } catch (e) {
        logError('findGroupIdByName error:', e);
    }
    return null;
}

async function sendMessage(payload, ws) {
    if (!client) return;
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


const { Client, LocalAuth } = require('whatsapp-web.js');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Constants
const PORT = 3001; // Internal port for IPC
const SESSION_DIR = path.join(process.env.APPDATA || '.', '.wwebjs_auth');

// Initialize WebSocket Server
const wss = new WebSocket.Server({ port: PORT });
wss.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.log('Sidecar already running on port ' + PORT);
        process.exit(0); // Exit gracefully as another instance is serving
    } else {
        throw e;
    }
});

console.log(`Sidecar running on port ${PORT}`);

let client = null;

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        handleCommand(data, ws);
    });
});

function handleCommand(data, ws) {
    switch (data.type) {
        case 'INIT':
            initWhatsApp(ws);
            break;
        case 'REFRESH_GROUPS':
            console.log('REFRESH_GROUPS command received');
            broadcast({ type: 'FETCHING_GROUPS', payload: true });
            getGroups()
                .then(groups => {
                    console.log(`REFRESH_GROUPS completed with ${groups.length} groups`);
                    ws.send(JSON.stringify({ type: 'GROUPS', payload: groups }));
                })
                .catch(err => {
                    console.error('REFRESH_GROUPS error:', err);
                })
                .finally(() => {
                    broadcast({ type: 'FETCHING_GROUPS', payload: false });
                });
            break;
        case 'LOGOUT':
            console.log('LOGOUT command received... initiating cleanup');
            // Notify frontend that logout has started so it can show a spinner/loading state
            ws.send(JSON.stringify({ type: 'LOGOUT_PENDING' }));

            broadcast({ type: 'DISCONNECTED' });

            (async () => {
                if (client) {
                    try {
                        console.log('Client logout started...');
                        // Attempt valid logout with a timeout
                        const logoutPromise = client.logout();
                        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 3000));
                        await Promise.race([logoutPromise, timeoutPromise]);
                        console.log('Client logout finished (or timed out).');
                    } catch (e) {
                        console.warn('Logout failed/skipped:', e.message);
                    }

                    try {
                        console.log('Destroying browser instance...');
                        await client.destroy();
                    } catch (e) {
                        console.warn('Destroy failed:', e.message);
                    }

                    client = null;
                }

                isReady = false;

                // Wait 1s for the OS to release file locks on the folder
                await new Promise(resolve => setTimeout(resolve, 1000));

                try {
                    console.log('Removing session directory:', SESSION_DIR);
                    fs.rm(SESSION_DIR, { recursive: true, force: true, maxRetries: 5 }, (err) => {
                        if (err) console.error('Failed to remove session dir (locked?):', err);
                        else console.log('Session directory removed successfully.');

                        // Re-initialize to show QR code immediately for next user
                        // We must wait for the folder to be gone
                        initWhatsApp(ws);
                    });
                } catch (fsErr) {
                    console.error('FS cleanup error:', fsErr);
                }
            })();
            break;
        case 'SEND_MESSAGE':
            console.log('SEND_MESSAGE command received');
            sendMessage(data.payload, ws);
            break;
        default:
            console.log('Unknown command:', data.type);
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
        lastQR = qr;
        isReady = false;
        // Broadcast to all connected clients (ignoring just this one for simplicity, or iterate wss.clients)
        broadcast({ type: 'QR', payload: qr });
    });

    client.on('ready', async () => {
        isReady = true;
        lastQR = null;
        broadcast({ type: 'READY' });

        console.log('WhatsApp is ready! Fetching groups...');
        broadcast({ type: 'FETCHING_GROUPS', payload: true });
        const groups = await getGroups();
        broadcast({ type: 'GROUPS', payload: groups });
        broadcast({ type: 'FETCHING_GROUPS', payload: false });
    });

    client.on('auth_failure', (msg) => {
        broadcast({ type: 'ERROR', payload: msg });
    });

    client.on('disconnected', () => {
        isReady = false;
        client = null;
        broadcast({ type: 'DISCONNECTED' });
    });

    client.initialize();
}

async function getGroups(retryCount = 0) {
    if (!client || !isReady) {
        console.log('getGroups: Client not ready');
        return [];
    }
    try {
        console.log(`Syncing Groups (Attempt ${retryCount + 1})...`);

        // 1. Primary method: Use the library's built-in getChats
        // This is usually the safest and most compatible way, but can hang on large accounts
        let chats = [];
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('getChats timed out')), 15000)
            );
            chats = await Promise.race([client.getChats(), timeoutPromise]);
            console.log(`Sync: Found ${chats.length} total chats in current session.`);
        } catch (err) {
            console.warn(`Sync: Primary getChats failed or timed out (${err.message}). Proceeding to fallback...`);
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
            console.log('Sync: Standard method returned 0 groups, trying direct browser sync...');
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
                    console.log(`Sync: Deep sync found ${deepGroups.length} groups.`);
                    groups = deepGroups;
                }
            } catch (evalErr) {
                console.log('Sync: Deep sync evaluation failed.');
            }
        }

        console.log(`Sync: Identified ${groups.length} groups:`);
        groups.forEach(g => console.log(` - [${g.name}] (${g.id})`));

        // 3. Retry logic
        // If we still have 0, it usually means WA Web is still "Loading chats..."
        if (groups.length === 0 && retryCount < 4) {
            const delay = 4000;
            console.log(`Sync: No groups found yet. Waiting ${delay / 1000}s for WA data sync...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return getGroups(retryCount + 1);
        }

        return groups;
    } catch (e) {
        console.error('CRITICAL: getGroups failed:', e);
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
        console.log(`Searching for group '${targetName}'...`);

        // 1. Try fast lookup via getChats (with timeout)
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('getChats timed out')), 5000)
            );
            const chats = await Promise.race([client.getChats(), timeoutPromise]);
            const group = chats.find(chat => chat.isGroup && (chat.name === targetName || chat.formattedTitle === targetName));
            if (group) return group.id._serialized;
        } catch (err) {
            console.warn(`findGroupIdByName: Primary lookup failed (${err.message}). Trying deep lookup...`);
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
        console.error('findGroupIdByName error:', e);
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
        console.error('Send failed:', error);
        ws.send(JSON.stringify({ type: 'ERROR', payload: error.toString() }));
    }
}

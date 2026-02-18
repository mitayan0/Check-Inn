import { settings } from '../stores/settings.svelte';

class SidecarService {
    private ws: WebSocket | null = null;
    private queue: any[] = [];

    constructor() {
        this.connect();
    }

    private listeners: ((type: string, payload: any) => void)[] = [];

    // Reactive state for the actual WhatsApp connection status
    isWhatsAppReady = $state(false);
    availableGroups = $state<{ id: string, name: string }[]>([]);
    isFetchingGroups = $state(false);
    isConnected = $state(false);
    lastEvent = $state("");

    // Analyzer state
    isAnalyzing = $state(false);
    analysisResult = $state<any>(null);
    analysisError = $state<string | null>(null);

    // Shared Analysis Parameters (Sync between tabs)
    analysisParams = $state({
        groupId: "",
        fromDate: "",
        toDate: "",
        userName: ""
    });

    // LLM state
    isSummarizing = $state(false);
    aiSummary = $state<string | null>(null);
    summaryError = $state<string | null>(null);

    onMessage(callback: (type: string, payload: any) => void) {
        this.listeners.push(callback);
    }

    private notifyListeners(type: string, payload: any) {
        this.lastEvent = type;
        if (type === 'READY') this.isWhatsAppReady = true;
        if (type === 'DISCONNECTED') {
            this.isWhatsAppReady = false;
            this.availableGroups = [];
            this.isFetchingGroups = false;
        }
        if (type === 'QR') {
            this.isWhatsAppReady = false;
            this.isFetchingGroups = false;
        }
        if (type === 'GROUPS') {
            this.availableGroups = payload;
            this.isFetchingGroups = false;
        }
        if (type === 'FETCHING_GROUPS') {
            this.isFetchingGroups = payload;
        }
        if (type === 'RECONNECTING') {
            // Sidecar is reinitializing due to stale browser session
            this.isWhatsAppReady = false;
            this.availableGroups = [];
            this.isFetchingGroups = false;
        }
        // Analyzer events
        if (type === 'ANALYZING') {
            this.isAnalyzing = payload;
            if (payload) {
                this.analysisError = null;
            }
        }
        if (type === 'ANALYSIS_RESULT') {
            this.analysisResult = payload;
            this.isAnalyzing = false;
            this.aiSummary = null; // Clear old summary on new analysis
        }
        if (type === 'ANALYSIS_ERROR') {
            this.analysisError = payload;
            this.isAnalyzing = false;
        }
        // LLM events
        if (type === 'SUMMARY_RESULT') {
            this.aiSummary = payload;
            this.isSummarizing = false;
        }
        if (type === 'SUMMARY_ERROR') {
            this.summaryError = payload;
            this.isSummarizing = false;
        }

        this.listeners.forEach(cb => cb(type, payload));
    }

    private retryCount = 0;
    private maxFastRetries = 5; // Fast retries for initial connection

    async connect() {
        try {
            if (this.ws) {
                this.ws.close();
            }

            // Sidecar is auto-started from Rust backend, just connect to WebSocket
            this.ws = new WebSocket('ws://localhost:3005'); // Note: This port might need to be dynamic or configurable.

            this.ws.onopen = () => {
                console.log('Connected to Sidecar');
                this.isConnected = true;
                this.retryCount = 0; // Reset retry count on successful connection
                this.flushQueue();
                this.sendInit();
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.notifyListeners(data.type, data.payload);
                } catch (e) {
                    console.error('Failed to parse message from sidecar', e);
                }
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                this.retryCount++;

                // Use shorter retry for initial attempts (sidecar may still be starting)
                const retryDelay = this.retryCount <= this.maxFastRetries ? 1000 : 5000;
                console.log(`Sidecar disconnected, retrying in ${retryDelay / 1000}s... (attempt ${this.retryCount})`);

                setTimeout(() => this.connect(), retryDelay);
            };

            this.ws.onerror = (err) => {
                console.error('Sidecar connection error', err);
                this.isConnected = false;
                // Note: onerror is typically followed by onclose, so don't retry here
            };
        } catch (e) {
            console.error('Failed to connect', e);
            this.isConnected = false;
            this.retryCount++;

            const retryDelay = this.retryCount <= this.maxFastRetries ? 1000 : 5000;
            setTimeout(() => this.connect(), retryDelay);
        }
    }

    sendInit() {
        this.send({ type: 'INIT' });
    }

    send(data: any) {
        if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            this.queue.push(data);
        }
    }

    refreshGroups() {
        this.send({ type: 'REFRESH_GROUPS' });
    }

    analyzeWorkHours(groupId: string, fromDate: string, toDate: string, userName?: string) {
        this.analysisError = null;
        this.send({
            type: 'FETCH_GROUP_MESSAGES',
            payload: { groupId, fromDate, toDate, userName }
        });
    }

    summarizeTasks(tasks: string[]) {
        if (settings.llmProvider === 'none') {
            this.summaryError = "Please select an AI Provider in Settings.";
            return;
        }
        this.isSummarizing = true;
        this.summaryError = null;
        this.send({
            type: 'SUMMARIZE_TASKS',
            payload: {
                tasks,
                provider: settings.llmProvider,
                apiKey: settings.llmProvider === 'gemini' ? settings.geminiKey :
                    settings.llmProvider === 'groq' ? settings.groqKey :
                        settings.openRouterKey,
                model: settings.llmModel
            }
        });
    }

    logout() {
        this.send({ type: 'LOGOUT' });
    }

    flushQueue() {
        while (this.queue.length > 0) {
            const data = this.queue.shift();
            this.send(data);
        }
    }

    async sendToWhatsApp(message: string) {
        if (!settings.whatsappNumber && !settings.targetGroup) {
            console.warn('No target configured for WhatsApp');
            return;
        }

        const target = settings.targetType === 'group' ? settings.targetGroup : settings.whatsappNumber;

        if (!target) {
            console.warn('Target is empty');
            return;
        }

        this.send({
            type: 'SEND_MESSAGE',
            payload: {
                targetType: settings.targetType,
                target: target,
                message: message
            }
        });
    }
}

export const sidecar = new SidecarService();

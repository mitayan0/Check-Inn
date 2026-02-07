import { invoke } from '@tauri-apps/api/core';
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

        this.listeners.forEach(cb => cb(type, payload));
    }

    connect() {
        try {
            if (this.ws) {
                this.ws.close();
            }
            this.ws = new WebSocket('ws://localhost:3001');

            this.ws.onopen = () => {
                console.log('Connected to Sidecar');
                this.isConnected = true;
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
                console.log('Sidecar disconnected, retrying in 5s...');
                this.isConnected = false;

                // If auto-start is on, try to re-trigger the sidecar process
                if (settings.autoStart) {
                    invoke('start_sidecar').catch(console.error);
                }

                setTimeout(() => this.connect(), 5000);
            };

            this.ws.onerror = (err) => {
                console.error('Sidecar error', err);
                this.isConnected = false;
            };
        } catch (e) {
            console.error('Failed to connect', e);
            this.isConnected = false;

            if (settings.autoStart) {
                invoke('start_sidecar').catch(console.error);
            }
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

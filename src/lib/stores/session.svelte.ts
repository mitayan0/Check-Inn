import { sidecar } from '../services/sidecar.svelte';
import { settings } from './settings.svelte';
import Database from "@tauri-apps/plugin-sql";

export type SessionStatus = 'checked_in' | 'break' | 'checked_out';

export interface Task {
    id: string;
    description: string;
    completed: boolean;
}

export interface Break {
    start: Date;
    end?: Date;
}

export class SessionStore {
    status: SessionStatus = $state('checked_out');
    startTime: Date | null = $state(null);
    breaks: Break[] = $state([]);
    tasks: Task[] = $state([]);

    // New: track the standup fields for persistence
    reportData = $state({
        yesterday: '',
        today: '',
        blockers: ''
    });

    // Derived state example
    isConnected = $derived(this.status !== 'checked_out');

    constructor() {
        this.loadState();
    }

    private loadState() {
        const saved = localStorage.getItem('active_session');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.status = data.status;
                if (data.startTime) this.startTime = new Date(data.startTime);
                if (data.breaks) this.breaks = data.breaks.map((b: any) => ({
                    start: new Date(b.start),
                    end: b.end ? new Date(b.end) : undefined
                }));
                this.tasks = data.tasks || [];
                // Restore report data if exists
                if (data.reportData) this.reportData = data.reportData;
                console.log('Session restored from storage');
            } catch (e) {
                console.error('Failed to restore session', e);
            }
        }
    }

    private saveState() {
        localStorage.setItem('active_session', JSON.stringify({
            status: this.status,
            startTime: this.startTime,
            breaks: this.breaks,
            tasks: this.tasks,
            reportData: this.reportData
        }));
    }

    checkIn(note?: string, report?: { yesterday: string, today: string, blockers: string }) {
        this.status = 'checked_in';
        this.startTime = new Date();
        if (report) this.reportData = report;
        this.saveState();

        const msg = this.formatMessage(settings.checkInTemplate, note);
        this.sendUpdate(msg);
    }

    private async saveSession(start: Date) {
        console.log('Attempting to save session starting at:', start);
        try {
            const db = await Database.load('sqlite:data.db');
            const now = new Date();
            const duration = Math.round((now.getTime() - start.getTime()) / 60000);

            // We store the report data as a JSON string in the 'tasks' column
            const tasksJson = JSON.stringify(this.reportData);

            await db.execute(
                'INSERT INTO sessions (date, start_time, end_time, duration_minutes, tasks) VALUES (?, ?, ?, ?, ?)',
                [
                    now.toISOString().split('T')[0],
                    start.toISOString(),
                    now.toISOString(),
                    duration,
                    tasksJson
                ]
            );
            console.log('Session saved successfully.');
        } catch (e) {
            console.error('CRITICAL: Failed to save session to database:', e);
        }
    }

    async getRecentSessions(): Promise<any[]> {
        console.log('Fetching recent sessions...');
        try {
            const db = await Database.load('sqlite:data.db');

            // DEBUG: Log all table info
            const tableInfo = await db.select("PRAGMA table_info(sessions)");
            console.log('Sessions Table Schema:', tableInfo);

            const results: any[] = await db.select('SELECT * FROM sessions ORDER BY id DESC LIMIT 50');
            console.log('Fetched raw results:', results);

            // Filter out incomplete sessions in JS if needed, but let's see what's there first
            return results;
        } catch (e) {
            console.error('Failed to get sessions:', e);
            return [];
        }
    }

    async getLastSessionReport() {
        try {
            const db = await Database.load('sqlite:data.db');
            const results: any[] = await db.select('SELECT tasks FROM sessions WHERE end_time IS NOT NULL ORDER BY id DESC LIMIT 1');
            if (results.length > 0 && results[0].tasks) {
                return JSON.parse(results[0].tasks);
            }
        } catch (e) {
            console.error('Failed to get last session report:', e);
        }
        return null;
    }

    async deleteSessions(ids: number[]) {
        try {
            const db = await Database.load('sqlite:data.db');
            if (ids.length === 0) return;
            // distinct ids just in case
            const uniqueIds = [...new Set(ids)];
            const placeHolders = uniqueIds.map(() => '?').join(',');
            await db.execute(`DELETE FROM sessions WHERE id IN (${placeHolders})`, uniqueIds);
            console.log('Deleted sessions:', uniqueIds);
        } catch (e) {
            console.error('Failed to delete sessions:', e);
        }
    }

    async exportToCSV() {
        const sessions: any[] = await this.getRecentSessions();
        if (sessions.length === 0) return;

        let csv = 'Date,Start,End,Duration(min),Yesterday,Today,Blockers\n';

        sessions.forEach((s: any) => {
            let y = '', t = '', b = '';
            try {
                if (s.tasks) {
                    const data = JSON.parse(s.tasks);
                    y = `"${(data.yesterday || '').replace(/"/g, '""')}"`;
                    t = `"${(data.today || '').replace(/"/g, '""')}"`;
                    b = `"${(data.blockers || '').replace(/"/g, '""')}"`;
                }
            } catch (e) { }

            csv += `${s.date},${s.start_time},${s.end_time || ''},${s.duration_minutes || 0},${y},${t},${b}\n`;
        });

        // Use Tauri's save dialog and file system if possible, otherwise fallback
        try {
            // Dynamic import to avoid issues if plugins aren't installed yet
            const { save } = await import('@tauri-apps/plugin-dialog');
            const { writeTextFile } = await import('@tauri-apps/plugin-fs');

            const path = await save({
                filters: [{
                    name: 'CSV',
                    extensions: ['csv']
                }],
                defaultPath: `sessions_export_${new Date().toISOString().split('T')[0]}.csv`
            });

            if (path) {
                await writeTextFile(path, csv);
                console.log('File saved to', path);
                sidecar.sendToWhatsApp(`Statistics exported to: ${path}`); // Optional: notify user via bot log?
            }
        } catch (e) {
            console.warn('Native save failed, falling back to browser download', e);
            // Fallback to browser download
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('hidden', '');
            a.setAttribute('href', url);
            a.setAttribute('download', `sessions_export_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    }

    async checkOut(note?: string) {
        if (this.startTime) {
            // Wait for save to complete before clearing state
            await this.saveSession(this.startTime);
        }

        this.status = 'checked_out';
        this.startTime = null;
        this.breaks = [];
        this.tasks = [];
        // Optionally clear reportData on checkout? 
        // User probably wants it cleared for next day, but not absolutely required.
        this.reportData = { yesterday: '', today: '', blockers: '' };
        this.saveState();

        const msg = this.formatMessage(settings.checkOutTemplate, note);
        this.sendUpdate(msg);
    }

    startBreak(note?: string) {
        if (this.status === 'checked_in') {
            this.status = 'break';
            this.breaks.push({ start: new Date() });
            this.saveState();

            const msg = this.formatMessage(settings.breakStartTemplate, note);
            this.sendUpdate(msg);
        }
    }

    endBreak(note?: string) {
        if (this.status === 'break') {
            this.status = 'checked_in';
            const currentBreak = this.breaks[this.breaks.length - 1];
            if (currentBreak) currentBreak.end = new Date();
            this.saveState();

            const msg = this.formatMessage(settings.breakEndTemplate, note);
            this.sendUpdate(msg);
        }
    }

    addTask(description: string) {
        this.tasks.push({
            id: crypto.randomUUID(),
            description,
            completed: false
        });
    }

    private sendUpdate(message: string) {
        sidecar.sendToWhatsApp(message);
    }

    private formatMessage(template: string, note?: string): string {
        // Handle explicit report override (internal logic from sendUpdate previously)
        if (note && note.trim().startsWith('***')) {
            return note.trim();
        }

        const now = new Date();
        const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const date = now.toLocaleDateString();
        const name = settings.userName || 'Me';

        // default to "Check In" "Check Out" etc if template is missing but that shouldn't happen with defaults
        const safeTemplate = template || '{time}';

        let msg = safeTemplate
            .replace('{time}', time)
            .replace('{date}', date)
            .replace('{name}', name);

        if (note && note.trim()) {
            msg += `\n${note.trim()}`;
        }
        return msg;
    }
}

export const session = new SessionStore();

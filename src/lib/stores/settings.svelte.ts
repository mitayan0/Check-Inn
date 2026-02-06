export interface AppSettings {
    whatsappNumber: string | null;
    autoStart: boolean;
    userName: string | null;
}

export class SettingsStore {
    whatsappNumber = $state<string | null>(null);
    autoStart = $state(true);
    userName = $state<string | null>('My Name');
    targetType = $state<'self' | 'group'>('self');
    targetGroup = $state<string | null>(null);

    // Message Templates
    checkInTemplate = $state('*Check In* {time}');
    checkOutTemplate = $state('*Check Out* {time}');
    breakStartTemplate = $state('*Taking a Break* {time}');
    breakEndTemplate = $state('*Check In* {time}');

    constructor() {
        this.load();
    }

    load() {
        const stored = localStorage.getItem('check-inn-settings');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                this.whatsappNumber = data.whatsappNumber ?? null;
                this.autoStart = data.autoStart ?? false;
                this.userName = data.userName ?? null;
                this.targetType = data.targetType ?? 'self';
                this.targetGroup = data.targetGroup ?? null;

                // Load templates or use defaults
                if (data.checkInTemplate) this.checkInTemplate = data.checkInTemplate;
                if (data.checkOutTemplate) this.checkOutTemplate = data.checkOutTemplate;
                if (data.breakStartTemplate) this.breakStartTemplate = data.breakStartTemplate;
                if (data.breakEndTemplate) this.breakEndTemplate = data.breakEndTemplate;
            } catch (e) {
                console.error('Failed to load settings', e);
            }
        }
    }

    save() {
        localStorage.setItem('check-inn-settings', JSON.stringify({
            whatsappNumber: this.whatsappNumber,
            autoStart: this.autoStart,
            userName: this.userName,
            targetType: this.targetType,
            targetGroup: this.targetGroup,
            checkInTemplate: this.checkInTemplate,
            checkOutTemplate: this.checkOutTemplate,
            breakStartTemplate: this.breakStartTemplate,
            breakEndTemplate: this.breakEndTemplate
        }));
    }

    setWhatsappNumber(number: string) {
        this.whatsappNumber = number;
        this.save();
    }

    removeWhatsappNumber() {
        this.whatsappNumber = null;
        this.save();
    }

    toggleAutoStart() {
        this.autoStart = !this.autoStart;
        this.save();
    }

    setTargetType(type: 'self' | 'group') {
        this.targetType = type;
        this.save();
    }

    setTargetGroup(group: string) {
        this.targetGroup = group;
        this.save();
    }
}

export const settings = new SettingsStore();

import type { Component } from 'svelte';
import Dashboard from '../../routes/Dashboard.svelte';
import History from '../../routes/History.svelte';
import Settings from '../../routes/Settings.svelte';
import Stats from '../../routes/Stats.svelte';
import Analyzer from '../../routes/Analyzer.svelte';

export interface Module {
    id: string;
    name: string;
    icon: string; // Emoji for now, could be SVG component
    component: Component;
    order: number;
}

const modules: Module[] = [
    {
        id: 'dashboard',
        name: 'Dashboard',
        icon: 'dashboard',
        component: Dashboard,
        order: 1
    },
    {
        id: 'stats',
        name: 'Insights',
        icon: 'insights',
        component: Stats,
        order: 2
    },
    {
        id: 'analyzer',
        name: 'Analyzer',
        icon: 'query_stats',
        component: Analyzer,
        order: 3
    },
    {
        id: 'history',
        name: 'History',
        icon: 'calendar_month',
        component: History,
        order: 4
    },
    {
        id: 'settings',
        name: 'Settings',
        icon: 'settings',
        component: Settings,
        order: 99
    }
];

export function getModules(): Module[] {
    return modules.sort((a, b) => a.order - b.order);
}

export function registerModule(module: Module) {
    modules.push(module);
}

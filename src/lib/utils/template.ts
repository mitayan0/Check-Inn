/**
 * Replaces placeholders in a template string with values.
 * Supported placeholders: {name}, {date}, {day}, {tasks}
 */
export function processTemplate(template: string, data: { name: string; tasks: string[] }): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const dayStr = now.toLocaleDateString('en-US', { weekday: 'long' });

    // Format tasks as a list
    const tasksStr = data.tasks.length > 0
        ? data.tasks.map(t => `- ${t}`).join('\n')
        : 'No tasks recorded.';

    return template
        .replace(/{name}/g, data.name)
        .replace(/{date}/g, dateStr)
        .replace(/{day}/g, dayStr)
        .replace(/{tasks}/g, tasksStr);
}

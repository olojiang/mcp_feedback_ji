/** Key=value log lines for grep-friendly observability. */
export function formatLogEvent(
    component: string,
    event: string,
    fields: Record<string, string | number | boolean | undefined>,
): string {
    const parts = [`event=${event}`];
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === '') continue;
        parts.push(`${key}=${value}`);
    }
    return `[${component}] ${parts.join(' ')}`;
}

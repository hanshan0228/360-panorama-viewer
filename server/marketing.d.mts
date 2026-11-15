export const marketingSchema: string;
export function consentStatement(db: any, options: { userId: string; email: string; optedIn: boolean; now: number }): any;
export function handleUnsubscribe(options: { request: Request; db: any; env: any }): Promise<Response>;
export function sendReminderBatch(options: any): Promise<any>;
export function unsubscribeToken(id: string, secret: string): Promise<string>;
export function cheapestGeneration(raw: string | undefined): number | null;

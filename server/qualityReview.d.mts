export const qualityReviewSchema: string[];
export function initQualityReviewSchema(db: D1Database): Promise<void>;
export function qualityReviewReservationStatement(db: D1Database, input: {
  id: string;
  ownerId: string;
  endpointId: string;
  prompt: string;
  cost: number;
  now: number;
}): D1PreparedStatement;
export function saveQualityReviewPayload(storage: KVNamespace, input: {
  id: string;
  imageUrl: string;
  referenceImages?: string[];
}): Promise<{
  candidateMime: string;
  candidateParts: number;
  referenceParts: Array<{ mime: string; parts: number }>;
  keys: string[];
}>;
export function deleteQualityReviewPayload(storage: KVNamespace, keys: string[]): Promise<void>;
export function enqueueQualityReview(db: D1Database, input: {
  id: string;
  candidateMime: string;
  candidateParts: number;
  referenceParts: Array<{ mime: string; parts: number }>;
  now?: number;
}): Promise<boolean>;
export function settleQualityReview(db: D1Database, id: string, outcome: {
  status: 'passed' | 'failed' | 'unavailable';
  issues?: string[];
  explanation?: string;
  reviewModel?: string;
  now?: number;
}): Promise<Record<string, unknown> | null>;
export function getQualityReview(input: {
  db: D1Database;
  request: Request;
  now?: number;
}): Promise<
  | { error: string; status: number }
  | {
    status: number;
    qualityReview: {
      id: string;
      status: 'pending' | 'passed' | 'failed' | 'unavailable';
      issues: string[];
      explanation: string;
      reviewModel: string;
      attempts: number;
      creditsRefunded: number;
    };
  }
>;

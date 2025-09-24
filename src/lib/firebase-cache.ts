// Firebase query caching utility
import {
    collection,
    query,
    where,
    getDocs,
    QuerySnapshot,
    DocumentData,
    Query,
    orderBy,
    limit
} from 'firebase/firestore';
import { db } from './firebase';

interface CacheEntry {
    data: any;
    timestamp: number;
    ttl: number; // Time to live in milliseconds
}

class FirebaseCache {
    private cache = new Map<string, CacheEntry>();
    private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

    private generateKey(query: Query): string {
        // Generate a unique key for the query
        return JSON.stringify({
            path: query._path?.segments?.join('/'),
            filters: query._query?.filters?.map(f => ({
                field: f.field?.segments?.join('.'),
                op: f.op,
                value: f.value
            })),
            orderBy: query._query?.orderBy?.map(o => ({
                field: o.field?.segments?.join('.'),
                dir: o.dir
            })),
            limit: query._query?.limit
        });
    }

    private isExpired(entry: CacheEntry): boolean {
        return Date.now() - entry.timestamp > entry.ttl;
    }

    async getCachedQuery<T = DocumentData>(
        query: Query,
        ttl: number = this.DEFAULT_TTL
    ): Promise<QuerySnapshot<T> | null> {
        const key = this.generateKey(query);
        const entry = this.cache.get(key);

        if (entry && !this.isExpired(entry)) {
            return entry.data as QuerySnapshot<T>;
        }

        return null;
    }

    setCachedQuery(query: Query, data: QuerySnapshot, ttl: number = this.DEFAULT_TTL): void {
        const key = this.generateKey(query);
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }

    invalidatePattern(pattern: string): void {
        for (const [key] of this.cache) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    }

    clear(): void {
        this.cache.clear();
    }

    // Optimized query methods
    async getAssignmentsByTeacher(teacherId: string, useCache: boolean = true) {
        const q = query(
            collection(db, 'assignments'),
            where('teacher_id', '==', teacherId)
        );

        if (useCache) {
            const cached = await this.getCachedQuery(q);
            if (cached) return cached;
        }

        const snapshot = await getDocs(q);
        if (useCache) {
            this.setCachedQuery(q, snapshot);
        }
        return snapshot;
    }

    async getSubmissionsByAssignment(assignmentId: string, useCache: boolean = true) {
        const q = query(
            collection(db, 'submissions'),
            where('assignment_id', '==', assignmentId)
        );

        if (useCache) {
            const cached = await this.getCachedQuery(q);
            if (cached) return cached;
        }

        const snapshot = await getDocs(q);
        if (useCache) {
            this.setCachedQuery(q, snapshot);
        }
        return snapshot;
    }

    async getPendingSubmissions(teacherId: string, useCache: boolean = true) {
        // First get teacher's assignments
        const assignmentsSnapshot = await this.getAssignmentsByTeacher(teacherId, useCache);
        const assignmentIds = assignmentsSnapshot.docs.map(doc => doc.id);

        if (assignmentIds.length === 0) {
            return { docs: [] };
        }

        // Get pending submissions for all assignments
        const submissionPromises = assignmentIds.map(assignmentId =>
            this.getSubmissionsByAssignment(assignmentId, useCache)
        );

        const submissionSnapshots = await Promise.all(submissionPromises);

        // Combine all pending submissions
        const allPendingSubmissions = submissionSnapshots.flatMap(snapshot =>
            snapshot.docs.filter(doc => doc.data().status === 'submitted')
        );

        return { docs: allPendingSubmissions };
    }

    // Invalidate cache when data changes
    invalidateAssignmentCache(teacherId?: string) {
        this.invalidatePattern('assignments');
        if (teacherId) {
            this.invalidatePattern(`teacher_id.*${teacherId}`);
        }
    }

    invalidateSubmissionCache(assignmentId?: string) {
        this.invalidatePattern('submissions');
        if (assignmentId) {
            this.invalidatePattern(`assignment_id.*${assignmentId}`);
        }
    }
}

export const firebaseCache = new FirebaseCache();

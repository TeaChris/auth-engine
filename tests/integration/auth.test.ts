import request from 'supertest';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createServer } from '@/server';
import { prisma } from '@/infrastructure';

// Mock BullMQ to avoid requiring a live Redis instance during integration tests
const mockJobs: any[] = [];
vi.mock('bullmq', () => {
    return {
        Queue: vi.fn().mockImplementation(() => ({
            add: vi.fn().mockImplementation((name, data) => {
                const job = { id: 'mock-job-' + Math.random(), name, data };
                mockJobs.push(job);
                return Promise.resolve(job);
            }),
            getJobs: vi.fn().mockImplementation(() => Promise.resolve(mockJobs)),
            on: vi.fn(),
            close: vi.fn(),
        })),
        Worker: vi.fn().mockImplementation(() => ({
            on: vi.fn(),
            close: vi.fn(),
        })),
    };
});

describe('Auth Module Integration', () => {
    let app: any;

    beforeAll(async () => {
        app = createServer();
        // Clear all users before running auth suite to ensure test isolation
        await prisma.user.deleteMany();
    });

    describe('GET /csrf-token', () => {
        it('should return a valid CSRF token and set the cookie', async () => {
            const response = await request(app).get('/csrf-token');
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('token');
            expect(response.headers['set-cookie']).toBeDefined();
            const cookies = response.headers['set-cookie'];
            if (!Array.isArray(cookies)) throw new Error('No cookies set');
            expect(cookies[0]).toContain('x-csrf-token');
        });
    });

    describe('POST /api/v1/auth/register', () => {
        it('should fail registration without a CSRF token', async () => {
            const response = await request(app)
                .post('/api/v1/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'Password123!',
                });

            expect(response.status).toBe(403); // CSRF failure
        });

        it('should successfully register a new user with valid CSRF', async () => {
            // 1. Get CSRF token and cookie
            const csrfResponse = await request(app).get('/csrf-token');
            const token = csrfResponse.body.token;
            const cookie = csrfResponse.headers['set-cookie'];
            if (!Array.isArray(cookie)) throw new Error('No cookies set');

            // 2. Register with CSRF
            const response = await request(app)
                .post('/api/v1/auth/register')
                .set('Cookie', cookie)
                .set('X-CSRF-Token', token)
                .send({
                    email: 'test@example.com',
                    password: 'Password123!',
                });

            expect(response.status).toBe(201);
            expect(response.body.data).toHaveProperty('email', 'test@example.com');
            
            // 2.1 Verify DB persistence
            const user = await prisma.user.findUnique({ where: { email: 'test@example.com' } });
            expect(user).toBeDefined();

            // 2.2 Verify BullMQ Job Production (Producer Pattern)
            const { container } = await import('@/container');
            const emailQueue = container.resolve('emailQueue');
            const jobs = await emailQueue.getJobs(['waiting', 'active', 'completed']);
            const welcomeJob = jobs.find(j => j.name === 'welcome-email' && j.data.to === 'test@example.com');
            expect(welcomeJob).toBeDefined();
        });

        it('should sanitize input and strip XSS payloads', async () => {
            const csrfResponse = await request(app).get('/csrf-token');
            const token = csrfResponse.body.token;
            const cookie = csrfResponse.headers['set-cookie'];
            if (!Array.isArray(cookie)) throw new Error('No cookies set');

            const payloadWithXSS = {
                email: 'xss@<script>alert(1)</script>example.com',
                password: 'Password123!',
            };

            const response = await request(app)
                .post('/api/v1/auth/register')
                .set('Cookie', cookie)
                .set('X-CSRF-Token', token)
                .send(payloadWithXSS);

            expect(response.status).toBe(201);
            // Verify that the email was sanitized (scripts stripped)
            expect(response.body.data.email).not.toContain('<script>');
            expect(response.body.data.email).toBe('xss@example.com');
        });
    });
});

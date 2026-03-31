import { Job } from 'bullmq';
import { logger, createWorker } from '@/infrastructure';

export interface EmailJobData {
  to: string;
  subject: string;
  body: string;
}

/**
 * Worker responsible for processing email notification jobs from the 'email-queue'.
 * Uses the exponential backoff retry strategy defined in the base BullMQ config.
 */
export class EmailWorker {
  constructor() {
    createWorker('email-queue', this.process.bind(this));
    logger.info('📧 Email worker initialized and listening on "email-queue"');
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const { to, subject } = job.data;
    
    // Simulate high-load task (e.g. batch emailing or image processing)
    // In a real app, integrate with SendGrid, SES, etc.
    logger.info({ jobId: job.id, to, subject }, '📨 Processing email job...');
    
    // Artificial delay to simulate processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (Math.random() > 0.95) {
      // Simulate an intermittent failure to demonstrate the retry strategy
      throw new Error('📧 Internal SMTP error — triggering automatic retry');
    }

    logger.info({ jobId: job.id }, '✅ Email sent successfully');
  }
}

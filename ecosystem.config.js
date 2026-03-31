// ecosystem.config.js — PM2 Cluster & Process Management Configuration
// Usage: pm2 start ecosystem.config.js --env production

const os = require('os');

module.exports = {
  apps: [
    {
      name: 'auth-system',
      script: './dist/index.js',

      // ─── Clustering ─────────────────────────────────────────────────────────
      // 'max' uses all available CPU cores. Set to a number for manual control.
      instances: os.cpus().length,
      exec_mode: 'cluster',

      // ─── Memory Leak Guard ──────────────────────────────────────────────────
      // Restart a worker if it exceeds 512 MB — prevents slow memory leaks from
      // accumulating and degrading performance over time.
      max_memory_restart: '512M',

      // ─── Crash Recovery ─────────────────────────────────────────────────────
      autorestart: true,
      restart_delay: 2000, // ms before restarting a crashed worker
      max_restarts: 10,    // stop autorestart after 10 consecutive crashes

      // ─── Log Management ─────────────────────────────────────────────────────
      output: './logs/pm2-out.log',
      error: './logs/pm2-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // ─── Graceful Reload ────────────────────────────────────────────────────
      // Allows zero-downtime deploys via `pm2 reload auth-system`
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 10000,

      // ─── Environment ────────────────────────────────────────────────────────
      env: {
        NODE_ENV: 'development',
        CLUSTER_ENABLED: 'false', // PM2 handles clustering — disable built-in
      },
      env_production: {
        NODE_ENV: 'production',
        CLUSTER_ENABLED: 'false',
      },

      // ─── Node.js Flags ──────────────────────────────────────────────────────
      // Limit heap size to prevent a single worker from consuming all RAM.
      // Tune this value based on your server's total RAM.
      node_args: '--max-old-space-size=512',
    },
  ],
};

/**
 * PM2 Ecosystem Configuration — SupportHub
 * ─────────────────────────────────────────
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production --update-env
 *   pm2 logs supporthub
 *   pm2 monit
 */

module.exports = {
    apps: [
        {
            // ── Identity ───────────────────────────────────────────────────
            name        : 'supporthub',
            script      : 'app.js',

            // ── Cluster mode — uses all available CPU cores ────────────────
            instances   : 'max',
            exec_mode   : 'cluster',

            // ── Restart policy ─────────────────────────────────────────────
            watch               : false,       // do NOT watch files in prod
            ignore_watch        : ['node_modules', 'logs', 'public/versionHistory.json'],
            max_memory_restart  : '512M',      // restart if process exceeds 512 MB RAM
            restart_delay       : 2000,        // 2s between restarts
            max_restarts        : 10,          // give up after 10 consecutive crashes
            min_uptime          : '5s',        // must stay up 5s to count as successful

            // ── Graceful shutdown ──────────────────────────────────────────
            kill_timeout        : 5000,        // 5s for in-flight requests to finish
            listen_timeout      : 10000,       // 10s to bind port before PM2 gives up
            wait_ready          : false,       // set to true if app emits 'ready' signal

            // ── Logs ───────────────────────────────────────────────────────
            error_file          : 'logs/pm2-error.log',
            out_file            : 'logs/pm2-out.log',
            log_date_format     : 'YYYY-MM-DD HH:mm:ss',
            merge_logs          : true,        // merge cluster instances into one log
            time                : true,        // prefix every log line with timestamp

            // ── Environment: Development ───────────────────────────────────
            env: {
                NODE_ENV : 'development',
                PORT     : 3000
            },

            // ── Environment: Production ────────────────────────────────────
            // All secrets come from the .env file written by the CI/CD pipeline.
            // This block only overrides what differs from the defaults above.
            env_production: {
                NODE_ENV : 'production',
                PORT     : process.env.PORT || 3000
            },

            // ── Environment: Staging ───────────────────────────────────────
            env_staging: {
                NODE_ENV : 'staging',
                PORT     : process.env.PORT || 3001
            }
        }
    ]
};

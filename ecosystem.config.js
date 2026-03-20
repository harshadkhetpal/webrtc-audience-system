module.exports = {
  apps: [
    {
      name: 'audienceq-backend',
      script: './backend/server.js',
      interpreter: '/opt/homebrew/bin/node',
      cwd: '/Users/khetpal_jyo/webrtc-audience-system',
      watch: false,
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 20,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      log_file: '/tmp/audienceq-backend.log',
      error_file: '/tmp/audienceq-backend-err.log',
      out_file: '/tmp/audienceq-backend-out.log',
    },
  ],
};

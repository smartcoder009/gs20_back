module.exports = {
  apps : [{
    name: 'server',
    script: 'app.js',
    instances: 1,
    autorestart: true,
    watch: true,
    log_file: "logs/combined.outerr.log",
    ignore_watch : ["logs/*", "public/chartdata/*"],
    //max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 13784
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 13784
    }
  }],
};

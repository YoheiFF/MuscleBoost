module.exports = {
  apps: [
    {
      name: "muscleboost",
      script: "node_modules/.bin/next",
      args: "start -p 3002",
      env_production: {
        NODE_ENV: "production",
      },
      // DB接続情報（TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, AUTH_SECRET）は
      // ~/MuscleBoost/.env から Next.js が自動読み込みする。ここには機密情報を書かない。
      error_file: "~/.pm2/logs/muscleboost-error.log",
      out_file: "~/.pm2/logs/muscleboost-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      restart_delay: 1000,
      max_restarts: 10,
    },
  ],
};

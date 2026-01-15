module.exports = {
    apps: [{
        name: "college-office-backend",
        script: "./server.js",
        instances: "max",
        exec_mode: "cluster",
        watch: false,
        env: {
            NODE_ENV: "development",
        },
        env_production: {
            NODE_ENV: "production",
        }
    }]
}

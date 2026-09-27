import "dotenv/config";

// Integration tests run against TEST_DATABASE_URL, never the dev database.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.APP_TZ ??= "Europe/Bucharest";

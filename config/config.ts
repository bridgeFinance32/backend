import { config } from "dotenv"

config()

interface Config {
    NODE_ENV: string,
    DB_URI: string,
    NODE_PORT: string,
    ACCESS_TOKEN_SECRET: string,
    REFRESH_TOKEN_SECRET: string,
}

const Config: Config = {
    NODE_ENV: process.env.NODE_ENV || "PRODUCTION",
    DB_URI: process.env.DB_URI!,
    NODE_PORT: process.env.NODE_PORT || "5050",
    ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET!,
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET!
}

export default Config
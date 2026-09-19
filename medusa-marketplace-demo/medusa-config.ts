import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const s3Configured = Boolean(
  process.env.S3_BUCKET &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY &&
  process.env.S3_ENDPOINT &&
  process.env.S3_FILE_URL
)

const modules = [
  {
    resolve: "@medusajs/medusa/notification",
    options: {
      providers: [
        {
          resolve: "./src/modules/resend",
          id: "resend",
          options: {
            channels: ["email"],
            api_key: process.env.RESEND_API_KEY,
            from: process.env.RESEND_FROM_EMAIL,
          },
        },
      ],
    },
  },
  ...(s3Configured
    ? [
        {
          resolve: "@medusajs/medusa/file",
          options: {
            providers: [
              {
                resolve: "@medusajs/medusa/file-s3",
                id: "s3",
                options: {
                  file_url: process.env.S3_FILE_URL,
                  access_key_id: process.env.S3_ACCESS_KEY_ID,
                  secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
                  region: process.env.S3_REGION || "auto",
                  bucket: process.env.S3_BUCKET,
                  endpoint: process.env.S3_ENDPOINT,
                  cache_control: "public, max-age=31536000",
                  additional_client_config: {
                    forcePathStyle: true,
                  },
                },
              },
            ],
          },
        },
      ]
    : []),
]

module.exports = defineConfig({
  admin: {
    vite: () => {
      return {
        optimizeDeps: {
          include: ["qs"],
        },
      };
    },
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  plugins: [
    {
      resolve: "@techlabi/medusa-marketplace-plugin",
      options: {},
    },
  ],
  modules,
})
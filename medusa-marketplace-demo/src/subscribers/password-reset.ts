import {
  SubscriberArgs,
  type SubscriberConfig,
} from "@medusajs/medusa"
import { Modules } from "@medusajs/framework/utils"

export default async function resetPasswordTokenHandler({
  event: { data },
  container,
}: SubscriberArgs<{
  entity_id: string
  token: string
  actor_type: string
}>) {
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const config = container.resolve("configModule")

  const { entity_id: email, token, actor_type } = data

  const storefrontUrl =
    process.env.MEDUSA_STOREFRONT_URL ?? "http://localhost:8000"

  let urlPrefix = storefrontUrl

  if (actor_type !== "customer") {
    const backendUrl =
      config.admin.backendUrl !== "/"
        ? config.admin.backendUrl
        : "http://localhost:9000"
    const adminPath = config.admin.path ?? "/app"
    urlPrefix = `${backendUrl}${adminPath}`
  }

  await notificationModuleService.createNotifications({
    to: email,
    channel: "email",
    template: "password-reset",
    data: {
      reset_url: `${urlPrefix}/reset-password?token=${token}&email=${encodeURIComponent(
        email
      )}`,
    },
  })
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
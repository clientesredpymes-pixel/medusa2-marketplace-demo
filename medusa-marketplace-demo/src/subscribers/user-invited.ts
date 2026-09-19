import {
  SubscriberArgs,
  type SubscriberConfig,
} from "@medusajs/medusa"
import { Modules } from "@medusajs/framework/utils"

export default async function inviteCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{
  id: string
}>) {
  const query = container.resolve("query")
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const config = container.resolve("configModule")

  const { data: [invite] } = await query.graph({
    entity: "invite",
    fields: ["email", "token"],
    filters: {
      id: data.id,
    },
  })

  const backendUrl =
    config.admin.backendUrl !== "/"
      ? config.admin.backendUrl
      : "http://localhost:9000"
  const adminPath = config.admin.path ?? "/app"

  await notificationModuleService.createNotifications({
    to: invite.email,
    channel: "email",
    template: "user-invited",
    data: {
      invite_url: `${backendUrl}${adminPath}/invite?token=${invite.token}`,
    },
  })
}

export const config: SubscriberConfig = {
  event: ["invite.created", "invite.resent"],
}
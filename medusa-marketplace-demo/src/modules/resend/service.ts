import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import { Logger, NotificationTypes } from "@medusajs/framework/types"
import { CreateEmailOptions, Resend } from "resend"

export type ResendOptions = {
  api_key: string
  from: string
}

export type ProviderOptions = { [key: string]: unknown } & ResendOptions

type InjectedDependencies = {
  logger: Logger
}

type TemplateData = Record<string, unknown>

const DEFAULT_SUBJECT = "Notificación de GoMart Marketplace"

const subjects: Record<string, string> = {
  "password-reset": "Restablece tu contraseña",
  "user-invited": "Te han invitado a GoMart Marketplace",
}

const escapeHtml = (value: unknown): string => {
  if (typeof value === "string") {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
  }

  if (value === null || value === undefined) {
    return ""
  }

  return escapeHtml(JSON.stringify(value))
}

const wrapLayout = (title: string, body: string): string => `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f6f6;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#1f2937;margin:0 0 16px;">GoMart Marketplace</h2>
      ${body}
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">
        Enviado desde GoMart Marketplace.
      </p>
    </div>
  </body>
</html>`

const renderPasswordReset = (data: TemplateData): string => {
  const resetUrl =
    (typeof data.reset_url === "string" && data.reset_url) ||
    (typeof data.generatedUrl === "string" && data.generatedUrl) ||
    "#"

  return wrapLayout(
    "Restablece tu contraseña",
    `<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en GoMart Marketplace.</p>
     <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background-color:#f59e0b;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;">Restablecer mi contraseña</a></p>
     <p>Si no solicitaste este cambio, puedes ignorar este correo. El enlace expira en 15 minutos.</p>`
  )
}

const renderGenericTemplate = (data: TemplateData): string => {
  const rows = Object.entries(data)
    .map(([key, value]) => {
      const safeValue = escapeHtml(value)

      return safeValue
        ? `<li><strong>${escapeHtml(key)}</strong>: ${safeValue}</li>`
        : ""
    })
    .join("")

  return wrapLayout(
    DEFAULT_SUBJECT,
    `<p>Recibiste una nueva notificación de GoMart Marketplace:</p>
     ${rows ? `<ul>${rows}</ul>` : "<p>Sin información adicional.</p>"}`
  )
}

const renderUserInvited = (data: TemplateData): string => {
  const inviteUrl =
    (typeof data.invite_url === "string" && data.invite_url) || "#"

  return wrapLayout(
    "Te han invitado a GoMart Marketplace",
    `<p>Te invitamos a unirte a GoMart Marketplace. Acepta la invitación con el siguiente enlace para crear tu usuario:</p>
     <p><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background-color:#f59e0b;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;">Aceptar invitación</a></p>
     <p>Si no esperabas esta invitación, puedes ignorar este correo.</p>`
  )
}

const templates: Record<string, (data: TemplateData) => string> = {
  "password-reset": renderPasswordReset,
  "user-invited": renderUserInvited,
}

export default class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-resend"

  protected resendClient_: Resend
  protected logger_: Logger
  protected options_: ProviderOptions

  constructor(
    { logger }: InjectedDependencies,
    options: ProviderOptions
  ) {
    super()

    this.resendClient_ = new Resend(options.api_key)
    this.logger_ = logger
    this.options_ = options
  }

  static validateOptions(options: ProviderOptions) {
    if (typeof options.api_key !== "string" || !options.api_key.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Resend API key is required to use the Resend notification provider"
      )
    }

    if (typeof options.from !== "string" || !options.from.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A 'from' sender email is required to use the Resend notification provider"
      )
    }
  }

  async send(notification: NotificationTypes.ProviderSendNotificationDTO) {
    const template = this.getTemplate(notification)
    const subject = this.getTemplateSubject(notification)

    if (!template?.content) {
      this.logger_.error(
        `No template found for notification ${notification.template}`
      )
      return {}
    }

    const emailOptions: CreateEmailOptions = {
      from: this.options_.from,
      to: notification.to,
      subject,
      html: template.content,
    }

    try {
      const result = await this.resendClient_.emails.send(emailOptions)
      this.logger_.info(
        `Resend email sent ${result.data?.id ?? ""}`.trim()
      )
    } catch (error) {
      this.logger_.error(
        `Failed to send notification with Resend: ${error}`
      )
    }

    return {}
  }

  private getTemplateSubject(
    notification: NotificationTypes.ProviderSendNotificationDTO
  ) {
    return subjects[notification.template] ?? DEFAULT_SUBJECT
  }

  private getTemplate(
    notification: NotificationTypes.ProviderSendNotificationDTO
  ) {
    const renderer = templates[notification.template]
    const data = (notification.data ?? {}) as TemplateData

    if (renderer) {
      return { content: renderer(data) }
    }

    return { content: renderGenericTemplate(data) }
  }
}
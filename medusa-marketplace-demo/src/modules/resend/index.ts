import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import ResendNotificationProviderService from "./service"

const services = [ResendNotificationProviderService]

export default ModuleProvider(Modules.NOTIFICATION, {
  services,
})
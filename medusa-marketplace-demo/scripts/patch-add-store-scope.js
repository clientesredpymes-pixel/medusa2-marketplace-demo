"use strict";
/**
 * Parchea `add-store-scope.js` de @techlabi/medusa-marketplace-plugin para
 * habilitar un override explicito de store cuando la peticion esta autenticada
 * con una Secret API Key, sin depender de `loggedInUser` ni de cookie de sesion.
 *
 * POR QUE:
 * El middleware original hace:
 *
 *   const loggedInUser = req.scope.resolve("loggedInUser", { allowUnregistered: true });
 *   if (!loggedInUser) return next();          // <-- sale sin registrar currentStore
 *   ... busca en user_store por loggedInUser.id ...
 *
 * Con `Authorization: Basic <sk_...>`, @medusajs/framework arma:
 *
 *   req.auth_context = { actor_id: <api_key.id>, actor_type: "api-key",
 *                        auth_identity_id: "", app_metadata: {} }
 *
 * osea que nunca hay un `loggedInUser` real, y el hook `product-created`
 * (`workflows/hooks/product-created.js`) revienta con
 * `Could not resolve 'currentStore'`. Lo mismo pasaba con `/auth/session`,
 * que ademas no resuelve en este deploy.
 *
 * QUE HACE:
 * Si se manda el header `x-medusa-store-id`, y la peticion viene autenticada
 * con una Secret API Key cuyo `actor_id` esta en la allowlist
 * `STORE_SCOPE_HEADER_KEY_IDS`, y `ENABLE_STORE_SCOPE_HEADER=true`, registra
 * `currentStore` con ese store (validando que el store exista) y cortocircuita
 * el flujo original.
 *
 * GUARDAS DE SEGURIDAD (todas necesarias):
 *   1. `actor_type === "api-key"`. Medusa solo acepta secret API keys en rutas
 *      admin (`authenticate-middleware.js`: "We only allow authenticating using
 *      a secret API key on the admin"), asi que un vendor con sesion o JWT
 *      (`actor_type === "user"`) nunca puede disparar el override.
 *   2. Allowlist por id de key. Cierra el riesgo de que cualquier secret key
 *      apunte a cualquier store.
 *   3. Flag de entorno, default OFF. Si algo falla en prod, se apaga sin deploy.
 *   4. El store tiene que existir. Si el id no existe, se sigue el flujo normal.
 *
 * OJO: `STORE_SCOPE_HEADER_KEY_IDS` lleva el id `apk_...` de la tabla api_key,
 * NO el token `sk_...`. El token se guarda hasheado con salt, asi que no se
 * puede derivar el id a partir del token.
 *
 * El parche es idempotente: si ya esta aplicado (marcador presente), no toca
 * el archivo. Si no encuentra el patron exacto, aborta sin modificar nada.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");

const PATCHED_MARKER = "add-store-scope:api-key-header-override";
const ANCHOR = `const loggedInUser = req.scope.resolve("loggedInUser", {
        allowUnregistered: true,
    });`;

function buildReplacement() {
    const block = [
        `/******** BEGIN [${PATCHED_MARKER}] ********/`,
        `    // Override de store para peticiones autenticadas con Secret API Key.`,
        `    // Ver scripts/patch-add-store-scope.js para el detalle completo.`,
        `    if (process.env.ENABLE_STORE_SCOPE_HEADER === "true") {`,
        `        const requestedStoreId = req.headers["x-medusa-store-id"];`,
        `        const allowedKeyIds = (process.env.STORE_SCOPE_HEADER_KEY_IDS || "")`,
        `            .split(",")`,
        `            .map((value) => value.trim())`,
        `            .filter(Boolean);`,
        `        const actorId = req.auth_context?.actor_id;`,
        `        if (requestedStoreId &&`,
        `            req.auth_context?.actor_type === "api-key" &&`,
        `            allowedKeyIds.length > 0 &&`,
        `            allowedKeyIds.includes(actorId)) {`,
        `            try {`,
        `                const overrideQuery = req.scope.resolve(utils_1.ContainerRegistrationKeys.QUERY);`,
        `                const { data: overrideStores } = await overrideQuery.graph({`,
        `                    entity: "store",`,
        `                    fields: ["id"],`,
        `                    filters: { id: requestedStoreId },`,
        `                });`,
        `                if (overrideStores?.length > 0) {`,
        `                    req.scope.register({`,
        `                        currentStore: (0, awilix_1.asValue)({ id: requestedStoreId }),`,
        `                    });`,
        `                    return next();`,
        `                }`,
        `            }`,
        `            catch (err) {`,
        `                console.error("[add-store-scope] fallo el override por x-medusa-store-id:", err);`,
        `            }`,
        `        }`,
        `    }`,
        `/******** END [${PATCHED_MARKER}] ********/`,
        `    ${ANCHOR}`,
    ].join("\n");
    return block;
}

function walkSync(dir, filename) {
    const matches = [];
    const walk = (current) => {
        let entries;
        try {
            entries = fs_1.readdirSync(current, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const full = path_1.join(current, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            }
            else if (entry.isFile() && entry.name === filename) {
                matches.push(full);
            }
        }
    };
    walk(dir);
    return matches.find((m) => {
        try {
            return fs_1.readFileSync(m, "utf8").includes('resolve("loggedInUser"');
        }
        catch {
            return false;
        }
    }) || matches[0] || null;
}

function findTarget(root) {
    const names = [
        "node_modules",
        "node_modules/@techlabi",
        "node_modules/@techlabi/medusa-marketplace-plugin",
        "node_modules/@techlabi/medusa-marketplace-plugin/.medusa",
        "node_modules/@techlabi/medusa-marketplace-plugin/.medusa/server",
    ];
    const direct = path_1.join(root, ...names, "src", "api", "middlewares", "add-store-scope.js");
    if (fs_1.existsSync(direct)) {
        return direct;
    }
    for (const fb of [".medusa", "node_modules"]) {
        const base = path_1.join(root, fb);
        if (!fs_1.existsSync(base)) {
            continue;
        }
        const found = walkSync(base, "add-store-scope.js");
        if (found) {
            return found;
        }
    }
    return null;
}

const root = process.cwd();
const target = findTarget(root);
if (!target) {
    console.log("[patch-add-store-scope] add-store-scope.js no encontrado en node_modules del plugin; se omite (prob. no instalado aun en este paso).");
    process.exit(0);
}

let source = fs_1.readFileSync(target, "utf8");
const originalSource = source;
if (source.includes(PATCHED_MARKER)) {
    console.log("[patch-add-store-scope] add-store-scope.js ya parcheado, se omite.");
    process.exit(0);
}
if (!source.includes(ANCHOR)) {
    console.error(
        "[patch-add-store-scope] no se encontro el patron exacto en " + target + "; ¿version de plugin distinta? Se aborta sin modificar."
    );
    process.exit(1);
}

source = source.split(ANCHOR).join(buildReplacement());
fs_1.writeFileSync(target, source, "utf8");

// Verificacion de sintaxis con revert. Este middleware se carga en cada request
// de administracion: si el parche genera JS invalido, el backend no arranca.
// Fallar acá es mucho mejor que deployar un archivo corrupto.
const { execFileSync } = require("child_process");
try {
    execFileSync(process.execPath, ["--check", target], { stdio: "pipe" });
}
catch (err) {
    console.error(
        "[patch-add-store-scope] el parche produjo JavaScript inválido en " + target +
        "; se revierte el archivo.\n" +
        (err.stderr ? err.stderr.toString() : String(err))
    );
    fs_1.writeFileSync(target, originalSource, "utf8");
    process.exit(1);
}
console.log("[patch-add-store-scope] add-store-scope.js parcheado OK con override de store por x-medusa-store-id para Secret API Keys en allowlist.");

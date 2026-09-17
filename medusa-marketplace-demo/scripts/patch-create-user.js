"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const REGISTER_NEEDLE = "registerResponse.authIdentity.id";
const PATCHED_MARKER = "create-user:techlabi-patch:register-success-guard";
/**
 * El step `createUserStep` del plugin (@techlabi/medusa-marketplace-plugin 0.35.0)
 * hace:
 *
 *   const registerResponse = await authService.register("emailpass", {
 *       body: { email, password },
 *   });
 *   await authService.updateAuthIdentities({
 *       id: registerResponse.authIdentity.id,   // <-- create-user.js:32 (línea del crash)
 *       app_metadata: { user_id: user.id },
 *   });
 *
 * Sin comprobar `registerResponse.success`. Cuando el provider emailpass devuelve
 * `success: false` (por ejemplo: email con auth identity ya registrada en un intento
 * previo fallido, o bien el merchant ya existía en el AC medusa), `authIdentity` es
 * `undefined` → TypeError "Cannot read properties of undefined (reading 'id')" y el
 * aprovisionamiento de la tienda se cae en create-store-workflow.
 *
 * Este patch añade un guard idempotente que:
 *   1. comprueba `registerResponse.success` y la existencia de `authIdentity.id`;
 *   2. si `success === false`, intenta recuperar la auth identity ya existente para
 *      ese email (entity_id) vía `retrieveAuthIdentities` y la reutiliza; así el
 *      workflow continúa re-aprovisionando en lugar de morir.
 *   3. si no hay ninguna identity recuperable, lanza un error de workflow claro (con
 *      el detalle del provider) en lugar del TypeError opaco.
 *
 * El patch es idempotente: si ya está aplicado (marcador presente), no toca el archivo.
 */
function findCreateUserFile(root) {
    const names = [
        "node_modules",
        "node_modules/@techlabi",
        "node_modules/@techlabi/medusa-marketplace-plugin",
        "node_modules/@techlabi/medusa-marketplace-plugin/.medusa",
        "node_modules/@techlabi/medusa-marketplace-plugin/.medusa/server",
    ];
    const createUserPaths = [
        path_1.join(root, ...names, "src", "workflows", "create-store", "steps", "create-user.js"),
        path_1.join(root, ...names, "src", "workflows", "create-store", "steps", "create-user.js.map"),
    ];
    for (const p of createUserPaths) {
        if (fs_1.existsSync(p)) {
            return p;
        }
    }
    const fallbacks = [
        ".medusa",
        "node_modules",
    ];
    for (const fb of fallbacks) {
        const base = path_1.join(root, fb);
        if (!fs_1.existsSync(base)) {
            continue;
        }
        const found = walkSync(base, "create-user.js");
        if (found) {
            return found;
        }
    }
    return null;
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
            return fs_1.readFileSync(m, "utf8").includes(REGISTER_NEEDLE);
        }
        catch {
            return false;
        }
    }) || matches[0] || null;
}
function buildReplacement() {
    const originalIdExpr = `id: registerResponse.authIdentity.id,`;
    const guardBackfill = [
        `/******** BEGIN [${PATCHED_MARKER}] ********/`,
        `    let authIdentityId = registerResponse?.authIdentity?.id;`,
        `    if (registerResponse?.success === false || !authIdentityId) {`,
        `        let existing = [];`,
        `        try {`,
        `            existing = await authService.retrieveAuthIdentities({`,
        `                entity_id: input.email,`,
        `            });`,
        `        } catch {`,
        `            existing = [];`,
        `        }`,
        `        const reuse = (existing || []).find((identity) =>`,
        `            identity?.entity_id === input.email`,
        `        );`,
        `        if (reuse?.id) {`,
        `            authIdentityId = reuse.id;`,
        `        } else {`,
        `            const detail = registerResponse?.error || "sin detalle";`,
        `            throw new Error(`,
        `                \`create-user-step: register(emailpass) falló para \${input.email} ` +
            `(success=false) y no hay una auth identity previa para recuperar. Detalle: \${detail}\``,
        `            );`,
        `        }`,
        `    }`,
        `/******** END [${PATCHED_MARKER}] ********/`,
        `id: authIdentityId,`,
    ].join("\n");
    return { originalIdExpr, guardBackfill };
}
const root = process.cwd();
const target = findCreateUserFile(root);
if (!target) {
    console.log("[patch-create-user] create-user.js no encontrado en node_modules del plugin; se omite (prob. no instalado aun en este paso).");
    process.exit(0);
}
let source = fs_1.readFileSync(target, "utf8");
if (source.includes(PATCHED_MARKER)) {
    console.log("[patch-create-user] create-user.js ya parcheado, se omite.");
    process.exit(0);
}
const { originalIdExpr, guardBackfill } = buildReplacement();
if (!source.includes(originalIdExpr)) {
    console.error(
        "[patch-create-user] no se encontró el patrón vulnerable exacto en " + target + "; ¿versión de plugin distinta? Se aborta sin modificar."
    );
    process.exit(1);
}
source = source.split(originalIdExpr).join(guardBackfill);
fs_1.writeFileSync(target, source, "utf8");
console.log("[patch-create-user] create-user.js parcheado OK con guard registerResponse.success (fallback a identity existente).");

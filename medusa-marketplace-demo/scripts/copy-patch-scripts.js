"use strict";
/**
 * Copia los scripts de parcheo a `.medusa/server/scripts/`.
 *
 * POR QUE:
 * El servidor de Medusa corre desde `.medusa/server`, no desde la raiz del
 * proyecto. En Render el build hace un `postinstall` en la raiz (donde el
 * script existe) y despues otro dentro de `.medusa/server` (donde no existe).
 *
 * `medusa build` arma `.medusa/server` copiando SOLO package.json y los
 * lockfiles (ver @medusajs/framework build-tools, Compiler._Compiler_copyPkgManagerFiles).
 * El tsconfig no tiene `allowJs`, asi que tsc tampoco emite los .js. En
 * consecuencia, `scripts/` nunca llega a `.medusa/server`, pero el postinstall
 * copiado sigue referenciando `scripts/patch-*.js` con rutas relativas.
 *
 * Resultado en Render:
 *   [patch-add-store-scope] Cannot find module
 *     .../.medusa/server/scripts/patch-add-store-scope.js
 * y como el postinstall lo envuelve en `|| true`, el build Terminaba en verde
 * con el plugin SIN parchear. El servidor entonces resolvia la copia sin
 * parche de `@techlabi/medusa-marketplace-plugin` y el hook product-created
 * volaba con `Could not resolve 'currentStore'`.
 *
 * Este script corre al final de `yarn build`, despues de que `.medusa/server`
 * exista, y deja los parches disponibles para el postinstall de esa carpeta.
 *
 * El postinstall de patch-create-user.js arrastra el mismo problema, asi que
 * tambien se copia: sin esto, el fix de create-user.js nunca llegaba a la copia
 * del plugin que realmente carga el servidor.
 *
 * Sale con codigo 1 si `.medusa/server` no existe o falta algun script, porque
 * eso significa que el orden build/postbuild quedo roto y el deploy dejaria de
 * lado el parcheado en silencio.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");

const SCRIPTS = ["patch-create-user.js", "patch-add-store-scope.js"];
const MARKER = "[copy-patch-scripts]";

const root = process.cwd();
const srcDir = path_1.join(root, "scripts");
const serverDir = path_1.join(root, ".medusa", "server");
const destDir = path_1.join(serverDir, "scripts");

if (!fs_1.existsSync(srcDir)) {
    console.error(`${MARKER} no existe ${srcDir}; se omite.`);
    process.exit(0);
}
if (!fs_1.existsSync(serverDir)) {
    console.error(`${MARKER} no existe .medusa/server tras el build. ` +
        `Este script debe correr despues de 'medusa build' (esta encadenado en el script "build"). Se aborta.`);
    process.exit(1);
}

const missing = SCRIPTS.filter((name) => !fs_1.existsSync(path_1.join(srcDir, name)));
if (missing.length > 0) {
    console.error(`${MARKER} faltan scripts en scripts/: ${missing.join(", ")}. Se aborta.`);
    process.exit(1);
}

fs_1.mkdirSync(destDir, { recursive: true });
for (const name of SCRIPTS) {
    fs_1.copyFileSync(path_1.join(srcDir, name), path_1.join(destDir, name));
    console.log(`${MARKER} copiado scripts/${name} -> .medusa/server/scripts/${name}`);
}
console.log(`${MARKER} listo. El postinstall de .medusa/server ya va a encontrar los parches.`);

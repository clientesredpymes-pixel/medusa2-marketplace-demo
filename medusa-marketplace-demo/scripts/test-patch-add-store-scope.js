"use strict";
// Verifica las guardas del override en add-store-scope.js sin levantar Medusa.
//
// Se stubean @medusajs/framework/utils, awilix y cookie: el objetivo es probar
// la logica de las guardas del parche, no la integracion con el framework. El
// node_modules local esta incompleto (falta is-unc-path) y no permite cargar el
// barrel real de @medusajs/framework/utils.
const path = require("path");
const Module = require("module");

const STUBS = {
  "@medusajs/framework/utils": {
    ContainerRegistrationKeys: { QUERY: "query" },
  },
  awilix: { asValue: (v) => v },
  cookie: {
    parse: (raw) =>
      Object.fromEntries(
        String(raw || "")
          .split(";")
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => {
            const i = p.indexOf("=");
            return i === -1 ? [p, ""] : [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
          })
      ),
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(STUBS, request)) {
    return STUBS[request];
  }
  return originalLoad.call(this, request, parent, isMain);
};

const pluginRoot = path.join(process.cwd(), "node_modules/@techlabi/medusa-marketplace-plugin");
const target = path.join(pluginRoot, ".medusa/server/src/api/middlewares/add-store-scope.js");
const { addStoreScope } = require(target);

const KEY_OK = "apk_permitida";
const KEY_OTRA = "apk_otra_key";
const STORE_WCF = "store_01M2PJQ7VNKW0Q8934RS9CV36N";

function makeReq({ actorType, actorId, header, flag, allowlist }) {
  const registered = {};
  return {
    headers: {
      cookie: "",
      ...(header ? { "x-medusa-store-id": header } : {}),
    },
    auth_context:
      actorType === undefined ? undefined : { actor_type: actorType, actor_id: actorId, app_metadata: {} },
    scope: {
      resolve: (key) => {
        if (key === "loggedInUser") return undefined;
        if (key === "query") {
          return {
            graph: async () => ({ data: [{ id: STORE_WCF }] }),
          };
        }
        return undefined;
      },
      register: (v) => Object.assign(registered, v),
    },
    _registered: registered,
  };
}

async function run(name, env, reqOpts) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const req = makeReq(reqOpts);
  let nexted = false;
  await addStoreScope(req, {}, () => {
    nexted = true;
  });
  const got = req._registered.currentStore?.id ?? null;
  console.log(
    `${name}\n    -> currentStore=${got ?? "(null)"} | next()=${nexted} | ${got === STORE_WCF ? "OK" : "RECHAZADO"}`
  );
  return got;
}

(async () => {
  const base = {
    ENABLE_STORE_SCOPE_HEADER: "true",
    STORE_SCOPE_HEADER_KEY_IDS: KEY_OK,
  };

  const ok = await run("1) key en allowlist + flag on + header presente", base, {
    actorType: "api-key",
    actorId: KEY_OK,
    header: STORE_WCF,
  });

  const noFlag = await run("2) mismo, pero flag OFF", { ...base, ENABLE_STORE_SCOPE_HEADER: "false" }, {
    actorType: "api-key",
    actorId: KEY_OK,
    header: STORE_WCF,
  });

  const otherKey = await run("3) key de API valida pero NO en allowlist", base, {
    actorType: "api-key",
    actorId: KEY_OTRA,
    header: STORE_WCF,
  });

  const vendor = await run("4) vendor con sesion/JWT (actor_type=user)", base, {
    actorType: "user",
    actorId: "user_abc",
    header: STORE_WCF,
  });

  const noHeader = await run("5) key en allowlist pero SIN header", base, {
    actorType: "api-key",
    actorId: KEY_OK,
  });

  const emptyAllow = await run("6) allowlist vacia", { ...base, STORE_SCOPE_HEADER_KEY_IDS: "" }, {
    actorType: "api-key",
    actorId: KEY_OK,
    header: STORE_WCF,
  });

  const noAuth = await run("7) sin auth_context (peticion anonima)", base, {
    actorType: undefined,
    header: STORE_WCF,
  });

  const resultados = [
    ["1 key permitida aplica override", ok === STORE_WCF],
    ["2 flag OFF no aplica", noFlag === null],
    ["3 key fuera de allowlist no aplica", otherKey === null],
    ["4 vendor (actor_type=user) no aplica", vendor === null],
    ["5 sin header no aplica", noHeader === null],
    ["6 allowlist vacia no aplica", emptyAllow === null],
    ["7 anonimo no aplica", noAuth === null],
  ];

  console.log("\n===== RESULTADO =====");
  let fallos = 0;
  for (const [label, pass] of resultados) {
    if (!pass) fallos++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${label}`);
  }
  console.log(fallos === 0 ? "\nTODAS LAS GUARDAS OK" : `\n${fallos} FALLO(S)`);
  process.exit(fallos === 0 ? 0 : 1);
})();

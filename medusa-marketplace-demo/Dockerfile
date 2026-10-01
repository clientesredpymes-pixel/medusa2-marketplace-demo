# Node 22.15.0+ es obligatorio: dependencias transitivas (p.ej.
# @whatwg-node/promise-helpers) declaran engines.node ">=22.15.0" y yarn aborta
# el install con "Found incompatible module" en versiones menores.
#
# Se fija la version exacta y no "node:22-alpine" porque esa etiqueta es
# flotante: hoy puede resolver por debajo del minimo requerido y el build
# falla sin que cambie una sola linea del repo.
FROM node:22.15.0-alpine

WORKDIR /application

COPY . .

RUN yarn install --frozen-lockfile

EXPOSE 9000

CMD ["yarn", "dev"]
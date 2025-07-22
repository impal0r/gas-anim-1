FROM node:20 AS base

FROM base AS deps

RUN corepack enable
WORKDIR /package
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch --frozen-lockfile
COPY package.json ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod

FROM base AS build

RUN corepack enable
WORKDIR /package
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch --frozen-lockfile
COPY package.json ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base

USER node
WORKDIR /package
COPY --from=deps /package/node_modules /package/node_modules
COPY --from=build /package/dist /package/dist
ENV NODE_ENV=production
CMD ["npx", "serve", "-s", "dist"]
EXPOSE 3000

# TODO: test and debug Dockerfile
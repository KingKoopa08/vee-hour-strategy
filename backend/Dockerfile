FROM node:18-alpine AS base

WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

FROM base AS dev-deps
COPY package*.json ./
RUN npm ci

FROM base AS build
COPY --from=dev-deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./

EXPOSE 3001 3002

CMD ["npm", "start"]
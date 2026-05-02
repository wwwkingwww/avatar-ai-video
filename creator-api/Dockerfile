FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY creator-frontend/package.json creator-frontend/package-lock.json ./
RUN npm ci
COPY creator-frontend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY creator-api/package.json creator-api/package-lock.json ./
RUN npm ci --production
COPY creator-api/ ./
RUN npx prisma generate
COPY skills/ /skills/
COPY shared/ /shared/
COPY --from=frontend-builder /frontend/dist /creator-frontend/dist
EXPOSE 3099
CMD ["node", "server.js"]

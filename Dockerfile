FROM node:24-alpine AS frontend-b
WORKDIR /app/frontend-b
COPY frontend-b/package.json frontend-b/package-lock.json ./
RUN npm ci
COPY frontend-b ./
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY --from=frontend-b /app/public/b ./public/b
USER node
EXPOSE 3000
CMD ["npm", "start"]

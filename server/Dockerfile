# Ballast API — container build for Koyeb (or any Docker host).
# Build context is this server/ directory.
FROM node:22-alpine
WORKDIR /app

# Install prod deps against the committed lockfile (reproducible).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
# Koyeb injects $PORT at runtime; the app reads process.env.PORT (default 8080).
EXPOSE 8080
CMD ["npm", "start"]

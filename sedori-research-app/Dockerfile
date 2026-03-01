FROM node:20-slim

WORKDIR /app

# Dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Source
COPY . .

# Build
RUN npm run build

# Runtime
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]

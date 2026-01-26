FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache openssl
RUN npm install --legacy-peer-deps

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

COPY . .
EXPOSE 5000
CMD ["npm", "start"]

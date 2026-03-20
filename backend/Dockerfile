FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p data/sessions
EXPOSE 3001
CMD ["node", "server.js"]

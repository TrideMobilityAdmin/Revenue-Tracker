FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN if [ -f .env ]; then echo 'Using existing .env file'; else cp .env.example .env; fi

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["sh", "-c", "echo 'Starting backend with environment from .env' && npm start"]

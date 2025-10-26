
FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

RUN mkdir -p public uploads

EXPOSE 8000

CMD ["npm", "start"]

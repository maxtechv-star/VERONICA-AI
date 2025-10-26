FROM node:18-alpine

WORKDIR /app

# Install dependencies for sqlite3 and other native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite

# Install yarn
RUN npm install -g yarn

# Copy package files
COPY package*.json ./
COPY yarn.lock ./

# Install dependencies using yarn
RUN yarn install --production

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 8000

# Start the application
CMD ["npm", "start"]

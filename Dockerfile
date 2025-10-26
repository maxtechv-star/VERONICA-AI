
FROM node:18-alpine

WORKDIR /app

# Install dependencies for sqlite3
RUN apk add --no-cache python3 make g++ sqlite

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p public uploads

# Expose port
EXPOSE 8000

# Start the application
CMD ["npm", "start"]

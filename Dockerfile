FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies inside the container
RUN npm ci --only=production

# Copy application files
COPY . .

# Default environment variables for Render
ENV NODE_ENV=production
ENV HEADLESS=true
ENV PORT=10000

# Expose Render port
EXPOSE 10000

# Start the dashboard and daily automation engine
CMD ["node", "src/server.js"]

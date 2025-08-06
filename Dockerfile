
# Use official Node 18 Alpine image
FROM node:18-alpine

# Install required system dependencies for Chromium
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    yarn \
    udev \
    bash \
    curl

# Set environment variables required by Puppeteer & Lighthouse
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    CHROME_PATH=/usr/bin/chromium-browser \
    LIGHTHOUSE_CHROMIUM_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

# Install Lighthouse globally
RUN npm install -g lighthouse

# Create app directory
WORKDIR /app
# Copy the rest of the code
COPY . .

# Copy and install dependencies
COPY package*.json ./
RUN npm install



# Expose Cloud Run port
ENV PORT=8080
EXPOSE 8080

# Start the app
CMD ["npm", "start"]

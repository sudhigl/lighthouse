FROM node:18

# Create app dir
WORKDIR /app

# Install dependencies
COPY index.js ./
COPY public ./public
COPY package*.json ./
RUN npm install

# Copy entire source
COPY . .

# Expose Cloud Run's required port
EXPOSE 8080

# Start app
CMD ["npm", "start"]

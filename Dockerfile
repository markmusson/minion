FROM node:22-alpine

WORKDIR /app

# Install OpenClaw
RUN npm install -g openclaw@2026.3.2-beta.1

# Copy config
COPY ./openclaw.json ./

# Expose gateway port
EXPOSE 18789

# Start gateway
CMD ["openclaw", "gateway", "start"]

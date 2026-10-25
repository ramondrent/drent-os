FROM node:22-alpine
WORKDIR /app
COPY media-bridge.cjs /app/media-bridge.cjs
USER node
EXPOSE 8767
CMD ["node", "/app/media-bridge.cjs", "/config/config.json"]

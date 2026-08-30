# Stage 1 — compile the static grid from images/
FROM node:20-alpine AS build
WORKDIR /app
COPY build.js style.css ./
COPY images ./images
RUN node build.js

# Stage 2 — serve the static output with nginx
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/public /usr/share/nginx/html
EXPOSE 8080

FROM nginx:alpine

WORKDIR /usr/share/nginx/html

COPY index.html \
     manifest.json \
     service_worker.js \
     ./

COPY js ./js
COPY css ./css
COPY icons ./icons

COPY nginx.conf /etc/nginx/conf.d/default.conf

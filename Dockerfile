# 1. Node versiyası
FROM node:20-alpine

# 2. Build üçün lazım olan alətlər
RUN apk add --no-cache python3 make g++ && \
    rm -rf /var/cache/apk/*

# 3. İş qovluğu
WORKDIR /app

# 4. Production mühiti
ENV NODE_ENV=production

# 5. Paket fayllarını kopyala
COPY package*.json ./

# 6. DÜZƏLİŞ: npm ci yerinə npm install istifadə edirik
# Bu, package-lock.json olmasa belə kitabxanaları quraşdıracaq
RUN npm install --omit=dev && \
    npm cache clean --force

# 7. Kodları kopyala
COPY . .

# 8. Təhlükəsizlik: Sahibliyi node istifadəçisinə ver
RUN chown -R node:node /app

# 9. Qeyri-root istifadəçiyə keç
USER node

# 10. Port
EXPOSE 10000

# 11. Başlat
CMD ["node", "server.js"]
